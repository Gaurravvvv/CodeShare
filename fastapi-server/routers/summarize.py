import os
import json
import tempfile
import subprocess
import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from groq import Groq
import redis.asyncio as redis

# Document parsing libraries
import pymupdf
from docx import Document
import pandas as pd

router = APIRouter()

CACHE_TTL = 3600
MAX_WORDS = 1200
MAX_INLINE_CODE_LENGTH = 100000

# Redis client (assumes REDIS_URL is in environment or uses default)
redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)

class SummarizeRequest(BaseModel):
    fileUrl: Optional[str] = None
    fileName: str
    inlineCode: Optional[str] = None

def get_file_extension(filename: str) -> str:
    if not filename: return ""
    return filename.split('.')[-1].lower()

def is_code_file(ext: str) -> bool:
    code_exts = [
        'js', 'jsx', 'ts', 'tsx', 'py', 'cpp', 'c', 'java', 'go', 'rs',
        'rb', 'php', 'swift', 'kt', 'html', 'css', 'scss', 'json', 'yaml',
        'yml', 'xml', 'sql', 'sh', 'bat', 'ps1', 'r', 'lua', 'dart',
    ]
    return ext in code_exts

def is_text_file(ext: str) -> bool:
    return ext in ['txt', 'md', 'markdown', 'log', 'csv']

def truncate_text(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + "..."

# Extraction functions
def extract_pdf(buffer: bytes) -> str:
    doc = pymupdf.open("pdf", buffer)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def extract_docx(buffer: bytes) -> str:
    import io
    doc = Document(io.BytesIO(buffer))
    return "\n".join([para.text for para in doc.paragraphs])

def extract_xlsx(buffer: bytes) -> str:
    import io
    dfs = pd.read_excel(io.BytesIO(buffer), sheet_name=None)
    sheets = []
    for sheet_name, df in dfs.items():
        csv = df.to_csv(index=False)
        sheets.append(f"[Sheet: {sheet_name}]\n{csv}")
    return "\n\n".join(sheets)

def extract_pptx(buffer: bytes) -> str:
    # Requires LibreOffice on system
    with tempfile.TemporaryDirectory(prefix="pptx-summarize-") as tempdir:
        input_path = os.path.join(tempdir, "input.pptx")
        with open(input_path, "wb") as f:
            f.write(buffer)
        
        command = ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tempdir, input_path]
        try:
            subprocess.run(command, check=True, timeout=45, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            raise Exception("File conversion failed")
        
        pdf_path = os.path.join(tempdir, "input.pdf")
        with open(pdf_path, "rb") as f:
            pdf_buffer = f.read()
            
    return extract_pdf(pdf_buffer)

@router.post("")
async def summarize_file(req: SummarizeRequest):
    if not req.fileUrl and not req.inlineCode:
        raise HTTPException(status_code=400, detail="fileName and either fileUrl or inlineCode are required")
    
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise HTTPException(status_code=503, detail="AI summarization not configured. Set GROQ_API_KEY.")
    
    ext = get_file_extension(req.fileName)
    cache_key = ""
    
    if req.inlineCode:
        if len(req.inlineCode) > MAX_INLINE_CODE_LENGTH:
            raise HTTPException(status_code=400, detail=f"Inline code too large (max {MAX_INLINE_CODE_LENGTH/1000}KB)")
        cache_key = f"summary:inline:{req.fileName}:{len(req.inlineCode)}"
    else:
        cache_key = f"summary:{req.fileName}:{req.fileUrl.split('?')[0]}"
        
    # Check cache
    if not req.inlineCode:
        cached = await redis_client.get(cache_key)
        if cached:
            try:
                return json.loads(cached)
            except:
                return {"summary": cached, "warnings": []}
                
    # Extract text
    extracted_text = ""
    if req.inlineCode:
        extracted_text = req.inlineCode
    else:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(req.fileUrl, timeout=30)
                resp.raise_for_status()
                buffer = resp.content
            except Exception as e:
                raise HTTPException(status_code=400, detail="Failed to fetch file")
                
        if is_code_file(ext) or is_text_file(ext):
            extracted_text = buffer.decode("utf-8", errors="ignore")
        elif ext == "pdf":
            extracted_text = extract_pdf(buffer)
        elif ext == "docx":
            extracted_text = extract_docx(buffer)
        elif ext in ["xlsx", "xls"]:
            extracted_text = extract_xlsx(buffer)
        elif ext == "pptx":
            try:
                extracted_text = extract_pptx(buffer)
            except:
                raise HTTPException(status_code=500, detail="Failed to parse PPTX")
        elif ext in ["png", "jpg", "jpeg", "gif", "svg", "webp", "mp4", "webm", "mp3", "wav", "ogg"]:
            extracted_text = f"This is a media file (.{ext}). Media files cannot be parsed for text summarization."
        else:
            raise HTTPException(status_code=400, detail=f"File type .{ext} is not supported")
            
    if not extracted_text or not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract any text from this file")
        
    truncated = truncate_text(extracted_text.strip(), MAX_WORDS)
    is_code = is_code_file(ext)
    
    prompt = ""
    if is_code:
        prompt = """Analyze the following code and return a JSON object with exactly two fields:
1. "summary" - one short paragraph explaining what this code does
2. "warnings" - an array of strings, each describing a potential error, bug, or security issue found. If none, return empty array.
Return only raw JSON. No markdown."""
    else:
        prompt = "Summarize what this document is about in one short paragraph. Do not ask questions or offer further help."
        
    groq = Groq(api_key=groq_api_key)
    try:
        completion = groq.chat.completions.create(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": truncated}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=1024
        )
        groq_response = completion.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate summary")
        
    result = {}
    if is_code:
        try:
            result = json.loads(groq_response)
            if "warnings" not in result:
                result["warnings"] = []
        except:
            # Fallback parsing
            import re
            match = re.search(r'\{[\s\S]*\}', groq_response)
            if match:
                try:
                    result = json.loads(match.group(0))
                    if "warnings" not in result:
                        result["warnings"] = []
                except:
                    result = {"summary": "Failed to parse AI response", "warnings": []}
            else:
                result = {"summary": groq_response, "warnings": []}
    else:
        result = {"summary": groq_response, "warnings": []}
        
    if not req.inlineCode:
        await redis_client.setex(cache_key, CACHE_TTL, json.dumps(result))
        
    return result

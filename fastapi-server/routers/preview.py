import os
import tempfile
import subprocess
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter()

MAX_PPTX_SIZE = 50 * 1024 * 1024

class PreviewRequest(BaseModel):
    url: str

@router.post("/pptx")
async def preview_pptx(req: PreviewRequest):
    if not req.url:
        raise HTTPException(status_code=400, detail="url is required in request body")
        
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(req.url, timeout=30)
            resp.raise_for_status()
            buffer = resp.content
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid file URL")
            
    if len(buffer) > MAX_PPTX_SIZE:
        raise HTTPException(status_code=400, detail="File too large for conversion")
        
    with tempfile.TemporaryDirectory(prefix="pptx-preview-") as tempdir:
        input_path = os.path.join(tempdir, "input.pptx")
        with open(input_path, "wb") as f:
            f.write(buffer)
            
        command = ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tempdir, input_path]
        try:
            subprocess.run(command, check=True, timeout=45, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            raise HTTPException(status_code=500, detail="Failed to convert PPTX to PDF")
            
        pdf_path = os.path.join(tempdir, "input.pdf")
        if not os.path.exists(pdf_path):
            raise HTTPException(status_code=500, detail="Conversion succeeded but PDF not found")
            
        with open(pdf_path, "rb") as f:
            pdf_buffer = f.read()
            
    return Response(content=pdf_buffer, media_type="application/pdf", headers={
        "Content-Disposition": 'inline; filename="preview.pdf"'
    })

# AI Code Analysis Agent Flow

This diagram illustrates the flow for the upgraded AI Summarization and Code Analysis feature.

```mermaid
sequenceDiagram
    participant User
    participant Client (React)
    participant Redis Cache
    participant Gateway (Node.js)
    participant Worker (FastAPI)
    participant S3 Storage
    participant Groq (Llama 3)
    
    User->>Client (React): Clicks "AI Summarize" button
    Client (React)->>Gateway (Node.js): POST /api/summarize { fileUrl, fileName }
    
    Gateway (Node.js)->>Redis Cache: GET summary:{fileName}:{fileUrl}
    
    alt Cache Hit
        Redis Cache-->>Gateway (Node.js): Returns cached JSON string
        Gateway (Node.js)-->>Client (React): Returns { summary, warnings }
    else Cache Miss
        Gateway (Node.js)->>Worker (FastAPI): Forward POST /api/summarize
        
        Worker (FastAPI)->>S3 Storage: Fetch file via fileUrl
        S3 Storage-->>Worker (FastAPI): Returns file content
        
        Worker (FastAPI)->>Worker (FastAPI): Extract and Truncate Text (PyMuPDF, docx, etc.)
        
        alt is Code File (js, py, cpp, etc.)
            Worker (FastAPI)->>Groq (Llama 3): Prompt: return JSON object with "summary" and "warnings"
            Groq (Llama 3)-->>Worker (FastAPI): Returns JSON { "summary": "...", "warnings": [...] }
            Worker (FastAPI)->>Worker (FastAPI): Try/Catch parse JSON
        else is Document File (pdf, docx, etc.)
            Worker (FastAPI)->>Groq (Llama 3): Prompt: return plain text summary
            Groq (Llama 3)-->>Worker (FastAPI): Returns plain string summary
            Worker (FastAPI)->>Worker (FastAPI): Wrap in JSON { "summary": "...", "warnings": [] }
        end
        
        Worker (FastAPI)-->>Gateway (Node.js): Returns parsed AI response
        Gateway (Node.js)->>Redis Cache: SET cached JSON string (1 hr TTL)
        Gateway (Node.js)-->>Client (React): Returns { summary, warnings }
    end
    
    Client (React)->>Client (React): Update SummaryCache State
    
    alt is Code File and warnings.length > 0
        Client (React)->>User: Renders SummaryCard (✨ Summary & ⚠️ Warnings sections)
    else is Document File or warnings.length == 0
        Client (React)->>User: Renders SummaryCard (✨ Summary section only)
    end
```

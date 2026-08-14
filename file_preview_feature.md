# File Preview Feature — Architecture & Implementation

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Frontend["Frontend (React + Vite)"]
        FL["FileList.jsx"] -->|"User clicks 👁 View"| FPM["FilePreviewModal"]
        FPM -->|"Detect file type"| FTD{"File Type Router"}
        
        FTD -->|"PDF"| PDFR["PDF Renderer (pdfjs-dist)"]
        FTD -->|"DOCX"| DOCR["DOCX Renderer (mammoth.js)"]
        FTD -->|"XLSX/CSV"| XLSR["Spreadsheet Renderer (SheetJS)"]
        FTD -->|"PPTX"| PPTX_REQ["POST /api/preview/pptx"]
        FTD -->|"Image"| IMGR["<img> tag"]
        FTD -->|"Video"| VIDR["<video> player"]
        FTD -->|"Audio"| AUDR["<audio> player"]
        FTD -->|"Other"| UNSR["Unsupported message + download btn"]
        
        PPTX_REQ -->|"Receives PDF buffer"| PDFR
    end

    subgraph Backend["Backend Microservices"]
        NODE["Node.js Gateway /api/preview/pptx"] -->|"1. Forward POST"| FASTAPI["FastAPI /api/preview/pptx"]
        FASTAPI -->|"2. Fetch PPTX from URL"| S3["AWS S3 (presigned URL)"]
        FASTAPI -->|"3. Convert with LibreOffice"| LO["libreoffice --headless --convert-to pdf"]
        LO -->|"4. Return PDF binary"| FASTAPI
        FASTAPI -->|"5. Return PDF binary"| NODE
    end

    PPTX_REQ -.->|"HTTP POST { url }"| NODE

    style Frontend fill:#0d1117,stroke:#00ff41,color:#e0e0e0
    style Backend fill:#0d1117,stroke:#00ffff,color:#e0e0e0
```

## Files Changed / Created

| File | Action | Purpose |
|------|--------|---------|
| [FilePreviewModal.jsx](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/client/src/components/FilePreviewModal.jsx) | **Created** | Modal component with type-specific renderers |
| [FilePreviewModal.css](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/client/src/components/FilePreviewModal.css) | **Created** | Premium styling for the preview modal |
| [FileList.jsx](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/client/src/components/FileList.jsx) | **Modified** | Added 👁 View button next to each file |
| [FileList.css](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/client/src/components/FileList.css) | **Modified** | Added styles for the View button |
| [api.js](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/client/src/utils/api.js) | **Modified** | Added `convertPptxToPdf()` API function |
| [client/package.json](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/client/package.json) | **Modified** | Added `pdfjs-dist`, `mammoth`, `xlsx` |
| [preview.js](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/server/src/routes/preview.js) | **Modified** | Express route modified to forward PPTX requests to FastAPI |
| [server/src/index.js](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/server/src/index.js) | **Modified** | Mounted the preview route |
| [fastapi-server/routers/preview.py](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/fastapi-server/routers/preview.py) | **Created** | FastAPI route for LibreOffice PPTX→PDF conversion |
| [fastapi-server/Dockerfile](file:///c:/Users/VICTUS/OneDrive/Desktop/Internship/Personal/Code%20Share/fastapi-server/Dockerfile) | **Created** | Dedicated Python container with LibreOffice headless |

## What Was NOT Changed

- ✅ Socket.IO events and room logic — untouched
- ✅ Redis state management — untouched  
- ✅ S3/Filebase upload flow — untouched
- ✅ Docker Compose structure — untouched (no new services)
- ✅ All existing components unrelated to file preview — untouched

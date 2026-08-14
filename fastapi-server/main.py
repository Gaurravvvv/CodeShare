import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load env vars (mostly for GROQ_API_KEY, REDIS_URL, FILEBASE credentials)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "server", ".env"))

app = FastAPI(title="CodeShare FastAPI Server")

# Allow CORS for the Node proxy or Frontend directly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to Node internal IP / Client URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "fastapi"}

from routers import summarize, preview, cron

app.include_router(summarize.router, prefix="/api/summarize")
app.include_router(preview.router, prefix="/api/preview")
app.include_router(cron.router, prefix="/api/rooms/cron")

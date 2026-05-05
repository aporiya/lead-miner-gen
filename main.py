import os
import re
import secrets
import time
import csv
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from firecrawl import FirecrawlApp
import logging
from dotenv import load_dotenv

from leadgen import build_prompt, extract_leads, save_to_csv, extract_leads_from_result

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Lead Miner API")

# ── Security headers middleware ─────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "connect-src 'self'"
    )
    return response

# ── CSRF token store (single-user, in-memory) ───────────────────
_csrf_token: str = ""
_csrf_token_created: float = 0
CSRF_TOKEN_TTL = 3600  # 1 hour

def _generate_csrf_token() -> str:
    global _csrf_token, _csrf_token_created
    _csrf_token = secrets.token_hex(32)
    _csrf_token_created = time.time()
    return _csrf_token

def _validate_csrf_token(token: str) -> bool:
    if not _csrf_token:
        return False
    if time.time() - _csrf_token_created > CSRF_TOKEN_TTL:
        return False
    return secrets.compare_digest(token, _csrf_token)

@app.get("/api/csrf-token")
async def get_csrf_token():
    return {"token": _generate_csrf_token()}

# ── Rate limiting (simple in-memory, single-user) ───────────────
_rate_limit_store: dict = {}
RATE_LIMIT_SCRAPE = 10
RATE_LIMIT_WINDOW = 60

def _check_rate_limit(key: str, limit: int, window: int) -> bool:
    now = time.time()
    timestamps = _rate_limit_store.get(key, [])
    timestamps = [t for t in timestamps if now - t < window]
    if len(timestamps) >= limit:
        return False
    timestamps.append(now)
    _rate_limit_store[key] = timestamps
    return True

# ── Initialize Firecrawl App ────────────────────────────────────
api_key = os.getenv("FIRECRAWL_API_KEY")
if not api_key:
    logger.error("FIRECRAWL_API_KEY environment variable is not set.")
    raise RuntimeError("FIRECRAWL_API_KEY is required — set it in your .env file")

try:
    firecrawl_app = FirecrawlApp(api_key=api_key)
except Exception as e:
    logger.error(f"Failed to initialize FirecrawlApp: {e}")
    raise RuntimeError(f"Firecrawl initialization failed: {e}") from e

# ── Custom exceptions ────────────────────────────────────────────
class AppError(Exception):
    def __init__(self, message: str, code: str = "INTERNAL_ERROR", status: int = 500):
        self.message = message
        self.code = code
        self.status = status
        super().__init__(message)

class ConfigurationError(AppError):
    def __init__(self, message: str):
        super().__init__(message, code="CONFIGURATION_ERROR", status=503)

class ExtractionError(AppError):
    def __init__(self, message: str):
        super().__init__(message, code="EXTRACTION_ERROR", status=502)

class RateLimitError(AppError):
    def __init__(self):
        super().__init__("Too many requests. Please wait a moment.", code="RATE_LIMITED", status=429)

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status,
        content={"detail": exc.message, "code": exc.code},
    )

# ── Schemas ──────────────────────────────────────────────────────
class ScrapeRequest(BaseModel):
    num_leads: int = Field(..., ge=1, le=100, description="Number of leads to extract (1-100)")
    niche: str = Field(..., min_length=2, max_length=500, description="Specific niche or keywords for target businesses")
    industry: str = Field(..., min_length=2, max_length=200, description="General industry category")
    location: str = Field(..., min_length=2, max_length=200, description="Geographical location for leads")

    class Config:
        json_schema_extra = {
            "example": {
                "num_leads": 5,
                "niche": "food processing plants, snack factories",
                "industry": "Manufacturing",
                "location": "Maharashtra, India",
            }
        }

# ── Filename sanitization ────────────────────────────────────────
def sanitize_filename(filename: str) -> str:
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', filename)
    safe = safe[:255]
    safe = os.path.basename(safe)
    return safe or "leads.csv"

# ── Endpoints ────────────────────────────────────────────────────
@app.post("/api/scrape")
async def scrape_leads(req: ScrapeRequest, request: Request):
    if not _check_rate_limit("scrape", RATE_LIMIT_SCRAPE, RATE_LIMIT_WINDOW):
        raise RateLimitError()

    csrf_header = request.headers.get("X-CSRF-Token", "")
    if not _validate_csrf_token(csrf_header):
        raise AppError("Invalid or missing CSRF token", code="CSRF_INVALID", status=403)

    if not firecrawl_app:
        raise ConfigurationError("Firecrawl application is not configured. Check API key.")

    logger.info(
        f"Received scrape request: num_leads={req.num_leads}, "
        f"industry={req.industry[:40]!r}, location={req.location[:40]!r}"
    )

    prompt = build_prompt(req.num_leads, req.niche, req.industry, req.location)

    try:
        result = extract_leads(firecrawl_app, prompt)
    except RuntimeError as e:
        raise ExtractionError(str(e)) from e

    csv_file_path = save_to_csv(result, req.industry, req.location)

    if not csv_file_path or not os.path.exists(csv_file_path):
        raise AppError("Failed to save the CSV file or no leads were found.", code="CSV_ERROR")

    logger.info("Returning JSON with leads and CSV path.")

    leads = extract_leads_from_result(result)

    return {
        "leads": leads,
        "download_url": f"/api/download/{os.path.basename(csv_file_path)}",
    }

@app.get("/api/download/{filename}")
async def download_csv(filename: str):
    if not _check_rate_limit("download", 30, RATE_LIMIT_WINDOW):
        raise RateLimitError()

    safe_filename = sanitize_filename(filename)
    csv_file_path = os.path.join("output", safe_filename)

    real_path = os.path.realpath(csv_file_path)
    if not real_path.startswith(os.path.realpath("output")):
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=real_path,
        media_type='text/csv',
        filename=safe_filename,
    )

@app.get("/api/csv-files")
async def list_csv_files():
    """List all CSV files in the output directory with metadata."""
    output_dir = "output"
    if not os.path.exists(output_dir):
        return {"files": []}

    files = []
    for filename in os.listdir(output_dir):
        if filename.endswith(".csv"):
            file_path = os.path.join(output_dir, filename)
            stat = os.stat(file_path)
            
            # Count records in CSV
            record_count = 0
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    reader = csv.reader(f)
                    next(reader, None)  # Skip header
                    record_count = sum(1 for _ in reader)
            except Exception:
                record_count = 0
            
            files.append({
                "filename": filename,
                "created_at": stat.st_ctime,
                "modified_at": stat.st_mtime,
                "size": stat.st_size,
                "record_count": record_count
            })
    
    # Sort by modified date, newest first
    files.sort(key=lambda x: x["modified_at"], reverse=True)
    return {"files": files}

@app.get("/api/csv-file/{filename}")
async def get_csv_file(filename: str):
    """Get the contents of a specific CSV file."""
    safe_filename = sanitize_filename(filename)
    csv_file_path = os.path.join("output", safe_filename)

    real_path = os.path.realpath(csv_file_path)
    if not real_path.startswith(os.path.realpath("output")):
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(real_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            data = list(reader)
            return {
                "filename": safe_filename,
                "headers": reader.fieldnames,
                "data": data
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read CSV: {str(e)}")

# Mount the static directory to serve the frontend
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

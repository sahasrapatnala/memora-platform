"""Independent processor. Deploy separately; not imported into the web app."""
import hashlib
import os
import tempfile
import json
import threading
from pathlib import Path
from uuid import UUID
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from cloud_download import MAX_ORIGINAL_BYTES, check_capacity, download_original, validate_source

app = FastAPI(title="MEMORA processing service")
download_slot = threading.Lock()

class SourceRequest(BaseModel):
    file_id: UUID
    workspace_id: UUID
    name: str = Field(max_length=255)
    source_url: str
    size_bytes: int = Field(gt=0, le=MAX_ORIGINAL_BYTES)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

def authorize(value):
    import secrets
    key = os.environ.get("PROCESSING_API_KEY")
    if not key or not secrets.compare_digest(value or "", f"Bearer {key}"):
        raise HTTPException(401, "Unauthorized")

@app.get("/health")
def health():
    scratch = Path(os.environ.get("PROCESSING_SCRATCH_DIR", tempfile.gettempdir()))
    import shutil
    return {"service": "memora-processor", "status": "available", "models_loaded": False,
            "max_original_bytes": MAX_ORIGINAL_BYTES,
            "scratch_free_bytes": shutil.disk_usage(scratch).free}

def extract_document(path):
    ext = path.suffix.lower()
    if ext == '.pdf':
        import fitz
        with fitz.open(path) as doc:
            return [{"page": i + 1, "text": page.get_text(), "content_hash": hashlib.sha256(page.get_text().encode()).hexdigest()} for i, page in enumerate(doc)]
    if ext == '.pptx':
        from pptx import Presentation
        return [{"slide": i + 1, "text": '\n'.join(shape.text for shape in slide.shapes if shape.has_text_frame)} for i, slide in enumerate(Presentation(path).slides)]
    from docx import Document
    return [{"paragraph": i + 1, "text": p.text} for i, p in enumerate(Document(path).paragraphs) if p.text]

@app.post('/retrieve')
@app.post('/process')
def process(source: SourceRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    ext = Path(source.name).suffix.lower()
    if ext not in {'.pdf', '.pptx', '.docx', '.mp4', '.mov'}:
        raise HTTPException(415, 'Unsupported format')
    origin = os.environ.get("PROCESSING_CLOUD_ORIGIN", "")
    scratch = Path(os.environ.get("PROCESSING_SCRATCH_DIR", tempfile.gettempdir()))
    try:
        validate_source(source.source_url, origin)
        check_capacity(scratch, source.size_bytes)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    if not download_slot.acquire(blocking=False):
        raise HTTPException(429, 'Another original is using the processing disk; retry later')

    def events():
        try:
            with tempfile.TemporaryDirectory(dir=scratch) as directory:
                path = Path(directory) / f'source{ext}'
                for event in download_original(source.source_url, path, source.size_bytes, source.sha256, origin):
                    yield json.dumps({"file_id": str(source.file_id), **event}) + '\n'
                if ext in {'.pdf', '.pptx', '.docx'}:
                    yield json.dumps({"stage": "Text extracted", "elements": extract_document(path),
                                      "preview_status": "Not implemented"}) + '\n'
                else:
                    yield json.dumps({"stage": "Video processing unavailable", "status": "Blocked",
                                      "error": "Video models, durable output storage and result ingestion are not configured"}) + '\n'
        except Exception:
            # Do not leak signed URLs or request credentials in streamed errors.
            yield json.dumps({"stage": "Retrieval failed", "status": "Failed",
                              "error": "Download, integrity verification or processing failed; no success recorded"}) + '\n'
        finally:
            download_slot.release()
    return StreamingResponse(events(), media_type='application/x-ndjson',
                             headers={"Cache-Control": "no-store"})

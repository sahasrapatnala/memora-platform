"""Independent processor. Deploy separately; not imported into the web app."""
import hashlib
import os
import tempfile
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, Header, HTTPException

app = FastAPI(title="MEMORA processing service")

def authorize(value):
    import secrets
    key = os.environ.get("PROCESSING_API_KEY")
    if not key or not secrets.compare_digest(value or "", f"Bearer {key}"):
        raise HTTPException(401, "Unauthorized")

@app.get("/health")
def health():
    return {"service": "memora-processor", "status": "available", "models_loaded": False}

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

@app.post('/process')
async def process(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    authorize(authorization)
    ext = Path(file.filename or '').suffix.lower()
    if ext not in {'.pdf', '.pptx', '.docx', '.mp4', '.mov', '.mkv', '.avi'}:
        raise HTTPException(415, 'Unsupported format')
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / f'source{ext}'
        size = 0
        digest = hashlib.sha256()
        with path.open('wb') as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > 50 * 1024 * 1024:
                    raise HTTPException(413, 'File exceeds configured 50 MB limit')
                digest.update(chunk)
                out.write(chunk)
        if not size:
            raise HTTPException(400, 'Empty original')
        if ext in {'.pdf', '.pptx', '.docx'}:
            return {"sha256": digest.hexdigest(), "original_size": size, "elements": extract_document(path), "rendered_previews": [], "preview_status": "Not implemented"}
        # Model work requires separately deployed compute and licensed/gated model access.
        # Never report successful video processing without the configured models.
        raise HTTPException(503, 'Video models and durable frame storage must be configured before video processing')

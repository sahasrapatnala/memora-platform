
"""Independent MEMORA processor. Deploy separately from the web app."""

import hashlib
import json
import os
import secrets
import shutil
import tempfile
import threading

from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from cloud_download import (
    MAX_ORIGINAL_BYTES,
    check_capacity,
    download_original,
    validate_source,
)
from video_processing import process_video


app = FastAPI(title="MEMORA processing service")

# Only one original may use the processing disk at a time.
download_slot = threading.Lock()


class SourceRequest(BaseModel):
    file_id: UUID
    workspace_id: UUID
    name: str = Field(max_length=255)
    source_url: str
    size_bytes: int = Field(gt=0, le=MAX_ORIGINAL_BYTES)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


def authorize(value: str | None):
    key = os.environ.get("PROCESSING_API_KEY")

    if not key or not secrets.compare_digest(
        value or "",
        f"Bearer {key}",
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health():
    scratch = Path(
        os.environ.get("PROCESSING_SCRATCH_DIR", tempfile.gettempdir())
    )

    return {
        "service": "memora-processor",
        "status": "available",
        "models_loaded": False,
        "max_original_bytes": MAX_ORIGINAL_BYTES,
        "scratch_free_bytes": shutil.disk_usage(scratch).free,
    }


def extract_document(path: Path):
    ext = path.suffix.lower()

    if ext == ".pdf":
        import fitz

        with fitz.open(path) as doc:
            return [
                {
                    "page": i + 1,
                    "text": page.get_text(),
                    "content_hash": hashlib.sha256(
                        page.get_text().encode()
                    ).hexdigest(),
                }
                for i, page in enumerate(doc)
            ]

    if ext == ".pptx":
        from pptx import Presentation

        return [
            {
                "slide": i + 1,
                "text": "\n".join(
                    shape.text
                    for shape in slide.shapes
                    if shape.has_text_frame
                ),
            }
            for i, slide in enumerate(Presentation(path).slides)
        ]

    from docx import Document

    return [
        {"paragraph": i + 1, "text": paragraph.text}
        for i, paragraph in enumerate(Document(path).paragraphs)
        if paragraph.text
    ]


def stream_source(
    source: SourceRequest,
    retrieve_only: bool = False,
):
    ext = Path(source.name).suffix.lower()

    if ext not in {".pdf", ".pptx", ".docx", ".mp4", ".mov"}:
        raise HTTPException(
            status_code=415,
            detail="Unsupported format",
        )

    origin = os.environ.get("PROCESSING_CLOUD_ORIGIN", "")

    scratch = Path(
        os.environ.get("PROCESSING_SCRATCH_DIR", tempfile.gettempdir())
    )

    try:
        validate_source(source.source_url, origin)
        check_capacity(scratch, source.size_bytes)
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from None

    def events():
        # Acquire the lock only after the streaming generator starts.
        # This prevents a cancelled request from leaving it permanently locked.
        if not download_slot.acquire(blocking=False):
            yield json.dumps({
                "file_id": str(source.file_id),
                "stage": "Processor busy",
                "status": "Busy",
                "error": "Another original is being processed. Retry later.",
            }) + "\n"
            return

        try:
            with tempfile.TemporaryDirectory(
                dir=scratch
            ) as directory:

                path = Path(directory) / f"source{ext}"

                # Download and verify the original.
                for event in download_original(
                    source.source_url,
                    path,
                    source.size_bytes,
                    source.sha256,
                    origin,
                ):
                    yield json.dumps({
                        "file_id": str(source.file_id),
                        **event,
                    }) + "\n"

                if retrieve_only:
                    yield json.dumps({
                        "file_id": str(source.file_id),
                        "stage": "Original verified",
                        "status": "Blocked",
                    }) + "\n"
                    return

                # Document processing.
                if ext in {".pdf", ".pptx", ".docx"}:
                    elements = extract_document(path)

                    yield json.dumps({
                        "file_id": str(source.file_id),
                        "stage": "Text extracted",
                        "elements": elements,
                        "preview_status": "Not implemented",
                    }) + "\n"
                    return

                # Video processing.
                result = process_video(
                    path,
                    Path(directory) / "video-results",
                    progress=lambda event: print(
                        json.dumps({
                            "file_id": str(source.file_id),
                            **event,
                        }),
                        flush=True,
                    ),
                )

                yield json.dumps({
                    "file_id": str(source.file_id),
                    "stage": "Video processed locally",
                    "status": "ProcessedLocally",
                    "language": result["transcript"]["language"],
                    "transcript_segments": len(
                        result["transcript"]["segments"]
                    ),
                    "duration_seconds": result["keyframes"]["duration_seconds"],
                    "keyframe_count": len(
                        result["keyframes"]["frames"]
                    ),
                }) + "\n"

        except Exception as error:
            # Keep internal exception details in the processor terminal.
            print(
                f"Processing failed for {source.file_id}: {error!r}",
                flush=True,
            )

            yield json.dumps({
                "file_id": str(source.file_id),
                "stage": "Processing failed",
                "status": "Failed",
                "error": (
                    "Download, integrity verification or processing failed. "
                    "No success was recorded."
                ),
            }) + "\n"

        finally:
            # Always release the processing lock after acquisition.
            download_slot.release()

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/retrieve")
def retrieve(
    source: SourceRequest,
    authorization: str | None = Header(default=None),
):
    authorize(authorization)
    return stream_source(source, retrieve_only=True)


@app.post("/process")
def process(
    source: SourceRequest,
    authorization: str | None = Header(default=None),
):
    authorize(authorization)
    return stream_source(source, retrieve_only=False)

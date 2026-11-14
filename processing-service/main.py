"""Independent MEMORA processor. Deploy separately from the web app."""
import json
import os
import secrets
import shutil
import tempfile
import threading
from pathlib import Path
from uuid import UUID

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from callbacks import send_failure, send_manifest, send_progress, upload_artifact, validate_callback_url
from cloud_download import MAX_ORIGINAL_BYTES, check_capacity, download_original, validate_source
from document_processing import extract_document
from video_processing import process_video

app = FastAPI(title="MEMORA processing service")
download_slot = threading.Lock()


class SourceRequest(BaseModel):
    file_id: UUID
    workspace_id: UUID
    name: str = Field(max_length=255)
    source_url: str
    size_bytes: int = Field(gt=0, le=MAX_ORIGINAL_BYTES)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class AttemptRequest(SourceRequest):
    job_id: UUID
    dispatch_token: UUID
    worker_id: str = Field(min_length=1, max_length=100)
    callback_url: str = Field(max_length=2000)


def authorize(value: str | None):
    key = os.environ.get("PROCESSING_API_KEY")
    if not key or not secrets.compare_digest(value or "", f"Bearer {key}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


def validate_request(source):
    ext = Path(source.name).suffix.lower()
    if ext not in {".pdf", ".pptx", ".docx", ".mp4", ".mov"}:
        raise HTTPException(status_code=415, detail="Unsupported format")
    origin = os.environ.get("PROCESSING_CLOUD_ORIGIN", "")
    scratch = Path(os.environ.get("PROCESSING_SCRATCH_DIR", tempfile.gettempdir()))
    try:
        validate_source(source.source_url, origin)
        check_capacity(scratch, source.size_bytes)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    return ext, scratch


@app.get("/health")
def health():
    scratch = Path(os.environ.get("PROCESSING_SCRATCH_DIR", tempfile.gettempdir()))
    return {"service": "memora-processor", "status": "available", "models_loaded": False,
            "max_original_bytes": MAX_ORIGINAL_BYTES, "scratch_free_bytes": shutil.disk_usage(scratch).free}


@app.post("/retrieve")
def retrieve(source: SourceRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    ext, scratch = validate_request(source)

    def events():
        if not download_slot.acquire(blocking=False):
            yield json.dumps({"file_id": str(source.file_id), "stage": "Processor busy",
                              "status": "Busy", "error": "Another original is being processed. Retry later."}) + "\n"
            return
        try:
            with tempfile.TemporaryDirectory(dir=scratch) as directory:
                path = Path(directory) / f"source{ext}"
                for event in download_original(source.source_url, path, source.size_bytes,
                                               source.sha256, os.environ.get("PROCESSING_CLOUD_ORIGIN", "")):
                    yield json.dumps({"file_id": str(source.file_id), **event}) + "\n"
                yield json.dumps({"file_id": str(source.file_id), "stage": "Original verified",
                                  "status": "Blocked"}) + "\n"
        except Exception as error:
            print(f"Retrieval failed for {source.file_id}: {error!r}", flush=True)
            yield json.dumps({"file_id": str(source.file_id), "stage": "Processing failed",
                              "status": "Failed", "error": "Download or integrity verification failed."}) + "\n"
        finally:
            download_slot.release()

    return StreamingResponse(events(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store"})


def execute_attempt(source: AttemptRequest, ext: str, scratch: Path):
    """Run after the 202 response; only fenced callbacks can change application records."""
    if not download_slot.acquire(blocking=False):
        send_failure(source, "ProcessorFailed")
        return
    phase = "download"
    try:
        with tempfile.TemporaryDirectory(dir=scratch) as directory:
            path = Path(directory) / f"source{ext}"
            for event in download_original(source.source_url, path, source.size_bytes, source.sha256,
                                           os.environ.get("PROCESSING_CLOUD_ORIGIN", "")):
                received = event.get("received_bytes", 0)
                send_progress(source, "Downloading original" if event["stage"] == "Downloading original" else "Original verified",
                              min(20, int(received / source.size_bytes * 20)))

            if ext in {".mp4", ".mov"}:
                phase = "extraction"
                stage_progress = {"Extracting audio": 25, "Transcribing audio": 45,
                                  "Extracting keyframes": 65}

                def progress(event):
                    stage = event["stage"]
                    amount = stage_progress.get(stage, 30)
                    if stage == "Transcribing audio":
                        amount = min(60, 30 + event.get("segments", 0) // 20)
                    if stage == "Extracting keyframes":
                        amount = min(75, 60 + event.get("frames", 0) // 5)
                    send_progress(source, stage, amount)

                manifest = process_video(path, Path(directory) / "video-results", progress=progress)
                phase = "artifact upload"
                uploaded_frames = []
                for index, frame in enumerate(manifest["frames"]):
                    uploaded = upload_artifact(source, frame["path"], "frame")
                    thumbnail = upload_artifact(source, frame["thumbnail_local_path"], "thumbnail")
                    uploaded_frames.append({"timestamp_seconds": frame["timestamp_seconds"],
                                            "storage_path": uploaded["path"], "size_bytes": uploaded["size_bytes"],
                                            "sha256": uploaded["sha256"], "thumbnail_path": thumbnail["path"],
                                            "thumbnail_size_bytes": thumbnail["size_bytes"],
                                            "thumbnail_sha256": thumbnail["sha256"]})
                    send_progress(source, "Uploading frame artifacts", min(95, 75 + int((index + 1) / len(manifest["frames"]) * 20)))
                manifest["frames"] = uploaded_frames
            else:
                phase = "extraction"
                send_progress(source, "Extracting document", 35)
                manifest = extract_document(path)
                send_progress(source, "Extracting document", 90)

            phase = "persistence"
            send_progress(source, "Persisting results", 97)
            send_manifest(source, manifest)
    except Exception as error:
        print(f"Processing failed for {source.job_id}: {error!r}", flush=True)
        category = "ProcessorFailed"
        if phase == "download":
            category = "IntegrityFailed" if "SHA-256" in str(error) or "size" in str(error).lower() else "DownloadFailed"
        elif phase == "artifact upload":
            category = "DeliveryUncertain"
        elif phase == "persistence":
            category = "PersistenceFailed"
        send_failure(source, category)
    finally:
        download_slot.release()


@app.post("/process", status_code=202)
def process(source: AttemptRequest, background: BackgroundTasks, authorization: str | None = Header(default=None)):
    authorize(authorization)
    ext, scratch = validate_request(source)
    try:
        validate_callback_url(source.callback_url)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    background.add_task(execute_attempt, source, ext, scratch)
    return JSONResponse(status_code=202, content={"accepted": True, "job_id": str(source.job_id)})

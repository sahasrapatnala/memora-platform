# MEMORA independent processor

This FastAPI service runs separately from the web application. Originals upload directly to private Cloud Storage with TUS; FastAPI never accepts multipart originals. `/retrieve` performs bounded-memory verification only. `/process` accepts a fenced attempt descriptor, returns HTTP 202, then performs extraction and authenticated callbacks.

## Processing contract

The dispatcher supplies `file_id`, `workspace_id`, `job_id`, `dispatch_token`, `worker_id`, `name`, `source_url`, `size_bytes`, `sha256` and `callback_url`. Source URLs are expiring private Cloud URLs. The worker downloads in 1 MiB chunks, rejects redirects and foreign origins, verifies bytes and SHA-256, and checks scratch capacity before admission. One original is processed per service process.

Progress callbacks renew the attempt lease. JPEG frames and thumbnails are uploaded individually to the application's authenticated artifact callback (maximum 2 MiB each). The final manifest is bounded to 8 MiB by the application and contains actual transcript segments, timestamps, content hashes, frame receipts, PDF pages or PPTX slides. Extraction alone never marks a job Completed; the application must validate and persist the complete manifest.

Video uses Faster-Whisper and OpenCV. Up to 60 perceptually distinct frames are sampled across the entire duration. Speaker attribution is marked unavailable until a reliable diarization implementation is enabled. PDF extraction preserves empty pages and marks them OCR-required. PPTX extraction preserves slide text, titles, tables and notes. DOCX uses one logical extraction page because visual pagination is unavailable.

## Environment variable names

- `PROCESSING_API_KEY`: private shared bearer credential for worker and application callbacks.
- `PROCESSING_CLOUD_ORIGIN`: exact HTTPS origin of the connected Cloud Storage service.
- `PROCESSING_CALLBACK_ORIGIN`: exact allowed application origin; loopback HTTP is permitted for local development.
- `PROCESSING_SCRATCH_DIR`: dedicated writable scratch directory with at least twice the largest original plus 1 GiB free.
- `HF_TOKEN`: optional model-provider credential if an authorized diarization model is separately configured; not required by the current transcription-only speaker state.

The worker must never receive `SUPABASE_SERVICE_ROLE_KEY` or any browser-visible `VITE_` credential.

## Local PowerShell

```powershell
cd processing-service
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
$env:PROCESSING_API_KEY = "<set-a-private-shared-value>"
$env:PROCESSING_CLOUD_ORIGIN = "<connected-cloud-https-origin>"
$env:PROCESSING_CALLBACK_ORIGIN = "http://127.0.0.1:8080"
$env:PROCESSING_SCRATCH_DIR = "<dedicated-writable-scratch-directory>"
uvicorn main:app --host 127.0.0.1 --port 8000
```

FFmpeg must be installed and available on `PATH`. For the CPU-only hackathon, install `requirements-demo.txt` instead; it omits unused diarization and pins the PyAV version verified with Faster-Whisper. Run unit tests with `python -m unittest test_cloud_download test_service test_rules test_documents test_callbacks test_demo_extract`. `test_api_local.py` is an opt-in real-video extraction smoke test and requires `test-output/memora-api-test.mp4`; it does not test database persistence.

`GET /health` reports liveness only. `GET /ready` requires the private bearer and loads the actual CPU Whisper model, checks FFmpeg, extraction imports and scratch capacity. Run this once locally to download/warm the model before dispatch. A busy worker returns 503; a failed readiness check never reports ready. The application checks authenticated readiness before claiming an approved job.

Actual local-file command (no Cloud writes): `python demo_extract.py "C:\Demo\speech.mp4" --output "C:\Demo\video-evidence"`. Output must be a new directory. It saves timestamps, genuine frames/thumbnails, hashes and clearly labeled local evidence. Silent video does not pass speech acceptance. Full PowerShell/tunnel/demo steps and current blockers are in `docs/hackathon-demo.md` at the project root.

Worker retrieval restarts from the beginning after interruption; this is distinct from resumable browser uploads. Deployment, model download, real-video processing, application callback authentication and durable ingestion must all be verified before enabling production dispatch.

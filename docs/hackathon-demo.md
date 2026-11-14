# MEMORA hackathon demo: real video first

## Saved changes
Authenticated `/ready` loads the existing small CPU/int8 Whisper model and checks FFmpeg, dependencies and scratch capacity. Dispatcher checks readiness before claiming an approved job and refuses redirects. `demo_extract.py` extracts real local files and measures hashes/JPEG sizes without Cloud writes. CPU-only dependencies omit unused diarization; av==18.1.0 fixes the reproduced PyAV 19 mismatch.

Files changed: processing-service/{main.py,requirements-demo.txt,demo_extract.py,test_demo_extract.py,test_service.py,test_video.py,README.md}; src/lib/memora/{worker-readiness.server.ts,processing-dispatch.server.ts}; src/test/worker-readiness.test.ts; AGENTS.md; roadmap.md; docs/hackathon-demo.md.

No migrations applied, worker deployed, tunnel opened, gates enabled, original modified or Cloud data written. Design and repository connection preserved.

## Exact local PowerShell commands
From the existing checkout; replace actual file paths. Windows commands are provided but not executed on Windows here.

```powershell
Set-Location processing-service
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-demo.txt
ffmpeg -version
python demo_extract.py "C:\Demo\speech.mp4" --output "C:\Demo\video-evidence"
python demo_extract.py "C:\Demo\document.pdf" --output "C:\Demo\pdf-evidence"
python demo_extract.py "C:\Demo\presentation.pptx" --output "C:\Demo\pptx-evidence"
Copy-Item "C:\Demo\document.pdf" "C:\Demo\document-copy.pdf"
Get-FileHash "C:\Demo\document.pdf","C:\Demo\document-copy.pdf" -Algorithm SHA256
```

Hashes must match. Output folders must be new. Local evidence contains source text; keep it private. Silent video cannot pass speech acceptance. First transcription downloads the model. If FFmpeg is missing: `winget install --id Gyan.FFmpeg --exact`, then reopen the terminal.

## Start the worker securely
In the activated terminal:
```powershell
$credential = Read-Host "Private shared processor credential" -AsSecureString
$env:PROCESSING_API_KEY = [System.Net.NetworkCredential]::new("", $credential).Password
$env:PROCESSING_CLOUD_ORIGIN = Read-Host "Exact connected private storage HTTPS origin"
$env:PROCESSING_CALLBACK_ORIGIN = Read-Host "Reachable MEMORA app HTTPS origin without path"
$env:PROCESSING_SCRATCH_DIR = Join-Path $env:TEMP "memora-demo-scratch"
New-Item -ItemType Directory -Force $env:PROCESSING_SCRATCH_DIR | Out-Null
python -c "from video_processing import get_model; get_model(); print('CPU model loaded')"
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1
```
Use the same private randomly generated credential in Cloud secrets and locally; never print or commit it. No service-role key belongs on the PC. Scratch admission requires twice original size plus 1 GiB. One process, no reload.

Second terminal:
```powershell
$credential = Read-Host "Same private processor credential" -AsSecureString
$key = [System.Net.NetworkCredential]::new("", $credential).Password
Invoke-RestMethod "http://127.0.0.1:8000/ready" -Headers @{Authorization="Bearer $key"}
cloudflared tunnel --url http://127.0.0.1:8000
```
Install cloudflared beforehand if unavailable. The tunnel command is a future user-run action, not executed here. Keep both terminals open; use its actual temporary HTTPS origin. `/ready`, `/process` and `/retrieve` require the bearer; `/health` exposes liveness only. Check unauthenticated `/ready` returns 401 and authenticated `/ready` returns true through the tunnel. A restarted tunnel requires updating PROCESSING_API_URL. Stop it after the demo.

## Configuration, approval and demo sequence
Cloud app names: PROCESSING_API_URL (actual tunnel HTTPS origin), PROCESSING_API_KEY (shared private bearer), PROCESSING_CALLBACK_URL (reachable app origin plus /api/public/processing). Worker names: PROCESSING_API_KEY, PROCESSING_CLOUD_ORIGIN, PROCESSING_CALLBACK_ORIGIN, PROCESSING_SCRATCH_DIR. AI uses existing LOVABLE_API_KEY.
Managed app names: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Platform-managed SUPABASE_SERVICE_ROLE_KEY is used only by the generated privileged application client; users must never retrieve/provide it or send it to the PC. No HF_TOKEN needed.
Configure private values through Cloud secrets. Hosted Cloud cannot call PC loopback. Worker tunnel does not publish the app; callbacks must reach the running version with current endpoints. A local app needs a separately approved reachable callback connection.

Smallest safe persistence path: reconcile unlisted historical 0009; review docs/sql-review/dispatch-v3.sql first, processing-ingestion-v4.sql second, source-summaries-v7.sql third; regenerate managed types. No SQL changed/applied here. Do not bypass missing live claim/receipt/finalization controls. Duplicate-retention-v5 needs separate review for persisted recommendations; offboarding-v6 is unnecessary for this demo.
MEMORA_PROCESSING_ENABLED stays absent/false pending review/configuration/demo authorization. MEMORA_RETENTION_ENABLED stays absent/false: approval demonstration only, never physical deletion.

After approvals: upload short speech MP4; request review; reviewer approves with reason; warm/check worker; dispatch selected job; inspect transcript, timestamp seek and genuine frames; generate source brief and check topic/key-moment citations; refresh and reopen. Repeat for PDF/PPTX and verify numbered pages/slides, notes and hashes. Search real extracted words; Ask a question explicitly answered in sources and compare filename/timestamp/page/slide citations. Upload an exact copy; show measured bytes/hash evidence; approve retention without deletion. Potential savings are not reclaimed storage; matching pages do not authorize whole-file deletion.

## Test evidence and remaining blockers
102 app tests across 16 suites and 30 Python tests passed. Most lifecycle/callback tests use mocked IO.
Actual local extraction: 12.133-second MP4, one English timestamped segment (0–11 seconds), 59 genuine OpenCV JPEG frames/thumbnails. Public JFK speech from OpenAI Whisper tests (https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac) combined with synthetic FFmpeg test-pattern visuals. Not uploaded business evidence. Genuine small CPU/int8 inference, not mocked transcription.
Actual local PDF: two extracted pages. PPTX: one slide with title/text/notes. Generated fixtures clearly labeled test data. Copied PDF original SHA-256 matches exactly. No fixtures added to Cloud.
Actual local HTTP: unauthorized /ready 401; authenticated /ready 200 after actual model loading. Temporary process stopped; no public tunnel created.
Fixed and reran the reproduced PyAV 19/Faster-Whisper failure using av==18.1.0. Preview build OK.

Blocked: reviewed migration approval; configured reachable app/worker origins and private credential; real uploaded speech MP4/PDF/PPTX through Cloud dispatch, persistence, private artifact readback and refresh; populated navigation, source-backed Ask and second-account denial. Saved-summary search is not connected; source keyword search exists. OCR, diarization and embeddings unavailable. No 1.14 GB inference/retrieval claim. Next: review the existing v3/v4/v7 sequence and connect the authenticated local tunnel, then run controlled uploaded-file acceptance; do not enable automatically.

# MEMORA independent processor

This is a separate Python service, not a Worker deployment. It is **not connected to the application yet**.

Install requirements and run `uvicorn main:app --host 0.0.0.0 --port 8000`. Set `PROCESSING_API_KEY` privately. `/process` authenticates requests, validates formats, computes SHA-256, and extracts PDF, PPTX, or DOCX text. It does not yet render document previews or persist results.

Video requests deliberately return 503 rather than fabricated results. Full video support still requires FFmpeg, Faster-Whisper, pyannote Community-1 with authorized Hugging Face access, stabilized slide-region transition detection, durable actual frame uploads, and job-result ingestion. These are unfinished, not simulated.

Integration contract: an authenticated application dispatcher should issue a short-lived source download URL and job ID to the service; the service should return source-linked transcript segments, stable anonymous speaker turns, actual frames, slide intervals, and byte measurements. A signed callback must validate job ownership before recording outputs. Do not expose processing credentials or storage service credentials to the browser.

The web app contains no demo fallback. Uploads store real originals and verified hashes with Uploaded status; this phase creates no processing jobs or invented processing events. Processing dispatch and callback persistence remain future work.

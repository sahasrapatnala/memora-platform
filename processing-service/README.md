# MEMORA independent processor

This is a separate Python service, not a Worker deployment. It is **not connected to the application yet**.

Install requirements and run `uvicorn main:app --host 0.0.0.0 --port 8000`. Set `PROCESSING_API_KEY` privately and `PROCESSING_CLOUD_ORIGIN` to the exact HTTPS origin of the connected Cloud storage. Set `PROCESSING_SCRATCH_DIR` to a dedicated writable disk. `/process` and `/retrieve` accept a JSON source descriptor, never multipart video bytes. The web app uploads originals directly using TUS with 6 MiB chunks.

The worker retrieves an expiring private URL in 1 MiB chunks, verifies the registered byte count and SHA-256, and emits NDJSON measured byte counters. It rejects redirects and foreign source origins. Scratch admission requires twice the source size plus 1 GiB headroom (11 GiB free for a 5 GiB original); each chunk rechecks headroom. One request at a time is admitted per process. Deploy with one process and a dedicated scratch volume; multiple processes/replicas require independent volumes or shared disk reservations. Actual video intermediates may require a larger budget. `/health` exposes current free scratch bytes, not a deployment guarantee.

Video requests end with an explicit Blocked event after verified retrieval, never successful video analysis. Full support still requires FFmpeg, Faster-Whisper, pyannote Community-1 with authorized model access, stabilized slide-region transition detection, durable actual frame uploads, and job-result ingestion. Document text extraction is still unbounded with respect to extracted text and should not be presented as multi-gigabyte document analysis support.

Integration contract: the owner-authenticated `getProcessingSource` application function provides file_id, workspace_id, name, source_url, size_bytes and sha256. It creates no processing job. A future trusted dispatcher must pass this descriptor to the service with the private bearer key, persist measured events under the authorized job, and validate signed callbacks before recording outputs. Do not expose processing credentials or storage service credentials to the browser. Renew expired URLs and retry retrieval; cloud upload resumption is independent of worker retrieval, which currently restarts after download interruption.

The web app contains no demo fallback. Uploads store real originals and verified hashes with Uploaded status; this phase creates no processing jobs or invented processing events. Processing dispatch and callback persistence remain future work.

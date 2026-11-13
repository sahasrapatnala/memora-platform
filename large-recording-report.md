# MEMORA large-recording audit — 13 November 2026

## Result
Limits and streamed retrieval are implemented. **Full 1.14 GB Ericsson upload-and-processing compatibility is not verified.** The only non-deleted original in Cloud is the 220,480,662-byte MP4. The actual 1.14 GB Ericsson source was not supplied; the earlier synthetic storage-test file is not that recording and was not used as a substitute.

## Live configuration verified
- Backend: Lovable Cloud; database query identifies PostgreSQL 17.11.
- Private `original-files` bucket: `public=false`, maximum **5,368,709,120 bytes (5 GiB)**. The project-wide storage configuration accepted `5GB`; the bucket query confirms its concrete binary byte limit.
- Frontend and atomic verified-registration function now use the same 5,368,709,120-byte limit. Existing ownership checks, workspace membership checks, audit registration and SHA-256 integrity are retained.
- No paid plan upgrade was performed. Storage consumption/transfer and separately deployed processing compute may still incur costs; plan capacity and billing were not inferred from the accepted per-file limit.

## Implemented
- Existing direct-to-private-Cloud TUS uploads remain intact: 6 MiB chunks, automatic retries, measured byte progress, pause/resume and user/workspace-scoped persisted checkpoints. Originals do not pass through FastAPI.
- Removed the Python 50 MiB multipart upload path. Authenticated `/retrieve` and `/process` now accept a JSON descriptor for an expiring private Cloud download URL and registered metadata.
- Python downloads in 1 MiB chunks to a partial scratch file, checks size and SHA-256 before publishing the local file, rejects redirects/foreign origins, and cleans temporary files. No whole-video byte buffer is allocated.
- Scratch admission requires twice the original size plus 1 GiB reserve: **11 GiB free for a 5 GiB original**. Headroom is checked while writing. One request per Python process is admitted; deploy one process per dedicated scratch volume, or add cross-process reservations. Video intermediates may require more disk.
- Worker emits actual download byte counters, then a verified-source event. It explicitly reports video analysis as **Blocked**, not complete. The application displays persisted job stages/progress and polls every five seconds; no job or invented percentage is created when processing is unavailable.
- Owner-authenticated source-descriptor function checks ownership and workspace membership before issuing private source access. Automatic processing remains disabled.

## Actual recording verification
1. Opened MEMORA as the existing recording owner; its saved row survived refresh. Desktop and 507×529 mobile upload page displayed the new limit, without browser runtime errors.
2. Retrieved the actual private **210.27 MiB** recording using the new worker download implementation: **220,480,662 bytes** and registered SHA-256 matched.
3. Repeated retrieval through the authenticated local Python `/retrieve` endpoint against real private Cloud storage: **213 measured events**, verified bytes/hash, final analysis state **Blocked**, about **18 seconds**. Scratch temporary files were cleaned. This tests the new worker implementation locally, not a deployed production processor.
4. SHA-256: `56788476f81d23dab45cde7bbf89a6f537ca1d31951567e512845690d3dd46c8`.
5. Original Cloud bytes and metadata were not changed or deleted. This turn reused the already-uploaded original; it did not repeat that recording's upload. Its earlier upload was verified separately.
6. The **actual 1.14 GB Ericsson recording** could not be uploaded/retrieved: it is absent from supplied files and current Cloud records. No substitute was labeled as a successful Ericsson test. A 5 GiB upload/retrieval was also not tested.
7. Automated tests: 26 frontend/integrity rules and 10 Python download/service rules passed. Preview reports build OK.

## Remaining requirements
- Supply the actual 1.14 GB Ericsson recording through MEMORA's upload picker; then test its resumable upload, registration and worker retrieval in that order.
- Deploy the independent Python service with private bearer credentials, the exact Cloud origin allowlist, and an adequately provisioned scratch disk. Sandbox free disk is not evidence of production disk capacity.
- Connect a trusted dispatcher and durable measured-event/result ingestion. The application cannot yet display the worker's live events because this integration and service endpoint are absent; it only displays existing real job records. No credential or service endpoint was fabricated.
- Configure video models, authorized model access, durable frame/output storage and real analysis stages. No video analysis was started in this audit.
- Worker retrieval retries start from the beginning after interruption; this is distinct from the already-resumable Cloud upload.
- Published-environment timeout/compute behavior at multi-gigabyte size remains unverified. Streaming registration avoids whole-file memory allocation but does not guarantee sufficient server execution time for 5 GiB hashing.
- Large-document text extraction still needs separate resource controls; large-video download support does not certify multi-gigabyte PDF/PPTX/DOCX analysis.
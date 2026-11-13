# MEMORA Phase 2
## 5 GB recording support
- [x] Raise live storage, frontend and verified-registration limits without paid upgrades.
- [x] Replace worker multipart originals with authenticated, bounded-memory cloud downloads and disk admission checks.
- [x] Verify actual 210 MiB private retrieval with the worker implementation and authenticated local endpoint; preserve original bytes.
- [ ] Test upload and retrieval of the actual 1.14 GB Ericsson original — blocked: original not supplied and absent from Cloud records.
- [ ] Connect actual worker events to persisted processing progress — blocked: independent service deployment, private endpoint credentials and durable result ingestion are unavailable.
- [x] Document deployment, model and missing-original blockers without claiming unverified compatibility.
## Large-file storage compatibility
- [x] Audit live storage limits, PostgreSQL identity and resumable protocol.
- [x] Implement resumable uploads and bounded-memory original verification without design changes or paid upgrades.
- [x] Verify interruption/resumption and report remaining large-file and deployment constraints.

- [x] Verify Cloud schema and permissions; implement profiles and reliable upload registration/activity.
- [x] Protect application pages; implement sign-in, sign-out, recovery and session persistence.
- [x] Add persistent file search, format filters, details and explicitly confirmed owner deletion.
- [x] Test validation, owner-confirmation rules and signed-out route access; report verified results.
- [x] Remove fabricated records and metrics from every normal page.
- [x] Prepare workspace-scoped core records and private asset storage.
- [x] Connect real data, workspace settings, upload and exports; audit all controls.
- [x] Apply restrained enterprise presentation and verify desktop/mobile.
- [x] Test integrity rules and public empty states; deliver functionality audit.
- [ ] Verify account creation/password sign-in, PDF/PPTX uploads, profile saves and second-user isolation — requires separate account/format-specific checks; authenticated MP4 storage, workspace creation, deletion and refresh persistence passed the large-file audit.
- [ ] Live extraction, diarization, slide detection, similarity and inventory analysis — requires deployed independent Python processing service and model access.
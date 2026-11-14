# MEMORA Phase 2
## Master MVP completion
- [ ] Phase 1: prepare coordinated dispatch and verified ingestion SQL; implement disabled-by-default secure dispatcher and worker callbacks without applying unreviewed migrations.
- [ ] Phase 2: return bounded real video manifests; persist transcripts, frames and processing metadata; add transcript/frame timeline and timestamp navigation.
- [ ] Phase 3: return bounded PDF/PPTX manifests including empty/OCR-required pages and notes; add page/slide viewers.
- [ ] Phase 4: ingest source-linked knowledge idempotently and implement bounded unified search.
- [ ] Phase 5: add Ask MEMORA with evidence-only answers and citations when a secure AI provider is configured.
- [ ] Phase 6: implement workspace-scoped exact and explainable near-duplicate detection with conservative evidence.
- [ ] Phase 7: implement retention approval, coordinated deletion and historical verified savings accounting.
- [ ] Phase 8: implement offboarding inventory selection using shared duplicate analysis.
- [ ] Phase 9: connect actual dashboard metrics and final integration states.
- [ ] Run unit, integration and available real-file acceptance checks; document deployment blockers and local commands.
## Python dispatch integration
- [x] Add approval-gated readiness validation that fails closed without claiming or executing jobs; verify against the actual Approved Tech Concept Hack recording.
- [ ] Connect atomic dispatch and protected ingestion — blocked: deployed processor URL/shared credential and private generated-assets write authorization are unavailable; repository video processing still reports Blocked.
- [ ] Verify live extraction and persisted outputs — blocked by the deployment and storage capabilities above.
## Request Processing action
- [x] Add selected-original request action with eligibility, active-job status and Processing Review navigation.
- [x] Test eligibility and existing request rules; verify existing-job details, review navigation and refresh with the actual authenticated owner.
## Processing approval foundation
- [x] Add atomic reviewer decisions with a job-linked audit separate from retention authorization.
- [x] Add review controls and a non-executing, approval-gated dispatch contract; test decision rules.
- [ ] Verify real review and refresh persistence — blocked: current authenticated account has no workspace, original or job; no substitute records were created.
## Secure processing requests
- [x] Apply owner-scoped INSERT access, Uploaded-file enforcement and concurrent active-job uniqueness without changing storage.
- [x] Add authenticated request operation with duplicate recovery and security tests; leave Python dispatch disabled.
- [x] Verify live request persistence — concurrent authenticated requests for the existing 210 MiB original returned one Awaiting Review job, preserved after refresh.
## Password recovery redirect
- [x] Inspect the exact recovery request and live allowed redirect addresses.
- [x] Verify a real local recovery request carries the requesting origin and dedicated page; reject missing recovery links before password submission.
- [ ] Validate a newly generated email returns locally — blocked: local address must be added in Cloud Auth settings; actual email destination must be checked.
- [ ] Verify recovery session and password update end to end — blocked: user must open the newly generated email and choose their password.
## Local authentication
- [x] Diagnose actual email/password responses and hosted social-login dependence without changing accounts.
- [x] Preserve hosted sign-in code, disable unavailable local social sign-in, and provide actionable errors.
- [x] Test real local invalid-password requests and existing-session refresh; report unverified checks honestly.
- [ ] Verify successful local password login and fresh hosted sign-in/sign-out — blocked: existing accounts have no password; user-controlled password setup and interactive provider access are required.
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
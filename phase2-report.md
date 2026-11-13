# MEMORA Phase 2 — implementation and verification

## Connection and schema
Lovable Cloud PostgreSQL is connected. The six requested core tables already existed: profiles, workspaces, workspace_members, files, processing_jobs and activity_logs. No duplicate tables were created. This phase added file names to activity history, an automatic signup profile trigger, unique original storage paths, atomic verified-original registration, and owner-authorized deletion state/audit functions. The live database was queried to confirm the added column, functions and profile trigger.

Originals remain in a private storage bucket with a 50 MB per-file limit. Registered originals have workspace-member read access; unrelated users receive no access. Metadata insertion and processing-job insertion are no longer available to ordinary clients, so successful original registration must go through authenticated server byte/hash verification. Processing outputs remain read-only to clients.

## Implemented workflow
- Email/password signup with display name, sign-in, confirmation messaging, session persistence and ordered sign-out/cache clearing.
- Sign-in required for all application pages. The public home renders account access when signed out, not the dashboard.
- Public password recovery page; email reset links return there.
- MP4, MOV, PDF, PPTX and DOCX validation; nonempty originals up to 50 MB.
- Private uploads, real upload/verification/failure states, server-side size and SHA-256 verification, atomic metadata/upload event registration, and retryable verification after a storage upload succeeds but registration fails.
- Batch failures do not erase successfully registered files. Failed registration does not claim a successful database upload. An unregistered private object may remain for retry; it is not counted in dashboard totals.
- Real inventory search, file-type filtering, size/date/status/details/hash, private original opening and explicit owner-confirmed deletion.
- Deletion removes stored bytes and retains metadata/audit history. Deleted rows are excluded from active inventories and storage totals. Failed storage removal retains the original; interrupted finalization shows Deleting and is retryable.
- Dashboard totals continue to read real saved records. Uploads create neither completed processing nor potential savings. Processing jobs and requested/completed processing activity are not fabricated; processing is not implemented in this phase.

## Passed checks
- 19 automated tests: routing, supported formats, empty/oversized validation, owner-only deletion with explicit confirmation, combined filename/type filtering, deleted-row exclusion, and measured/authorized savings rules.
- Browser checks: signed-out home shows the account form; signup exposes display name/email/password; nine application destinations redirect to Account; public recovery page opens.
- Desktop and phone account screens render without horizontal phone overflow or browser runtime errors.
- Current preview compilation passed.

## Blocked end-to-end checks — not claimed successful
The database has zero authentication users. A managed session request failed because no account exists. No account was silently created and email confirmation was not disabled.

Account creation/confirmation, real sign-in/sign-out, workspace/profile saves, PDF/PPTX/MP4 upload, hash/metadata/storage readback, refresh persistence, deletion readback and second-user private-file isolation have **not passed end-to-end verification**. Source code, policies and unit tests are not substitutes for these checks. Create and confirm an account in MEMORA, then sign in; a second confirmed account is needed for isolation checks. Storage and refresh persistence are implemented but remain unverified with real uploads.

## Before Python processing
Deploy the independent Python service; configure its private access credentials and required video model access; supply its endpoint. Add authenticated job dispatch, short-lived source URLs, signed result callbacks with job/workspace ownership verification, persistent source-linked outputs, actual frame/document assets and verified package byte measurements. These are not run in the browser or application server runtime. This phase neither processes originals nor fabricates processing events.
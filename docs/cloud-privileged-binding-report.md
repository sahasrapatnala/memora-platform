# MEMORA managed Cloud privileged-access investigation

## Result

The existing Lovable Cloud backend is healthy. The supported managed credential-binding refresh completed against the existing backend; the stored privileged credential already matched the platform's canonical value. The sandbox server environment was refreshed, without rotating credentials or changing the database.

A fresh signed-in browser check at `/upload` now recognizes both existing Approved jobs, reports **Video-only database installed** and **Workspace read access verified**, and leaves both Start processing controls disabled. No upload, cancellation, dispatch, artifact write, deletion or retention action was performed.

## Exact reason for the message

The text originates in the automatically generated `src/integrations/supabase/client.server.ts`, not from a test of whether the project is connected to Cloud. Its lazy `supabaseAdmin` client checks `process.env['SUPABASE_URL']` and `process.env['SUPABASE_SERVICE_ROLE_KEY']` when first accessed. A missing runtime binding throws the generic “Connect Supabase in Lovable Cloud” message even when Cloud is already connected.

The error establishes that the affected server runtime could not see the required variable when that client was accessed. It does not establish that the credential was absent from Cloud's secret store: the managed refresh confirmed that the stored value already matched. The original affected runtime's environment was not captured before refresh, so the precise cause of its missing binding cannot be proven from the current evidence.

The current `getDispatchReadiness` handler authorizes owner/reviewer membership and reads the selected job, original, approval and owner membership through the authenticated RLS client. It then invokes `processing-capabilities.server.ts`, whose read-only schema metadata request uses the managed privileged key; its two zero-row table checks use the user's bearer token. This inspector catches failures and returns unverified capabilities, rather than emitting the generated client's exception. Thus the quoted exception is from the generated admin client, while today's readiness path is verified independently.

## Supported privileged mechanism and exact configuration

Keep the generated `supabaseAdmin` client. It is Lovable Cloud's supported server-side privileged client, with opaque-key handling and session persistence disabled. Existing authorized handlers load it dynamically after their access checks; processing callbacks use it inside server-only code after their callback/attempt checks. There is no need for a different project, a raw database connection, an external credential, a permission change or a replacement client.

The required server runtime bindings are:

| Binding | Purpose | Owner/location |
| --- | --- | --- |
| `SUPABASE_URL` | Existing backend server endpoint | Platform-managed server environment |
| `SUPABASE_PUBLISHABLE_KEY` | Authenticated/readiness Data API access | Platform-managed server environment |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted schema metadata and privileged server operations | Platform-managed secret, server only |
| `MEMORA_PROCESSING_ENABLED` | Execution gate | Must remain unset or not equal to `true` |
| `MEMORA_RETENTION_ENABLED` | Retention deletion gate | Must remain unset or not equal to `true` |

The safe repair is Lovable's managed `rebind_secrets` operation (default service-role binding), which was performed. It rebinds the existing canonical credential and refreshes the server environment without revealing or rotating it. No secret values were printed or copied into source, GitHub, browser storage, chat or Python configuration. Reserved Cloud bindings should not be recreated manually with project secret tools.

No application code change was necessary. Generated integration files were left untouched. No server restart was necessary: the fresh browser check passed after the refresh. If a different running server still retains an old environment, refresh its managed runtime; use the supported supervised restart only if needed. A previously published snapshot receives refreshed server secrets on the next publish, but no publishing or deployment was performed for this local-demo investigation. The hosted preview itself was not separately exercised; the browser check used the sandbox server.

## Verification and remaining limits

- Cloud health: auth, database and auth-to-database checks all responded normally.
- Managed binding repair: canonical privileged key already matched; server URL, public key and privileged binding refreshed.
- Environment checks printed presence/status only: privileged binding and server URL present; processing and retention disabled.
- Signed-in `/upload`: two existing originals and Approved jobs remained visible; installed video schema and workspace read checks passed; Start processing disabled.
- Focused tests: **26 passed across 5 files** — processing capabilities, dispatch readiness, video-demo compatibility, processing contracts and worker readiness.
- The readiness UI deliberately does not certify client write permissions from trusted OpenAPI. Its independent permission-verification blocker remains; this investigation neither changes permissions nor treats metadata as an ACL test.
- Trusted processing writes, actual local-worker dispatch, real-file result persistence and retention were not exercised, because execution remains disabled.

## Changes and next action

Only this report and the roadmap completion item were added; application code and database objects were not changed. Existing project/database connections, uploads, saved results, policies and permissions were preserved.

Refresh the preview and confirm the installed video-only database/read-access messages. Connecting the authenticated local worker and any execution enablement remain separate work requiring approval; neither requires exposing the Cloud privileged credential to the worker.
## Follow-up (2026-11-14): screenshot still showed the credential error

- Running server inspected at 12:12 UTC: the preview server process (restarted 12:11:51 UTC) has non-empty `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (lengths only checked). The process that produced the screenshot had already been replaced, so its environment could not be captured. The sandbox server restarts frequently; one started without the managed binding produces exactly that set of failures, because the readiness inspector returns "unverified" when the privileged binding is absent.
- Signed-in check against the running server: both Approved jobs report "Video-only database installed" and "Workspace read access verified" (HTTP 200 from `getDispatchReadiness`).
- Fix: the inspector now returns a fixed, non-secret reason (missing binding names, HTTP status of the metadata or member read, or missing schema objects), shown first in the blockers as "Runtime check failed: …". No readiness result is hardcoded.
- "Approved; dispatch not connected" is the stored stage label written by `decide_processing_job` at approval time, not a live check. Live dispatch blockers are: `MEMORA_PROCESSING_ENABLED` not `true`; `PROCESSING_API_URL`, `PROCESSING_API_KEY` and `PROCESSING_CALLBACK_URL` not set in the server; client write-permission verification is a separate, deliberate blocker.

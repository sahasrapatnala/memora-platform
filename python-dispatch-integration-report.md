# Python dispatch integration: safe partial implementation

## Result

The requested production integration is blocked. Implemented a read-only authenticated dispatch-readiness operation, not an executable dispatcher or ingestion endpoint. No jobs were claimed, no source URLs issued, no Python calls made and no outputs or Completed statuses fabricated.

The actual Tech Concept Hack recording has an Approved job with a matching Approved processing audit. The current repository Python `/process` and `/retrieve` share a streaming handler with private bearer authentication and bounded source retrieval. For MP4/MOV, it explicitly emits Blocked. Faster-Whisper and OpenCV are listed as dependencies, but no working video pipeline is present in this checkout; locally tested code elsewhere was not assumed to exist here.

## Exact blockers

1. No deployed HTTPS processor endpoint was supplied or configured. Secret-name inspection found only managed Lovable keys; no PROCESSING_API_KEY or processor configuration. No relevant connector exists.
2. `generated-assets` is private and permits workspace reads only. There is no authorized storage INSERT path for processor frames. Public-table RPCs cannot legitimately upload Storage bytes; directly writing storage metadata is not a replacement for the Storage API. A service-role client is prohibited, and broadening browser output-write policies would undermine processor-output protections.
3. No durable atomic dispatch claim or authenticated ingestion capability currently exists. Do not mark the existing Approved job dispatched while these capabilities are unavailable.
4. The checked-in worker lacks implemented transcription/frame extraction and durable idempotent worker acceptance, result manifests and callback handling. Existing request-level thread locking is not durable job idempotency.

The private original bucket is capped at 5,368,709,120 bytes; generated-assets at 52,428,800 bytes per object. Existing streaming retrieval verifies registered size and SHA-256 and enforces scratch admission. Neither bucket configuration was changed.

## Safe implemented changes

- `src/lib/memora/api.functions.ts`: `getDispatchReadiness` uses the existing authenticated server-function mechanism, no-store responses and user-scoped reads. It checks current reviewer role, scoped job/file, matching processing audit and original-owner workspace membership. It returns no signed URL or credentials.
- `src/lib/memora/dispatch-readiness.ts`: validates Approved job/audit identity, original identity, workspace, ownership, Uploaded state, video format, registered size and SHA-256. Returns Blocked/dispatched=false with explicit missing capabilities. This is deliberately read-only, not an atomic authorization for later execution.
- `src/test/dispatch-readiness.test.ts`: six fail-closed authorization, state, approval, membership and integrity tests.
- `AGENTS.md`, `roadmap.md`, `python-dispatch-integration-report.md`: architecture, blockers and verification record.

Database changes: **none**. RLS, approval RPC, retention isolation, private storage policies, original files and Python processing code remain unchanged.

## Tests and actual verification

All 65 application tests passed. All 10 existing Python tests passed after installing FastAPI/httpx/requests into an isolated temporary test environment. Preview build OK. This does not verify models or real processing.

The authenticated browser called readiness for the actual Approved Tech Concept Hack job. It returned Blocked/dispatched=false. Immediate readback confirmed status Approved, stage Approved; dispatch not connected, progress NULL. No fake or alternate original was used. Dispatch/concurrency/retry/extraction/ingestion/Completed persistence are **Not Verified**, because those capabilities are not implemented.

## Required next inputs and secure deployment design

Provide the deployed processor HTTPS address and the locally tested Python implementation if it differs from this repository. Shared worker authentication must be entered through a secure secret form and installed with the identical value on the processor; never paste credentials into chat.

Before enabling execution, establish a narrowly authorized private Storage write capability for processor outputs without exposing broad credentials or permitting arbitrary browser output writes. Then add an atomic database claim with approval/ownership revalidation, durable worker idempotency and explicit ambiguous-delivery recovery; short-lived private source descriptors transmitted only server-to-server; bounded frame upload and byte/hash verification; authenticated replay-safe job/workspace-bound ingestion RPCs; measured progress; and transactional manifest/finalization checks. Completed must follow persistence of every required result. These steps cannot be honestly called complete with the current missing deployment and storage authorization.
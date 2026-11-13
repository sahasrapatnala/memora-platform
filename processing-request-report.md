# Secure processing requests

## Applied database change

Exact SQL: `drizzle/migrations/0007_secure_processing_requests.sql`.

- Added only `GRANT INSERT ON TABLE public.processing_jobs TO authenticated`.
- Tightened `jobs_insert` with `files.status = 'Uploaded'`; retained owner, membership, workspace, authenticated user, `Awaiting Review` and null-progress restrictions.
- Added `processing_jobs_one_active_per_file`, a unique partial index on `file_id` excluding `Completed`, `Failed`, `Cancelled`, `Rejected`.
- There were no existing jobs or actual status values to infer a lifecycle from. These four terminal states are explicitly defined for this request operation; all unknown states remain active conservatively. Future lifecycle changes must keep the index and application terminal list aligned.
- The live database confirmed the INSERT grant, tightened policy and index after application.
- No new tables or columns; no storage, authentication, original-record or unrelated policy changes. Existing UPDATE privileges were not widened and there remains no UPDATE RLS policy allowing authenticated job modifications.

## Application changes

- `src/lib/memora/api.functions.ts`: added POST `requestProcessing` with `requireSupabaseAuth`, strict input validation and no-store responses. Existing session bearer attachment in `src/start.ts` is unchanged.
- `src/lib/memora/processing-request.ts`: owner and workspace checks, Uploaded-only validation, exact review insertion, existing-job return, and concurrent unique-conflict recovery through the user-scoped RLS client. No service-role client, signed URL or Python dispatch.
- `src/test/processing-request.test.ts`: nine validation/security/duplicate/error tests.
- `AGENTS.md`: duplicate-safety architecture rule.
- `roadmap.md`: implementation and verification status.
- `processing-request-report.md`: this report.
- Migration tooling also generated `drizzle/migrations/meta/0007_snapshot.json` and updated `drizzle/migrations/meta/_journal.json`. Generated database types were refreshed by the migration tool with no resulting file diff.

## Verification

17 tests passed: nine processing-request tests and eight original-file regression tests. Latest preview build: OK.

The authenticated browser opened `/upload` and remained signed in after refresh. Its account has no workspace or Uploaded originals, so live job creation, concurrent database insert behavior, and job readback after refresh remain **Not Verified**. No substitute account, fabricated original or job was created. Mocked tests verify the application's concurrent-conflict recovery, not a live concurrent database run.

## How to test with an eligible account

Call from an authenticated component event handler using `useServerFn(requestProcessing)`:

```tsx
const request = useServerFn(requestProcessing);
const result = await request({ data: { fileId, workspaceId } });
// result: { jobId, status: "Awaiting Review", reused: boolean }
```

Use an actual Uploaded original owned by that account in a workspace it belongs to. Two simultaneous calls must return the same job ID, with only one active row. Refresh and read that job through the existing workspace query provider; progress must remain null. Attempt a signed-out request, another owner's file, an incorrect workspace and a non-Uploaded file; none may create a row. Database policy additionally enforces these insertion restrictions even for direct authenticated Data API calls. The minimum INSERT grant necessarily permits policy-compliant browser inserts, but the application adds no direct browser insertion code.

Python processing remains disabled. No review/approval execution or new processing button was added, as this brief only requested the secure operation.
# Missing Request Processing action

## Exact cause

`requestProcessing` existed but no original-list or details control called it. `FileManager` offered details, owner deletion and Open original only. Upload intentionally does not create jobs. The review section could therefore display jobs but could not originate a request.

## Changes

- `src/components/memora/file-manager.tsx`: render the processing control inside the existing selected-original details modal.
- `src/components/memora/processing-action.tsx`: owner/membership-aware Request Processing button, pending/error state, returned job status and View Processing Review link. Uses `useServerFn(requestProcessing)` with actual selected file/workspace identifiers. Refreshes shared records after success. Existing active jobs show their status and review navigation instead of another request. Membership failures, non-owners, signed-out users, missing workspace and non-Uploaded files cannot initiate a request.
- `src/lib/memora/processing-action.ts`: small testable eligibility and active-job state selector; uses the existing terminal status list.
- `src/test/processing-action.test.ts`: seven eligibility/active-job tests.
- `AGENTS.md`, `roadmap.md`, `processing-action-report.md`: architecture and verification notes.

No database, storage, authentication, request operation, approval operation or Python changes. No direct browser job insert. No automatic approval, execution or original deletion.

## Verification

25 tests passed: seven action eligibility tests, nine existing request security/duplicate tests, nine review tests. Preview build OK.

With the actual authenticated owner session, two concurrent calls through the existing request function for the real 210 MiB original returned the same job ID, one newly created and one reused. Readback showed exactly one Awaiting Review job with NULL progress. This test created a real review request; it did not approve or execute it.

Browser verification opened that original's details, displayed Awaiting Review and View Processing Review, followed the link, confirmed Processing review was visible, refreshed and confirmed it remained visible. Details were inspected at desktop and 628×612 screen size; the controls fit the modal.

The new first-request button's eligibility is covered by focused state tests; first creation was exercised via the authenticated generated application-function call, not a button click. The browser verified the existing-job UI path after creation. Nonowner/missing-membership/non-Uploaded rejection paths are tested with mocked database responses, not separate live accounts.

## Use

Open an eligible original's details and choose Request Processing. Its Awaiting Review status appears, followed by View Processing Review. A file with an active job shows that job immediately. Approval and Python execution remain separate.
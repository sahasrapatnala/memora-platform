# MEMORA local authentication verification

## Root causes

1. **Email/password:** A real request from the running local app to the existing Cloud account service returned HTTP 400, `invalid_credentials`. Email sign-in was already enabled. Read-only account inspection found both existing accounts are confirmed, Google-created accounts with **no stored password**. Their Google credentials are not an application password. This is not a session-storage or OAuth-redirect failure. No private keys or passwords were read or displayed.
2. **Google 404:** The installed managed-auth helper initiates login at `/~oauth/initiate`. That endpoint is provided by Lovable's hosted infrastructure, not the local Vite server. The existing helper remains unchanged; unsupported local social buttons are disabled, rather than switching to a raw Google OAuth flow or another backend.
3. **Recovery redirects:** The actual redirect allow-list contains hosted addresses only. This does not prevent email/password token requests, but recovery links requesting a local return address fall back to the hosted Site URL. No redirect settings were silently changed.

## Verification results

| Check | Result | Evidence |
|---|---|---|
| Existing backend and browser configuration | Passed | Local browser made a real request to the existing Cloud auth service, which returned a structured credential error, not an invalid-key or network error. |
| Local invalid-password handling | Passed | Real HTTP 400 `invalid_credentials`; useful inline feedback rendered; screenshot inspected. No request was mocked. |
| Local session persistence | Passed | Existing managed session restored only on localhost; Cloud validated the account and the account screen remained signed in across two refreshes. This is **not** a successful password-login test. |
| Existing-account local password sign-in | Not Verified | Both existing accounts have no password, and no password was set or changed. Successful password sign-in requires the user to set one through recovery. |
| Local sign-out | Not Verified | Did not invoke global sign-out against the provided session, to avoid revoking hosted sessions. Sign-out implementation is unchanged. |
| Local Google/Lovable sign-in | Unavailable | Managed broker is hosted-only; buttons are disabled on loopback hosts and an explanation is shown. |
| Fresh hosted password sign-in / sign-out | Not Verified | No existing account password is available. No hosted sign-out performed. |
| Fresh hosted Google sign-in | Not Verified | Interactive provider consent/account access was not exercised. Hosted helper and enabled-provider configuration were not changed. |
| Hosted session activity | Passed, limited | Supplied hosted telemetry shows a successful token refresh and account validation before these edits; this is not a fresh post-change hosted flow. |
| Local browser errors | Passed | Zero page runtime errors during tested requests and refreshes. |
| Automated checks | Passed | Five auth-boundary and route tests passed; preview build reports build OK. |

## Modified files

- `src/components/memora/auth.tsx`: actionable errors, persistent inline feedback, appropriate password autocomplete, duplicate-submit guard, and local social-sign-in guard.
- `src/lib/memora/auth-rules.ts`: application-owned loopback detection and safe error mapping.
- `src/test/auth-rules.test.ts`: local-versus-hosted boundary tests.
- `README.md`: local setup and recovery guidance.
- `AGENTS.md`: managed-auth environment boundary.
- `roadmap.md`: verification status and blockers.
- `local-auth-report.md`: this report.

No generated integration files, database records, account passwords, profile structure, ownership rules, storage settings or uploaded Ericsson recordings were modified. No new backend was created. Email auth was checked with the idempotent enable tool and was already enabled; confirmation and social provider settings were not changed.

## Environment variables

Use the existing export's values, not a new project's values:

- Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; retain `VITE_SUPABASE_PROJECT_ID`.
- Server functions: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`.
- Never put private/service keys in any `VITE_` variable.

## Remaining action

Use **Forgot password** for your existing Google account email to choose a MEMORA password yourself. Since local recovery redirects are not currently allowed, set the password through hosted MEMORA and then use the same email and new password locally. For local recovery, open the local app at `http://127.0.0.1:<port>` and add `http://127.0.0.1:<port>/**` in **More → Users → Auth settings → Advanced → Redirect URLs**; keep the hosted Site URL unchanged. Do not create another account.

**The diagnostic and error-handling changes are verified; successful local email/password login is not yet verified and is not claimed fixed.**
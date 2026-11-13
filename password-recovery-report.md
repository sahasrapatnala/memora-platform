# MEMORA password recovery redirect audit

## Actual source of the wrong destination

The Forgot password code already supplied the requesting origin plus `/reset-password`. The live Cloud Auth configuration has **only hosted return addresses**; no local address is allowlisted. The Site URL is the hosted preview. An unapproved `redirect_to` falls back to that Site URL. Changing the page alone cannot fix this configuration rejection.

No custom authentication email template or webhook exists in this checkout, so no application-owned email template override was found. Hosted template content could not be inspected with the available tools. The reported email destination is consistent with the verified allow-list fallback, but a newly delivered email link was not available to inspect.

## Real request performed

Using the running app at `http://127.0.0.1:8080`, requested a new reset email for the requesting user's existing account:

```typescript
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: passwordRecoveryRedirect(window.location.origin),
});
// passwordRecoveryRedirect(origin) returns `${origin}/reset-password`.
```

**Exact requested return URL:** `http://127.0.0.1:8080/reset-password`.

Observed the actual request query `redirect_to` with that exact value and HTTP **200** from Cloud Auth. This confirms the submitted return address and API acceptance, **not** receipt or the final destination in the email. The user's VS Code port is unknown; the code uses their actual browser origin without a fixed port. Hosted requests likewise keep their requesting hosted origin.

## Required Cloud setting — still outstanding

In Lovable open **More → Users → Auth settings → Advanced → Redirect URLs**. Add:

```text
http://127.0.0.1:YOUR_ACTUAL_PORT/**
```

Replace `YOUR_ACTUAL_PORT` with the port shown in VS Code's running app. Open the app using **127.0.0.1**, not localhost: Cloud's settings reject localhost entries. Keep the hosted entries and Site URL unchanged. No agent tool edits this list, so it was not changed automatically.

## Recovery callback changes

- Kept the public `/reset-password` page and same-origin redirect generation.
- Require a `type=recovery` link and a Cloud-validated session before enabling password submission; invalid, expired or missing links show an error.
- Continue using `updateUser({ password })` without a current password for recovery.
- Prevent switching away from recovery through sign-up/forgot-password mode controls.
- Explain the allow-list prerequisite in the local reset request view.

Modified: `src/components/memora/auth.tsx`, `src/lib/memora/auth-rules.ts`, `src/test/auth-rules.test.ts`, `roadmap.md`, and this report. Generated integrations, existing accounts, passwords, database records, uploaded files and hosted Site URL were not altered.

## Verified versus outstanding

| Check | Result |
|---|---|
| Actual local reset request includes correct origin and dedicated page | Passed — actual HTTP 200 request inspected |
| No fixed local port in application code | Passed |
| Actual local redirect allowlisted | Failed — local entry absent; user setting required |
| Direct recovery page prevents password submission without a link | Passed — checked in browser |
| Unit/routing tests | Passed — seven tests |
| Preview compilation | Passed — build OK |
| Newly delivered email destination | Not Verified — no inbox link available |
| Actual recovery session/password update | Not Verified — user must open email and choose password |
| Fresh hosted recovery flow | Not Verified — hosted redirect generation preserved but no new hosted email tested |

**The configuration-dependent redirect issue is not claimed fixed.** API acceptance is not proof that the final email returns locally.

## Exactly how to test from VS Code

1. Download/update the project with these changes, install dependencies if needed, and run `npm run dev`.
2. Read the actual port from Vite. Open `http://127.0.0.1:PORT` in your browser.
3. Add that exact origin plus `/**` to the Cloud Redirect URLs as described above.
4. In that local app, select **Forgot password**, enter your existing account email, then **Send reset link**.
5. Inspect the request in the browser Network panel: `/auth/v1/recover` must have `redirect_to=http://127.0.0.1:PORT/reset-password` (URL-encoded in the request).
6. Open the **newest** reset email, not a previous one. Keep the local server running. After the verification link is opened, the address bar must return to `http://127.0.0.1:PORT/reset-password`. Do not share the full email verification link, tokens or URL fragment.
7. Choose your new password on that page. After success, sign out and sign in locally using the same email and new password, then refresh to verify persistence.
8. For a separate hosted test, request another reset from hosted MEMORA and confirm its link returns to that hosted origin's `/reset-password` page.
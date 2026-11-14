# MEMORA

**Preserve Knowledge. Eliminate Redundancy.**

MEMORA is an intelligent data storage optimization platform for private video and document originals, reviewer-approved extraction, source-linked knowledge search, duplicate evidence, retention review and offboarding inventories. No fabricated metrics or processing results are used.

## Local application — PowerShell

Install Bun, Python, FFmpeg and the processing model dependencies first. Clone the existing repository; do not create another Cloud project.

```powershell
git clone <existing-repository-url>
cd <existing-project-directory>
bun install
bun run dev
```

The downloaded project's existing `.env` supplies the Cloud connection. Browser variables are `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID`. Server functions additionally require `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` and the server-only managed service credential supplied by Lovable Cloud. Never place private keys in `VITE_` variables or commit them.

Optional processing configuration names:

- `PROCESSING_API_URL`
- `PROCESSING_API_KEY`
- `PROCESSING_CALLBACK_URL`
- `PROCESSING_CALLBACK_ORIGIN`
- `MEMORA_PROCESSING_ENABLED`
- `MEMORA_RETENTION_ENABLED`

Both feature gates default to disabled. The reviewed SQL under `docs/sql-review/` must be applied in the order documented in `docs/sql-review/mvp-rollout.md` and pass acceptance checks before either gate is enabled. No migration from that review directory was applied by the implementation pass.

For local processing, use `PROCESSING_API_URL=http://127.0.0.1:8000` and `PROCESSING_CALLBACK_URL=http://127.0.0.1:8080/api/public/processing`. Remote endpoints require HTTPS. See `processing-service/README.md` for worker setup and its environment names.

## Accounts and recovery

Email/password uses the same Lovable Cloud accounts locally and hosted. A Google-created account does not necessarily have a password; use **Forgot password** to set one yourself. Google and Lovable sign-in use the hosted broker and are disabled on loopback hosts.

For local recovery links, open `http://127.0.0.1:<port>` and add `http://127.0.0.1:<port>/**` under **More → Users → Auth settings → Advanced → Redirect URLs**. Keep hosted entries and the Site URL unchanged. Sessions survive refresh.

## Tests

```powershell
bunx vitest run
cd processing-service
python -m unittest test_cloud_download.py test_service.py test_rules.py test_documents.py test_callbacks.py
```

Unit tests do not prove live dispatch, model extraction, cross-workspace isolation or durable persistence. Real-file and two-account acceptance steps are listed in the rollout document.

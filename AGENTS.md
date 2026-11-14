<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Application architecture
- Keep content pages in TanStack file routes and reusable MEMORA workspaces in components; parent pages render Outlet for child analysis views.
- Normal workspaces read only membership-scoped Cloud records through a shared query provider; no demo fallback, because empty and failed reads must remain honest.
- Processor outputs are client-read-only; verified package bytes and approved retention receipts drive distinct savings totals, because uploads are not successful analysis.
- Secure originals in a private owner-scoped bucket; server-verify bytes and SHA-256 before atomic metadata/audit registration, so failed uploads cannot masquerade as registered originals.
- Owner-confirmed deletion removes storage bytes through authenticated server functions and retains deleted metadata/audit history, so traceability survives deletion.
- Application pages live under the client-only authenticated layout; the public home shows account access while signed out, so private workspaces never appear before session validation.
- Run computational video and document extraction in an independent Python service, never in the browser or Worker runtime.
- Upload originals directly with TUS and user/workspace-scoped persisted checkpoints; stream server-side SHA-256 verification before registration to avoid whole-file memory allocation.
- Python processing accepts only private expiring Cloud source descriptors, streams originals to capacity-checked scratch disk and emits measured download events; it never proxies multipart originals or reports unimplemented video analysis as successful.
- Keep managed social sign-in on hosted origins and guard loopback development hosts in application-owned auth code; the local server does not serve Lovable's OAuth broker, while email/password uses the same Cloud client and accounts.
- Processing requests use the authenticated RLS client and a database partial unique index; unknown job states remain active and only Completed, Failed, Cancelled or Rejected permit a new request, preventing concurrent duplicates without privileged writes.
- Processing decisions use a narrow atomic database RPC with current owner/reviewer checks and a locked job; job-linked approval records must never authorize retention, and dispatch candidates are non-executing until durable claim and result ingestion exist.
- Original details use a shared ProcessingAction control that calls requestProcessing with the selected file identifiers; membership checks gate UI eligibility while server authorization remains authoritative.
- Processing dispatch and retention deletion are disabled by default until their reviewed migrations and acceptance checks complete; selected-job claims use fresh fencing tokens, worker callbacks are attempt-bound, and only verified durable manifests may complete jobs.
- Worker admission reserves capacity before HTTP 202 and a continuous attempt-scoped heartbeat renews fenced leases during silent extraction; stopped/rejected renewals prevent further delivery, because model initialization does not reliably emit progress events.
- Source summaries select bounded distributed excerpts without question-keyword filtering; ordinary answers still require matching evidence, because summary instructions are not source content.

- Finalization uses a last conditional unexpired-token update in the result transaction, and artifact receipts include token/workspace/file lineage, because leases can expire during insertion.
- Source readers retain one explicit page with deterministic ordering and zero inactive-page cache; latest results use created_at then id, because default row limits and unordered history hide content.
- Generated summaries live separately with evidence IDs/citations and a content-sensitive request key, because refresh must preserve generated knowledge without contaminating extracted source content.

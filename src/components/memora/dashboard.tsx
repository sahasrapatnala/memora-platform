import { Link } from "@tanstack/react-router";
import { Upload, Download, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, PageHeader, SectionTitle, ViewLink } from "./shell";
import { DataState, Empty, FileTable } from "./workspaces";
import { useWorkspace } from "./workspace-data";
import { measuredStorage, formatBytes, retentionApprovalIds } from "@/lib/memora/integrity";
import { exportCsv } from "@/lib/memora/export";
export function Dashboard() {
  const { data, loading, error, workspace } = useWorkspace();
  const files = data?.files ?? [];
  const storage = measuredStorage(
    files,
    data?.analytics ?? [],
    retentionApprovalIds(data?.approvals ?? []),
  );
  const completedIds = new Set(data?.jobs.filter((job) => job.status === "Completed").map((job) => job.file_id));
  const completedFiles = files.filter((file) => completedIds.has(file.id));
  const metrics = [
    ["Total original storage", formatBytes(storage.original), "Active original file bytes"],
    ["Uploaded files", String(files.length), "Registered originals"],
    ["Processed videos", String(completedFiles.filter((file) => ["MP4", "MOV"].includes(file.format)).length), "Completed and ingested"],
    ["Processed documents", String(completedFiles.filter((file) => ["PDF", "PPTX", "DOCX"].includes(file.format)).length), "Completed and ingested"],
    ["Transcript segments", String(data?.transcripts.length ?? 0), "Persisted timestamped records"],
    ["Pages and slides", String((data?.pages.length ?? 0) + (data?.slides.length ?? 0)), "Persisted document results"],
    ["Duplicate groups", String(data?.groups.length ?? 0), "Exact and near-duplicate candidates"],
    ["Pending recommendations", String(data?.recommendations.filter((item) => item.status === "Awaiting Review").length ?? 0), "Require human review"],
    ["Verified storage reclaimed", formatBytes(storage.reclaimed), "Authorized, verified actions"],
    ["Processing failures", String(data?.jobs.filter((job) => job.status === "Failed").length ?? 0), "Terminal failed jobs"],
  ];
  return (
    <Shell title="Overview">
      <PageHeader
        title="Workspace overview"
        description={workspace?.name ?? "MEMORA · Preserve Knowledge. Eliminate Redundancy."}
        action={
          <div className="heading-actions">
            <Button
              variant="outline"
              disabled={!files.length || !!error}
              onClick={() => exportCsv(files)}
            >
              <Download />
              Export inventory
            </Button>
            <Button asChild>
              <Link to="/upload">
                <Upload />
                Upload files
              </Link>
            </Button>
          </div>
        }
      />
      <DataState />
      <div className="metrics-grid">
        {metrics.map(([label, value, detail]) => (
          <article className="metric" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value block">{loading || error ? "—" : value}</strong>
            <span className="metric-detail">{detail}</span>
          </article>
        ))}
      </div>
      <div className="overview-columns">
        <section className="content-section">
          <SectionTitle title="Original files" action={<ViewLink to="/upload" />} />
          {!loading &&
            !error &&
            (files.length ? (
              <FileTable files={files.slice(0, 6)} />
            ) : (
              <Empty title="No files uploaded yet" />
            ))}
        </section>
        <section className="content-section">
          <SectionTitle title="Recent activity" />
          {!loading &&
            !error &&
            (data?.activity.length ? (
              <div className="activity-list">
                {data.activity.slice(0, 6).map((a) => (
                  <div className="activity-item" key={a.id}>
                    <ShieldCheck size={17} />
                    <div>
                      <strong>{a.action}</strong>
                      <p>{a.file_name ?? files.find((f) => f.id === a.file_id)?.name}</p>
                      <small>{new Date(a.created_at).toLocaleString()}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="quiet-empty">No workspace activity yet.</p>
            ))}
        </section>
      </div>
      <section className="integrity-band">
        <ShieldCheck />
        <div>
          <strong>Originals preserved. Every result traceable.</strong>
          <p>
            Only completed, durably ingested jobs count as processed. Storage charts use measured package bytes and verified retention receipts.
          </p>
        </div>
        <Button variant="link" asChild>
          <Link to="/settings">
            Integrations
            <ArrowRight />
          </Link>
        </Button>
      </section>
    </Shell>
  );
}

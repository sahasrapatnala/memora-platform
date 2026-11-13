import { Link } from "@tanstack/react-router";
import { Upload, Download, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, PageHeader, SectionTitle, ViewLink } from "./shell";
import { DataState, Empty, FileTable } from "./workspaces";
import { useWorkspace } from "./workspace-data";
import { measuredStorage, formatBytes } from "@/lib/memora/integrity";
import { exportCsv } from "@/lib/memora/export";
export function Dashboard() {
  const { data, loading, error, workspace } = useWorkspace();
  const files = data?.files ?? [];
  const storage = measuredStorage(
    files,
    data?.analytics ?? [],
    data?.approvals.filter((a) => a.status === "Approved").map((a) => a.id),
  );
  const processed = new Set(
    data?.jobs.filter((j) => j.status === "Completed").map((j) => j.file_id),
  ).size;
  const metrics = [
    ["Total original storage", formatBytes(storage.original), "Original file bytes"],
    ["Uploaded files", String(files.length), "Registered originals"],
    ["Processed files", String(processed), "Completed processing jobs"],
    ["Potential storage savings", formatBytes(storage.potential), "Verified package measurements"],
    ["Verified storage reclaimed", formatBytes(storage.reclaimed), "Authorized, verified actions"],
    [
      "Duplicate candidates",
      String(data?.groups.filter((g) => g.status === "Awaiting Review").length ?? 0),
      "Groups awaiting review",
    ],
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
            Processing is not connected. Storage charts appear only when measured knowledge packages
            are available.
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

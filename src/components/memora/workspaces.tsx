import { useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload,
  Search,
  Video,
  Files,
  ArrowRight,
  Download,
  ShieldCheck,
  AlertCircle,
  Copy,
  UserRound,
  FileChartColumn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shell, PageHeader, SectionTitle, Status, FileIcon } from "./shell";
import { validateFile, stamp } from "@/lib/memora/data";
import { exportCsv, download } from "@/lib/memora/export";
import { supabase } from "@/integrations/supabase/client";
import { registerOriginal } from "@/lib/memora/api.functions";
import { useWorkspace } from "./workspace-data";
import { formatBytes, measuredStorage } from "@/lib/memora/integrity";

export function DataState() {
  const { user, workspace, loading, error, refresh } = useWorkspace();
  if (loading)
    return (
      <p className="data-state" role="status">
        Loading workspace…
      </p>
    );
  if (error)
    return (
      <div className="notice" role="alert">
        <AlertCircle />
        <span>Workspace data could not be loaded. No results are shown.</span>
        <Button variant="outline" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  if (!user)
    return (
      <div className="data-state">
        <span>Sign in to access your workspace.</span>
        <Button variant="outline" asChild>
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  if (!workspace)
    return (
      <div className="data-state">
        <span>No workspace created yet.</span>
        <Button variant="outline" asChild>
          <Link to="/settings">Create workspace</Link>
        </Button>
      </div>
    );
  return null;
}
export function Empty({
  title,
  description = "Upload originals to begin building your knowledge repository.",
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <Files size={28} />
      <h2>{title}</h2>
      <p>{description}</p>
      <Button variant="outline" asChild>
        <Link to="/upload">
          <Upload />
          Upload files
        </Link>
      </Button>
    </div>
  );
}
export function ProcessorNotice() {
  return (
    <div className="notice">
      <AlertCircle size={18} />
      <span>
        Backend integration required. The Python processing service is not connected; no analysis
        results are generated.
      </span>
    </div>
  );
}
export function FileTable({
  files,
}: {
  files: NonNullable<ReturnType<typeof useWorkspace>["data"]>["files"];
}) {
  const { data } = useWorkspace();
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Original file</th>
            <th>Format</th>
            <th>Size</th>
            <th>Status</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              <td>
                <span className="file-cell">
                  <FileIcon format={f.format} />
                  <strong title={f.name}>{f.name}</strong>
                </span>
              </td>
              <td>{f.format}</td>
              <td>{formatBytes(f.size_bytes)}</td>
              <td>
                <Status value={data?.jobs.find((j) => j.file_id === f.id)?.status ?? f.status} />
              </td>
              <td>{new Date(f.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function UploadWorkspace() {
  const [selected, setSelected] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const { user, workspace, data, refresh, loading, error } = useWorkspace();
  const saved = data?.files ?? [];
  const signedIn = !!user;
  const input = useRef<HTMLInputElement>(null);
  const register = useServerFn(registerOriginal);
  const select = (files: FileList | null) => {
    if (!files) return;
    const valid: File[] = [];
    Array.from(files).forEach((f) => {
      const error = validateFile(f.name, f.size);
      if (error) toast.error(`${f.name}: ${error}`);
      else valid.push(f);
    });
    setSelected((prev) => [...prev, ...valid]);
  };
  const upload = async () => {
    if (busy || !workspace || selected.length === 0) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.info("Sign in to securely store your files");
        return;
      }
      for (const file of selected) {
        const path = `${user.id}/${crypto.randomUUID()}/${file.name}`;
        const stored = await supabase.storage.from("original-files").upload(path, file);
        if (stored.error) throw new Error("Secure upload failed");
        await register({
          data: {
            workspaceId: workspace.id,
            path,
            name: file.name,
            format: file.name.split(".").pop()?.toUpperCase() ?? "",
            size: file.size,
          },
        });
      }
      setSelected([]);
      await refresh();
      toast.success(
        "Originals securely saved and hashed. Processing is awaiting service connection.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Upload & Process">
      <PageHeader
        title="Upload & process"
        description="Preserve your originals. Prepare your next knowledge package."
      />
      <DataState />
      <div className="notice">
        <AlertCircle size={17} />
        <span>
          Secure upload is available. Transcription, diarization, and slide extraction are awaiting
          the independent processing service.
        </span>
      </div>
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          select(e.dataTransfer.files);
        }}
      >
        <Upload size={38} />
        <h2>Bring your knowledge into MEMORA</h2>
        <p>Drag and drop recordings, presentations, or documents</p>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".mp4,.mov,.mkv,.avi,.pdf,.pptx,.docx"
          onChange={(e) => select(e.target.files)}
        />
        <Button onClick={() => input.current?.click()}>
          <Upload />
          Browse files
        </Button>
        <small>MP4, MOV, MKV, AVI, PDF, PPTX, DOCX · Current upload limit: 50 MB per file</small>
      </div>
      {selected.length > 0 && (
        <section className="content-section">
          <SectionTitle title={`${selected.length} files ready to upload`} />
          {selected.map((f, i) => (
            <div className="integration-row" key={`${f.name}-${i}`}>
              <span>
                {f.name} · {(f.size / 1024 / 1024).toFixed(2)} MB
              </span>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setSelected((prev) => prev.filter((_, index) => index !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button disabled={busy || !signedIn || !workspace} onClick={upload}>
            {busy ? "Saving originals…" : "Upload & register originals"}
            <ArrowRight />
          </Button>
          {!signedIn && (
            <Button variant="link" asChild>
              <Link to="/auth">Sign in to upload</Link>
            </Button>
          )}
        </section>
      )}
      <section className="content-section">
        <SectionTitle
          title="Your saved originals"
          description="Actual files · stored securely, never automatically deleted"
        />
        {!loading && !error && saved.length === 0 ? (
          <div className="empty-state">
            <Files />
            <h2>No originals uploaded yet</h2>
            <p>
              {signedIn
                ? "Your securely uploaded files will appear here."
                : "Sign in to view and upload your originals."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ORIGINAL FILE</th>
                  <th>SIZE</th>
                  <th>STATUS</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                    <td>
                      <Status
                        value={data?.jobs.find((j) => j.file_id === f.id)?.status ?? f.status}
                      />
                    </td>
                    <td title={f.sha256 ?? ""}>{f.sha256?.slice(0, 20)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}

export function Library({ kind }: { kind: "videos" | "documents" }) {
  const { data, loading, error } = useWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const all = (data?.files ?? []).filter((f) =>
    kind === "videos"
      ? ["MP4", "MOV", "MKV", "AVI"].includes(f.format)
      : ["PDF", "PPTX", "DOCX"].includes(f.format),
  );
  const files = all.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) &&
      (status === "All statuses" ||
        (data?.jobs.find((j) => j.file_id === f.id)?.status ?? f.status) === status),
  );
  return (
    <Shell title={kind === "videos" ? "Video Intelligence" : "Document Intelligence"}>
      <PageHeader
        title={kind === "videos" ? "Video intelligence" : "Document intelligence"}
        description="Original sources and verified analysis results."
        action={
          <Button asChild>
            <Link to="/upload">
              <Upload />
              Upload files
            </Link>
          </Button>
        }
      />
      <DataState />
      <ProcessorNotice />
      <div className="toolbar">
        <Input
          aria-label={`Search ${kind}`}
          placeholder={`Search ${kind}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option>All statuses</option>
          {Array.from(
            new Set(all.map((f) => data?.jobs.find((j) => j.file_id === f.id)?.status ?? f.status)),
          ).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {!loading &&
        !error &&
        (files.length ? (
          <>
            <FileTable files={files} />
            {kind === "videos" &&
              files.map((f) => (
                <div className="integration-row" key={f.id}>
                  <span>{f.name}</span>
                  <Button variant="link" asChild>
                    <Link to="/videos/$id" params={{ id: f.id }}>
                      View recording
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ))}
          </>
        ) : (
          <Empty
            title={
              all.length
                ? "No matching files"
                : kind === "videos"
                  ? "No videos processed yet"
                  : "No documents processed yet"
            }
          />
        ))}
    </Shell>
  );
}
export function VideoDetail({ id }: { id: string }) {
  const { data, loading, error } = useWorkspace();
  const file = data?.files.find((f) => f.id === id);
  const video = data?.videos.find((v) => v.file_id === id);
  const segments = data?.transcripts.filter((s) => s.video_id === video?.id) ?? [];
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    setUrl("");
    if (!file) return;
    let current = true;
    void supabase.storage
      .from("original-files")
      .createSignedUrl(file.storage_path, 3600)
      .then((r) => {
        if (!current) return;
        if (r.error) toast.error("Could not open the original recording");
        else setUrl(r.data.signedUrl);
      });
    return () => {
      current = false;
    };
  }, [file]);
  return (
    <Shell title="Video Intelligence">
      <PageHeader
        title={file?.name ?? "Recording"}
        description="Original source, transcript and speaker references."
      />
      <DataState />
      {!loading && !error && !file ? (
        <Empty title="Recording not found" />
      ) : (
        <>
          {url && <video className="original-player" controls src={url} />}
          <ProcessorNotice />
          <SectionTitle title="Transcript" />
          {segments.length ? (
            <>
              <Input
                aria-label="Search transcript"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {segments
                .filter((s) => s.content.toLowerCase().includes(query.toLowerCase()))
                .map((s) => (
                  <article className="search-result" key={s.id}>
                    <strong>
                      {stamp(Math.floor(s.start_seconds))} ·{" "}
                      {data?.speakers.find((p) => p.id === s.speaker_id)?.label ??
                        "Unassigned speaker"}
                    </strong>
                    <p>{s.content}</p>
                  </article>
                ))}
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    segments
                      .map((s) => `${stamp(Math.floor(s.start_seconds))} ${s.content}`)
                      .join("\n\n"),
                    "transcript.txt",
                    "text/plain",
                  )
                }
              >
                <Download />
                Export transcript
              </Button>
            </>
          ) : (
            <Empty
              title="No transcript available yet"
              description="Transcription, speaker detection and slide extraction require the processing service."
            />
          )}
        </>
      )}
    </Shell>
  );
}
export function Duplicates() {
  const { data, loading, error } = useWorkspace();
  return (
    <Shell title="Duplicate Detection">
      <PageHeader
        title="Duplicate detection"
        description="Source comparisons and authorized retention review."
      />
      <DataState />
      <ProcessorNotice />
      {!loading &&
        !error &&
        (data?.groups.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g) => (
                  <tr key={g.id}>
                    <td>{g.id}</td>
                    <td>{g.method}</td>
                    <td>
                      <Status value={g.status} />
                    </td>
                    <td>Backend integration required</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No duplicate files detected yet"
            description="No duplicate candidates have been recorded. Originals remain preserved."
          />
        ))}
    </Shell>
  );
}
export function Knowledge({ initialQuery = "" }: { initialQuery?: string }) {
  const { data, loading, error } = useWorkspace();
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => setQuery(initialQuery), [initialQuery]);
  const matches = (data?.knowledge ?? []).filter((k) =>
    k.content.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Shell title="Knowledge Explorer">
      <PageHeader
        title="Knowledge explorer"
        description="Search retained knowledge with original source traceability."
      />
      <DataState />
      <div className="toolbar">
        <Input
          aria-label="Search knowledge"
          placeholder="Search knowledge…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!loading &&
        !error &&
        (matches.length ? (
          matches.map((k) => (
            <article className="search-result" key={k.id}>
              <p>{k.content}</p>
              <small>{data?.files.find((f) => f.id === k.file_id)?.name}</small>
              <div className="action-row">
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(k.content)
                      .then(() => toast.success("Text copied"))
                      .catch(() => toast.error("Could not copy text"))
                  }
                >
                  <Copy />
                  Copy text
                </Button>
              </div>
            </article>
          ))
        ) : (
          <Empty
            title={
              data?.knowledge.length ? "No knowledge matches" : "No knowledge assets available yet"
            }
            description="Searchable transcripts, pages and slide references appear only after verified extraction."
          />
        ))}
    </Shell>
  );
}
export function Storage() {
  const { data, loading, error } = useWorkspace();
  const values = measuredStorage(
    data?.files ?? [],
    data?.analytics ?? [],
    data?.approvals.filter((a) => a.status === "Approved").map((a) => a.id),
  );
  return (
    <Shell title="Storage Optimization">
      <PageHeader
        title="Storage optimization"
        description="Measured packages. Verified savings. Preserved sources."
      />
      <DataState />
      <div className="metrics-grid storage-metrics">
        {[
          ["Original storage", values.original],
          ["Verified knowledge packages", values.generated],
          ["Potential savings", values.potential],
          ["Verified reclaimed", values.reclaimed],
        ].map(([label, value]) => (
          <article className="metric" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value block">
              {loading || error ? "—" : formatBytes(Number(value))}
            </strong>
          </article>
        ))}
      </div>
      <div className="data-state">
        <ShieldCheck />
        <span>
          Potential savings are not reclaimed storage. Originals are never automatically deleted.
        </span>
      </div>
      {!loading && !error && (
        <Empty
          title="No optimization reports generated yet"
          description="Optimization recommendations require measured knowledge packages and authorized review."
        />
      )}
    </Shell>
  );
}
export function Offboarding() {
  return (
    <Shell title="Offboarding">
      <PageHeader
        title="Offboarding"
        description="Preserve knowledge through employee transitions."
      />
      <DataState />
      <ProcessorNotice />
      <Empty
        title="No offboarding cases available yet"
        description="Inventory comparison and retention review require the processing service."
      />
      <Button variant="outline" disabled>
        <UserRound />
        Inventory analysis · Coming soon
      </Button>
    </Shell>
  );
}
export function Reports() {
  const { data, loading, error } = useWorkspace();
  return (
    <Shell title="Reports">
      <PageHeader
        title="Reports"
        description="Verified workspace records and source-aware exports."
        action={
          <Button
            variant="outline"
            disabled={!data?.files.length || !!error}
            onClick={() => exportCsv(data?.files ?? [])}
          >
            <Download />
            Export file inventory
          </Button>
        }
      />
      <DataState />
      {!loading &&
        !error &&
        (data?.reports.length ? (
          data.reports.map((r) => (
            <div className="integration-row" key={r.id}>
              <span>
                <FileChartColumn /> {r.name} · {r.kind}
              </span>
              <span>Report viewer · Coming soon</span>
            </div>
          ))
        ) : (
          <Empty
            title="No reports generated yet"
            description="Processing reports appear when verified findings are available. Uploaded file inventories can be exported separately."
          />
        ))}
    </Shell>
  );
}
export function SettingsWorkspace() {
  const { user, workspace, refresh, error } = useWorkspace();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(workspace?.name ?? "");
  }, [workspace]);
  useEffect(() => {
    if (!user) return;
    void supabase
      .from("profiles")
      .select()
      .eq("id", user.id)
      .maybeSingle()
      .then((r) => {
        if (r.error) toast.error("Could not load profile");
        else setDisplayName(r.data?.display_name ?? "");
      });
  }, [user]);
  async function save() {
    if (busy || !user || !name.trim()) return;
    setBusy(true);
    try {
      if (workspace) {
        const r = await supabase
          .from("workspaces")
          .update({ name: name.trim() })
          .eq("id", workspace.id)
          .select()
          .single();
        if (r.error) throw r.error;
      } else {
        const r = await supabase.rpc("create_workspace", { workspace_name: name.trim() });
        if (r.error) throw r.error;
      }
      await refresh();
      toast.success(workspace ? "Workspace saved" : "Workspace created");
    } catch {
      toast.error("Workspace could not be saved. Only the owner may edit it.");
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const r = await supabase
        .from("profiles")
        .upsert({ id: user.id, display_name: displayName.trim() });
      if (r.error) throw r.error;
      toast.success("Profile saved");
    } catch {
      toast.error("Could not save profile");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell title="Settings">
      <PageHeader
        title="Workspace settings"
        description="Workspace identity, account access and retention safeguards."
      />
      <DataState />
      <div className="settings-grid">
        <div>
          <section className="settings-group">
            <h2>{workspace ? "Workspace" : "Create workspace"}</h2>
            <label htmlFor="workspace-name">Workspace name</label>
            <Input
              id="workspace-name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              disabled={!user || busy}
            />
            <Button disabled={!user || busy || !name.trim() || !!error} onClick={() => void save()}>
              {busy ? "Saving…" : workspace ? "Save workspace" : "Create workspace"}
            </Button>
          </section>
          <section className="settings-group">
            <h2>Profile</h2>
            <label htmlFor="display-name">Display name</label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={!user || busy}
            />
            <Button disabled={!user || busy} onClick={() => void saveProfile()}>
              Save profile
            </Button>
            <Button variant="link" asChild>
              <Link to="/auth">Manage account</Link>
            </Button>
          </section>
          <section className="settings-group">
            <h2>Retention & approvals</h2>
            <p>
              Human approval is mandatory. Originals are preserved; deletion controls are
              unavailable.
            </p>
          </section>
        </div>
        <div>
          <section className="settings-group">
            <h2>Integrations</h2>
            <div className="integration-row">
              <span>Lovable Cloud</span>
              <Status
                value={
                  error
                    ? "Connection error"
                    : workspace
                      ? "Workspace accessible"
                      : "Sign in to verify access"
                }
              />
            </div>
            <div className="integration-row">
              <span>Originals & generated assets</span>
              <span>Private storage configured</span>
            </div>
            {[
              "Python processing service",
              "Speaker diarization",
              "Slide & document extraction",
              "Near-duplicate analysis",
            ].map((n) => (
              <div className="integration-row" key={n}>
                <span>{n}</span>
                <Status value="Not connected" />
              </div>
            ))}
          </section>
          <section className="settings-group">
            <h2>Workspace access</h2>
            <p>
              Records are restricted to workspace members. Invitations and reviewer management are
              coming soon.
            </p>
          </section>
        </div>
      </div>
    </Shell>
  );
}

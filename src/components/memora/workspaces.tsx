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
import { registerOriginal, recordUploadFailure, requestProcessing } from "@/lib/memora/api.functions";
import { useWorkspace } from "./workspace-data";
import { FileManager } from "./file-manager";
import { formatBytes, measuredStorage, retentionApprovalIds, recommendationSavings } from "@/lib/memora/integrity";
import { analyzeWorkspaceDuplicates } from "@/lib/memora/duplicates.functions";
import { reviewRetentionRecommendation, deleteApprovedOriginal } from "@/lib/memora/retention.functions";
import { createOffboardingCase, getOffboardingCaseFiles, setOffboardingCaseFiles, saveOffboardingAnalysis } from "@/lib/memora/offboarding.functions";
import type { summarizeOffboarding } from "@/lib/memora/offboarding-rules";
import { uploadOriginal, UploadPaused } from "@/lib/memora/resumable-upload";
import { ProcessingReview } from "./processing-review";
import { useQuery } from "@tanstack/react-query";
import { searchKnowledge, askMemora } from "@/lib/memora/knowledge.functions";
import type { SourceCitation } from "@/lib/memora/knowledge-source";

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
  const { data } = useWorkspace();
  if (data?.jobs.some((job) => job.status === "Completed")) return null;
  return (
    <div className="notice">
      <AlertCircle size={18} />
      <span>No verified processing results yet. Processing starts only after reviewer approval and secure dispatch configuration.</span>
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
  const request = useServerFn(requestProcessing);
  const logFailure = useServerFn(recordUploadFailure);
  const [uploadStates, setUploadStates] = useState<Record<string, string>>({});
  const activeUpload = useRef<AbortController | null>(null);
  const [transferring, setTransferring] = useState(false);
  useEffect(() => () => activeUpload.current?.abort(), []);
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
      const failed: File[] = [];
      for (const [index, file] of selected.entries()) {
        const key = `${file.name}-${file.size}`;
        try {
          const controller = new AbortController();
          activeUpload.current = controller;
          setTransferring(true);
          setUploadStates((prev) => ({ ...prev, [key]: "Connecting to private storage…" }));
          const stored = await uploadOriginal(file, user.id, workspace.id, controller.signal, (sent, total) => {
            setUploadStates((prev) => ({ ...prev, [key]: `Uploading · ${Math.floor(sent / total * 100)}% · ${formatBytes(sent)} / ${formatBytes(total)}` }));
          });
          setTransferring(false);
          activeUpload.current = null;
          setUploadStates((prev) => ({ ...prev, [key]: "Verifying and saving metadata…" }));
          const registered = await register({ data: { workspaceId: workspace.id, path: stored.path, name: file.name, format: file.name.split(".").pop()?.toUpperCase() ?? "", size: file.size } });
          stored.complete();
          try {
            await request({ data: { workspaceId: workspace.id, fileId: registered.id } });
            setUploadStates((prev) => ({ ...prev, [key]: "Uploaded · Awaiting review" }));
          } catch {
            setUploadStates((prev) => ({ ...prev, [key]: "Uploaded · Review request failed; retry from file details" }));
            toast.error(`${file.name}: original saved, but its review request could not be created.`);
          }
        } catch (error) {
          setTransferring(false);
          activeUpload.current = null;
          if (error instanceof UploadPaused) {
            failed.push(...selected.slice(index));
            setUploadStates((prev) => ({ ...prev, [key]: "Paused" }));
            break;
          }
          failed.push(file);
          setUploadStates((prev) => ({ ...prev, [key]: "Interrupted or verification failed. Retry / resume." }));
          toast.error(`${file.name}: ${error instanceof Error ? error.message : "Upload failed"}`);
          try { await logFailure({ data: { workspaceId: workspace.id, name: file.name.slice(0,255) } }); }
          catch { toast.error("Upload failure could not be added to activity history."); }
        }
      }
      setSelected(failed);
      await refresh();
      if (!failed.length) toast.success("Originals securely saved and hashed. Review requests remain separate from processing approval.");
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
          Secure upload is available. After upload, a review request is created; only approved, verified worker results are shown.
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
          accept=".mp4,.mov,.pdf,.pptx,.docx"
          onChange={(e) => select(e.target.files)}
        />
        <Button onClick={() => input.current?.click()}>
          <Upload />
          Browse files
        </Button>
        <small>MP4, MOV, PDF, PPTX, DOCX · Current upload limit: 5 GiB per file</small>
      </div>
      {selected.length > 0 && (
        <section className="content-section">
          <SectionTitle title={`${selected.length} files ready to upload`} />
          {selected.map((f, i) => (
            <div className="integration-row" key={`${f.name}-${i}`}>
              <span>
                {f.name} · {(f.size / 1024 / 1024).toFixed(2)} MB
                <span role="status">{uploadStates[`${f.name}-${f.size}`] ?? "Ready"}</span>
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
            {busy ? "Saving originals…" : "Upload / resume originals"}
            <ArrowRight />
          </Button>
          {transferring && <Button variant="outline" onClick={() => activeUpload.current?.abort()}>Pause upload</Button>}
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
        {!loading && !error && <FileManager files={saved} />}
      </section>
      <ProcessingReview />
      {!!data?.jobs.length && <section className="content-section">
        <SectionTitle title="Processing progress" />
        {data.jobs.map(job => <div className="integration-row" key={job.id}>
          <span>{saved.find(file => file.id === job.file_id)?.name ?? "Original"}</span>
          <span role="status">{job.stage} · {job.status}{job.progress == null ? "" : ` · ${job.progress}%`}{job.error ? ` · ${job.error}` : ""}</span>
        </div>)}
      </section>}
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
            <FileManager files={files} />
            {files.map((f) => (
              <div className="integration-row" key={f.id}>
                <span>{f.name}</span>
                <Button variant="link" asChild>
                  {kind === "videos" ? <Link to="/videos/$id" params={{ id: f.id }} search={{ t: undefined }}>View recording<ArrowRight /></Link> : <Link to="/documents/$id" params={{ id: f.id }} search={{ page: undefined, slide: undefined }}>View extracted content<ArrowRight /></Link>}
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
function SourceBrief({ fileId }: { fileId: string }) {
  const { workspace } = useWorkspace();
  const ask = useServerFn(askMemora);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ answer: string | null; citations: SourceCitation[]; generated: boolean; error?: string } | null>(null);
  return <section className="content-section"><SectionTitle title="Grounded source brief" description="On-demand AI summary of main topics, decisions and action items; never part of the original source." />
    <Button variant="outline" disabled={!workspace || busy} onClick={async () => {
      if (!workspace || busy) return; setBusy(true);
      try { setResult(await ask({ data: { workspaceId: workspace.id, fileId, mode: "summary", question: "Summarize the main topics, important decisions and action items in these source excerpts. Cite exact evidence and say when each category is absent." } })); }
      catch { toast.error("Source brief could not be generated"); }
      finally { setBusy(false); }
    }}>{busy ? "Retrieving source evidence…" : "Generate source brief"}</Button>
    {result?.error && <div className="notice" role="alert"><AlertCircle /><span>{result.error}</span></div>}
    {result?.answer && <div className={result.generated ? "generated-answer" : "evidence-answer"}><strong>{result.generated ? "AI-generated · verify against citations" : "Evidence status"}</strong><p>{result.answer}</p></div>}
    {!!result?.citations.length && <div>{result.citations.map((citation, index) => <a className="citation" key={citation.chunkId} href={citation.to}>[{index + 1}] {citation.label}</a>)}</div>}
  </section>;
}

export function VideoDetail({ id, initialSeconds = 0 }: { id: string; initialSeconds?: number }) {
  const { data, loading, error } = useWorkspace();
  const file = data?.files.find((f) => f.id === id);
  const video = data?.videos.filter((v) => v.file_id === id).at(-1);
  const segments = data?.transcripts.filter((s) => s.video_id === video?.id) ?? [];
  const frames = data?.frames.filter((frame) => frame.video_id === video?.id) ?? [];
  const [url, setUrl] = useState("");
  const [frameUrls, setFrameUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setUrl("");
    if (!file) return;
    let current = true;
    void supabase.storage.from("original-files").createSignedUrl(file.storage_path, 3600).then((r) => {
      if (!current) return;
      if (r.error) toast.error("Could not open the original recording");
      else setUrl(r.data.signedUrl);
    });
    return () => { current = false; };
  }, [file]);
  useEffect(() => {
    if (!frames.length) return;
    let current = true;
    const paths = frames.flatMap((frame) => {
      const thumbnail = (frame as typeof frame & { thumbnail_path?: string | null }).thumbnail_path;
      return thumbnail ? [frame.storage_path, thumbnail] : [frame.storage_path];
    });
    void supabase.storage.from("generated-assets").createSignedUrls(paths, 3600).then((result) => {
      if (!current) return;
      if (result.error) { toast.error("Extracted frames could not be opened"); return; }
      setFrameUrls(Object.fromEntries(result.data.map((item) => [item.path, item.signedUrl])));
    });
    return () => { current = false; };
  }, [video?.id]);
  const seek = (seconds: number) => {
    if (!player.current) return;
    player.current.currentTime = seconds;
    player.current.scrollIntoView({ behavior: "smooth", block: "center" });
    void player.current.play().catch(() => undefined);
  };
  const visibleSegments = segments.filter((segment) => segment.content.toLowerCase().includes(query.toLowerCase()));
  return (
    <Shell title="Video Intelligence">
      <PageHeader title={file?.name ?? "Recording"} description="Original source, timestamped transcript and extracted frames." />
      <DataState />
      {!loading && !error && !file ? <Empty title="Recording not found" /> : <>
        {url && <video ref={player} className="original-player" controls src={url} onLoadedMetadata={() => {
          if (player.current && initialSeconds > 0) player.current.currentTime = initialSeconds;
        }} />}
        <ProcessorNotice />
        <SourceBrief fileId={id} />
        {video && <p className="quiet-empty">Duration: {stamp(Math.floor(video.duration_seconds ?? 0))} · Speaker attribution: {segments.some((s) => s.speaker_id) ? "Available as anonymous labels" : "Unavailable"}</p>}
        <SectionTitle title="Visual timeline" description={`${frames.length} verified frames sampled across the recording`} />
        {!!frames.length && <div className="frame-timeline">{frames.map((frame) => {
          const thumbnail = (frame as typeof frame & { thumbnail_path?: string | null }).thumbnail_path;
          const source = frameUrls[thumbnail || frame.storage_path];
          return <button type="button" key={frame.id} onClick={() => seek(frame.timestamp_seconds)} aria-label={`Open video at ${stamp(Math.floor(frame.timestamp_seconds))}`}>
            {source ? <img src={source} alt={`Extracted frame at ${stamp(Math.floor(frame.timestamp_seconds))}`} /> : <span>Frame unavailable</span>}
            <strong>{stamp(Math.floor(frame.timestamp_seconds))}</strong>
          </button>;
        })}</div>}
        <SectionTitle title="Transcript" description={`${segments.length} persisted timestamped segments`} />
        {segments.length ? <>
          <Input aria-label="Search transcript" value={query} onChange={(event) => setQuery(event.target.value)} />
          {visibleSegments.map((segment) => <article className="search-result" key={segment.id}>
            <button type="button" className="timestamp-link" onClick={() => seek(segment.start_seconds)}>
              {stamp(Math.floor(segment.start_seconds))} – {stamp(Math.floor(segment.end_seconds))}
            </button>
            <strong>{data?.speakers.find((speaker) => speaker.id === segment.speaker_id)?.label ?? "Speaker attribution unavailable"}</strong>
            <p>{segment.content}</p>
          </article>)}
          {!visibleSegments.length && <p className="quiet-empty">No transcript segments match this search.</p>}
          <Button variant="outline" onClick={() => download(segments.map((s) => `${stamp(Math.floor(s.start_seconds))} ${s.content}`).join("\n\n"), "transcript.txt", "text/plain")}><Download />Export transcript</Button>
        </> : <Empty title="No transcript available yet" description="Transcript segments appear after verified processing and durable ingestion." />}
      </>}
    </Shell>
  );
}

export function DocumentDetail({ id, initial }: { id: string; initial: { page?: number; slide?: number } }) {
  const { data, loading, error } = useWorkspace();
  const file = data?.files.find((candidate) => candidate.id === id);
  const document = data?.documents.filter((candidate) => candidate.file_id === id).at(-1);
  const pages = data?.pages.filter((page) => page.document_id === document?.id) ?? [];
  const slides = data?.slides.filter((slide) => slide.document_id === document?.id) ?? [];
  const [query, setQuery] = useState("");
  const visiblePages = pages.filter((page) => (page.content ?? "").toLowerCase().includes(query.toLowerCase()));
  const visibleSlides = slides.filter((slide) => {
    const extra = slide as typeof slide & { title?: string | null; notes?: string | null };
    return `${extra.title ?? ""}\n${slide.content ?? ""}\n${extra.notes ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });
  useEffect(() => {
    const target = initial.page ? `page-${initial.page}` : initial.slide ? `slide-${initial.slide}` : null;
    if (target) globalThis.document.getElementById(target)?.scrollIntoView({ block: "center" });
  }, [document?.id, initial.page, initial.slide]);
  return <Shell title="Document Intelligence">
    <PageHeader title={file?.name ?? "Document"} description="Persisted page and slide extraction with stable source hashes." />
    <DataState />
    {!loading && !error && !file ? <Empty title="Document not found" /> : <>
      <ProcessorNotice />
      <SourceBrief fileId={id} />
      <Input aria-label="Search within document" placeholder="Search extracted content…" value={query} onChange={(event) => setQuery(event.target.value)} />
      {file?.format === "PPTX" ? <>
        <SectionTitle title="Slides" description={`${slides.length} persisted slides`} />
        {visibleSlides.map((slide) => {
          const extra = slide as typeof slide & { title?: string | null; notes?: string | null };
          return <article className="document-result" id={`slide-${slide.slide_number}`} key={slide.id}>
            <h3>Slide {slide.slide_number}{extra.title ? ` · ${extra.title}` : ""}</h3>
            <p>{slide.content || "No extractable slide text."}</p>
            {extra.notes && <><strong>Speaker notes</strong><p>{extra.notes}</p></>}
            <small>SHA-256 · {slide.sha256 ?? "Unavailable"}</small>
          </article>;
        })}
      </> : <>
        <SectionTitle title="Pages" description={`${pages.length} persisted pages`} />
        {visiblePages.map((page) => {
          const ocrRequired = (page as typeof page & { ocr_required?: boolean | null }).ocr_required;
          return <article className="document-result" id={`page-${page.page_number}`} key={page.id}>
            <h3>Page {page.page_number}</h3>
            <p>{page.content || (ocrRequired ? "No extractable text. OCR is required; no text was discarded or invented." : "No extractable text on this page.")}</p>
            <small>SHA-256 · {page.sha256 ?? "Unavailable"}</small>
          </article>;
        })}
      </>}
      {document && !visiblePages.length && !visibleSlides.length && <p className="quiet-empty">No pages or slides match this search.</p>}
      {!document && !loading && <Empty title="No extracted document results" description="Pages and slides appear after verified processing and durable ingestion." />}
    </>}
  </Shell>;
}
export function Duplicates() {
  const { workspace, data, loading, error, refresh } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const analyze = useServerFn(analyzeWorkspaceDuplicates);
  return <Shell title="Duplicate Detection">
    <PageHeader title="Duplicate detection" description="Measured exact matches and explainable near-duplicate candidates; never automatic deletion." action={<Button disabled={!workspace || busy} onClick={async () => {
      if (!workspace || busy) return;
      setBusy(true);
      try {
        const result = await analyze({ data: { workspaceId: workspace.id } });
        await refresh();
        toast.success(`${result.groups} groups saved: ${result.exact} exact and ${result.near} near-duplicate candidates.`);
      } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Duplicate analysis failed"); }
      finally { setBusy(false); }
    }}>{busy ? "Analyzing…" : "Run duplicate analysis"}</Button>} />
    <DataState />
    {!loading && !error && (data?.groups.length ? data.groups.map((group) => {
      const extra = group as typeof group & { retained_file_id?: string | null; potential_savings_bytes?: number | null; evidence?: Record<string, unknown> | null };
      const matches = data.matches.filter((match) => match.group_id === group.id);
      return <section className="duplicate-group" key={group.id}>
        <div className="section-heading"><div><h2>{group.method}</h2><p>{matches.length} source files · {formatBytes(extra.potential_savings_bytes ?? 0)} potential whole-file savings</p></div><Status value={group.status} /></div>
        {extra.retained_file_id && <p>Recommended retained copy: <strong>{data.files.find((file) => file.id === extra.retained_file_id)?.name ?? extra.retained_file_id}</strong></p>}
        <small>Evidence: {String(extra.evidence?.["algorithm"] ?? group.method)}. Near duplicates and extracted-content matches are not deletion authorization.</small>
        <div className="table-scroll"><table><thead><tr><th>Source</th><th>Similarity</th><th>Evidence reference</th></tr></thead><tbody>{matches.map((match) => {
          const evidence = match as typeof match & { evidence?: Record<string, unknown> | null };
          return <tr key={match.id}><td>{data.files.find((file) => file.id === match.file_id)?.name ?? match.file_id}</td><td>{match.similarity === null ? "Exact" : `${(match.similarity * 100).toFixed(1)}%`}</td><td>{String(evidence.evidence?.["source_id"] ?? evidence.evidence?.["sha256"] ?? "Original SHA-256")}</td></tr>;
        })}</tbody></table></div>
      </section>;
    }) : <Empty title="No duplicate groups recorded" description="Run analysis to compare actual uploaded hashes and extracted content. Originals remain preserved." />)}
  </Shell>;
}
export function Knowledge({ initialQuery = "" }: { initialQuery?: string }) {
  const { workspace, loading, error } = useWorkspace();
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [format, setFormat] = useState<"MP4" | "MOV" | "PDF" | "PPTX" | "DOCX" | "">("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string | null; citations: SourceCitation[]; generated: boolean; error?: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const ask = useServerFn(askMemora);
  useEffect(() => { setQuery(initialQuery); setSubmitted(initialQuery); }, [initialQuery]);
  const search = useQuery({
    queryKey: ["knowledge-search", workspace?.id, submitted, format],
    enabled: !!workspace,
    queryFn: () => searchKnowledge({ data: { workspaceId: workspace!.id, query: submitted, format: format || undefined } }),
  });
  return <Shell title="Knowledge Explorer">
    <PageHeader title="Knowledge explorer" description="Bounded workspace search with direct page, slide and timestamp citations." />
    <DataState />
    <form className="toolbar" onSubmit={(event) => { event.preventDefault(); setSubmitted(query.trim()); }}>
      <Input aria-label="Search knowledge" placeholder="Search extracted knowledge…" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} />
      <select aria-label="Filter knowledge by file type" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>
        <option value="">All source types</option>{["MP4", "MOV", "PDF", "PPTX", "DOCX"].map((value) => <option key={value}>{value}</option>)}
      </select>
      <Button type="submit"><Search />Search</Button>
    </form>
    {search.error && <div className="notice" role="alert"><AlertCircle /><span>Search failed. No results are shown.</span><Button variant="outline" onClick={() => void search.refetch()}>Retry</Button></div>}
    {search.isLoading && <p role="status">Searching verified workspace knowledge…</p>}
    {!search.isLoading && !search.error && (search.data?.length ? search.data.map((item) => <article className="search-result" key={item.id}>
      <a className="source-link" href={item.citation.to}>{item.citation.label}</a>
      <p>{item.content || "No extractable text; open the source reference for page status."}</p>
      <small>{item.citation.fileName}</small>
      <div className="action-row"><Button variant="outline" onClick={() => void navigator.clipboard.writeText(item.content).then(() => toast.success("Text copied")).catch(() => toast.error("Could not copy text"))}><Copy />Copy text</Button></div>
    </article>) : <Empty title={submitted ? "No knowledge matches" : "No knowledge assets available yet"} description="Search includes only verified transcript segments, PDF pages and presentation slides." />)}
    <section className="content-section ask-panel">
      <SectionTitle title="Ask MEMORA" description="AI-generated answers use only retrieved workspace evidence and always include sources." />
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (!workspace || asking || question.trim().length < 3) return;
        setAsking(true); setAnswer(null);
        try { setAnswer(await ask({ data: { workspaceId: workspace.id, question: question.trim() } })); }
        catch { setAnswer({ answer: null, citations: [], generated: false, error: "The question could not be answered. Your input is preserved; please retry." }); }
        finally { setAsking(false); }
      }}>
        <label htmlFor="memora-question">Question about extracted workspace content</label>
        <textarea id="memora-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} rows={4} />
        <Button disabled={asking || !workspace || question.trim().length < 3}>{asking ? "Retrieving evidence…" : "Ask with citations"}</Button>
      </form>
      {answer?.error && <div className="notice" role="alert"><AlertCircle /><span>{answer.error}</span></div>}
      {answer?.answer && <div className={answer.generated ? "generated-answer" : "evidence-answer"}><strong>{answer.generated ? "AI-generated answer · verify against citations" : "Evidence status"}</strong><p>{answer.answer}</p></div>}
      {!!answer?.citations.length && <div><h3>Retrieved source evidence</h3>{answer.citations.map((citation, index) => <a className="citation" key={citation.chunkId} href={citation.to}>[{index + 1}] {citation.label}</a>)}</div>}
    </section>
  </Shell>;
}
export function Storage() {
  const { user, data, loading, error, refresh } = useWorkspace();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const review = useServerFn(reviewRetentionRecommendation);
  const remove = useServerFn(deleteApprovedOriginal);
  const values = measuredStorage(data?.files ?? [], data?.analytics ?? [], retentionApprovalIds(data?.approvals ?? []));
  const recommendations = data?.recommendations ?? [];
  const metrics = [
    ["Original storage", values.original],
    ["Verified knowledge packages", values.generated],
    ["Package optimization potential", values.potential],
    ["Pending duplicate savings", recommendationSavings(recommendations)],
    ["Approved duplicate savings", recommendationSavings(recommendations, "Approved")],
    ["Verified reclaimed", values.reclaimed],
  ];
  return <Shell title="Storage Optimization">
    <PageHeader title="Storage optimization" description="Measured packages. Separately reviewed retention. Verified reclaimed bytes." />
    <DataState />
    <div className="metrics-grid storage-metrics">{metrics.map(([label, value]) => <article className="metric" key={label}><span className="metric-label">{label}</span><strong className="metric-value block">{loading || error ? "—" : formatBytes(Number(value))}</strong></article>)}</div>
    <div className="data-state"><ShieldCheck /><span>Potential and approved savings are not reclaimed storage. Deletion requires reviewer approval, exact retained-copy verification and owner confirmation.</span></div>
    <SectionTitle title="Retention recommendations" description={`${recommendations.length} persisted recommendations`} />
    {!loading && !error && (recommendations.length ? recommendations.map((recommendation) => {
      const extra = recommendation as typeof recommendation & { retained_file_id?: string | null; potential_savings_bytes?: number | null };
      const original = data?.files.find((file) => file.id === recommendation.file_id);
      const retained = data?.files.find((file) => file.id === extra.retained_file_id);
      const approval = data?.approvals.find((item) => item.file_id === recommendation.file_id && item.status === "Approved" && item.processing_job_id === null);
      return <article className="retention-card" key={recommendation.id}>
        <div><Status value={recommendation.status} /><h3>{original?.name ?? recommendation.file_id}</h3><p>{recommendation.reason}</p></div>
        <dl><div><dt>Retained copy</dt><dd>{retained?.name ?? extra.retained_file_id ?? "Not assigned"}</dd></div><div><dt>Potential savings</dt><dd>{formatBytes(extra.potential_savings_bytes ?? 0)}</dd></div></dl>
        {recommendation.status === "Awaiting Review" && <div className="review-controls"><Input aria-label={`Retention reason for ${recommendation.id}`} placeholder="Decision reason" maxLength={1000} value={reasons[recommendation.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [recommendation.id]: event.target.value }))} />
          {(["Approved", "Rejected"] as const).map((decision) => <Button key={decision} variant={decision === "Rejected" ? "outline" : "default"} disabled={!!busy || !reasons[recommendation.id]?.trim()} onClick={async () => {
            setBusy(recommendation.id);
            try { await review({ data: { recommendationId: recommendation.id, decision, reason: reasons[recommendation.id]! } }); await refresh(); toast.success(`Retention recommendation ${decision.toLowerCase()}.`); }
            catch (reason) { toast.error(reason instanceof Error ? reason.message : "Decision failed"); }
            finally { setBusy(null); }
          }}>{decision}</Button>)}</div>}
        {recommendation.status === "Approved" && original && user?.id === original.user_id && approval && <Button variant="destructive" disabled={!!busy} onClick={async () => {
          if (!window.confirm(`Permanently delete ${original.name}? The exact retained copy will be verified again first.`)) return;
          setBusy(recommendation.id);
          try { const result = await remove({ data: { recommendationId: recommendation.id, approvalId: approval.id, confirmed: true } }); await refresh(); toast.success(`Original deleted; ${formatBytes(result.reclaimedBytes)} verified reclaimed.`); }
          catch (reason) { toast.error(reason instanceof Error ? reason.message : "Deletion failed"); }
          finally { setBusy(null); }
        }}>{busy === recommendation.id ? "Verifying and deleting…" : "Confirm permanent deletion"}</Button>}
      </article>;
    }) : <Empty title="No retention recommendations" description="Run duplicate analysis to create exact-copy recommendations. Near duplicates never become automatic deletion candidates." />)}
  </Shell>;
}
export function Offboarding() {
  const { workspace, data, refresh } = useWorkspace();
  const [name, setName] = useState("");
  const [caseId, setCaseId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ReturnType<typeof summarizeOffboarding> | null>(null);
  const create = useServerFn(createOffboardingCase);
  const saveFiles = useServerFn(setOffboardingCaseFiles);
  const analyze = useServerFn(analyzeWorkspaceDuplicates);
  const saveAnalysis = useServerFn(saveOffboardingAnalysis);
  const inventory = useQuery({
    queryKey: ["offboarding-inventory", caseId], enabled: !!caseId,
    queryFn: () => getOffboardingCaseFiles({ data: { caseId } }),
  });
  useEffect(() => { if (inventory.data) setSelected(inventory.data); }, [inventory.data]);
  useEffect(() => {
    const current = data?.cases.find((item) => item.id === caseId) as (NonNullable<typeof data>["cases"][number] & { summary?: ReturnType<typeof summarizeOffboarding> | null }) | undefined;
    setSummary(current?.summary ?? null);
  }, [caseId, data?.cases]);
  return <Shell title="Offboarding">
    <PageHeader title="Offboarding" description="Select an employee inventory, compare it with workspace knowledge and preserve unique information." />
    <DataState />
    <section className="content-section"><SectionTitle title="Employee transition cases" />
      <form className="toolbar" onSubmit={async (event) => {
        event.preventDefault(); if (!workspace || busy || !name.trim()) return;
        setBusy(true);
        try { const result = await create({ data: { workspaceId: workspace.id, name: name.trim() } }); setCaseId(result.id); setName(""); await refresh(); toast.success("Offboarding case created"); }
        catch (reason) { toast.error(reason instanceof Error ? reason.message : "Case could not be created"); }
        finally { setBusy(false); }
      }}><Input aria-label="Offboarding case name" placeholder="Employee or transition name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /><Button disabled={!workspace || busy || !name.trim()}><UserRound />Create case</Button></form>
      {!!data?.cases.length && <select aria-label="Select offboarding case" value={caseId} onChange={(event) => { setCaseId(event.target.value); setSummary(null); }}><option value="">Select a case</option>{data.cases.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.status}</option>)}</select>}
      {!data?.cases.length && <p className="quiet-empty">No offboarding cases yet.</p>}
    </section>
    {caseId && <section className="content-section"><SectionTitle title="Inventory selection" description="Only existing uploaded originals in this workspace can be selected." action={<Button variant="link" asChild><Link to="/upload">Upload files</Link></Button>} />
      <div className="inventory-grid">{data?.files.map((file) => <label key={file.id}><input type="checkbox" checked={selected.includes(file.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))} /><span>{file.name}<small>{formatBytes(file.size_bytes)}</small></span></label>)}</div>
      {inventory.error && <p role="alert">The saved inventory could not be loaded.</p>}
      <Button disabled={busy || !workspace || !selected.length} onClick={async () => {
        if (!workspace || busy) return; setBusy(true);
        try {
          await saveFiles({ data: { caseId, fileIds: selected } });
          await analyze({ data: { workspaceId: workspace.id } });
          const result = await saveAnalysis({ data: { caseId } });
          setSummary(result); await refresh();
          toast.success("Inventory comparison saved. No files were deleted.");
        } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Inventory analysis failed"); }
        finally { setBusy(false); }
      }}>{busy ? "Comparing inventory…" : "Save selection & analyze"}</Button>
    </section>}
    {summary && <section className="content-section"><SectionTitle title="Preservation analysis" description="Potential savings require the separate retention workflow; this case authorizes no deletion." />
      <div className="metrics-grid">{[["Selected files", summary.selectedFiles], ["Exact duplicate groups", summary.exactGroups], ["Near-duplicate groups", summary.nearGroups], ["Potential savings", formatBytes(summary.potentialSavings)]].map(([label, value]) => <article className="metric" key={label}><span className="metric-label">{label}</span><strong className="metric-value block">{value}</strong></article>)}</div>
      <h3>Unique information to preserve</h3>{summary.uniqueFiles.length ? <ul>{summary.uniqueFiles.map((id) => <li key={id}>{data?.files.find((file) => file.id === id)?.name ?? id}</li>)}</ul> : <p>No files without a recorded comparison match. This is not deletion authorization.</p>}
      <Button variant="outline" asChild><Link to="/storage">Review retention separately<ArrowRight /></Link></Button>
    </section>}
  </Shell>;
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
              Originals are never automatically deleted. Only their owner can confirm permanent deletion; activity history is retained.
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
            {["Python processing service", "Speaker diarization", "Slide & document extraction", "Near-duplicate analysis"].map((n) => (
              <div className="integration-row" key={n}>
                <span>{n}</span>
                <Status value={n === "Speaker diarization" ? "Unavailable" : "Review / configuration required"} />
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

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
  Check,
  HardDrive,
  FileChartColumn,
  Play,
  UserRound,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shell, PageHeader, SampleLabel, SectionTitle, Status, FileIcon } from "./shell";
import { sampleFiles, segments, stamp, validateFile } from "@/lib/memora/data";
import { exportCsv, exportTranscript } from "@/lib/memora/export";
import { supabase } from "@/integrations/supabase/client";
import { registerOriginal } from "@/lib/memora/api.functions";
import type { Tables } from "@/integrations/supabase/types";

export function UploadWorkspace() {
  const [selected, setSelected] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Tables<"files">[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const register = useServerFn(registerOriginal);
  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setSignedIn(!!user);
    if (user) {
      const result = await supabase
        .from("files")
        .select()
        .order("created_at", { ascending: false });
      if (result.error) toast.error("Could not load saved originals");
      else setSaved(result.data ?? []);
    }
  };
  useEffect(() => {
    void load();
  }, []);
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
            path,
            name: file.name,
            format: file.name.split(".").pop()?.toUpperCase() ?? "",
            size: file.size,
          },
        });
      }
      setSelected([]);
      await load();
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
        action={<SampleLabel />}
      />
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
                onClick={() => setSelected((prev) => prev.filter((_, index) => index !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button disabled={busy || !signedIn} onClick={upload}>
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
        {saved.length === 0 ? (
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
                      <Status value="Awaiting Review" />
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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [doc, setDoc] = useState<string | null>(null);
  const files = sampleFiles.filter(
    (f) =>
      (kind === "videos" ? f.format === "MP4" : f.format !== "MP4") &&
      f.name.toLowerCase().includes(search.toLowerCase()) &&
      (status === "All statuses" || f.status === status),
  );
  return (
    <Shell title={kind === "videos" ? "Video Intelligence" : "Document Intelligence"}>
      <PageHeader
        title={kind === "videos" ? "Video intelligence" : "Document intelligence"}
        description={
          kind === "videos"
            ? "Every recording, connected to the knowledge within."
            : "Explore extracted pages, slides, and source references."
        }
        action={
          <Button asChild>
            <Link to="/upload">
              <Upload />
              Upload {kind === "videos" ? "recording" : "document"}
            </Link>
          </Button>
        }
      />
      <div className="toolbar">
        <Input
          placeholder={`Search ${kind}...`}
          aria-label={`Search ${kind}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>All statuses</option>
          <option>Completed</option>
          <option>Awaiting Review</option>
        </select>
        <SampleLabel />
      </div>
      <div className="file-grid">
        {files.map((f) => (
          <article className="library-item" key={f.id}>
            <div className="library-preview">
              {kind === "videos" ? <Video /> : <Files />}
              <span className="preview-caption">
                {kind === "videos"
                  ? "Illustrative recording · Source not connected"
                  : "Sample document · Preview unavailable"}
              </span>
            </div>
            <div className="library-content">
              <h3>{f.name}</h3>
              <p>
                {f.size} · {f.date} · {f.assets} knowledge assets
              </p>
              <Status value={f.status} />
              <div className="action-row">
                {kind === "videos" ? (
                  <Button variant="outline" asChild>
                    <Link to="/videos/$id" params={{ id: f.id }}>
                      Open analysis
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setDoc(f.name)}>
                    View document
                    <ArrowRight />
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {files.length === 0 && (
        <div className="empty-state">
          <Search />
          <h2>No matching files</h2>
          <p>Try another search or status.</p>
        </div>
      )}
      <Dialog open={!!doc} onOpenChange={() => setDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{doc}</DialogTitle>
            <DialogDescription>
              Sample document record. Real page images, text, hashes, and author metadata will
              appear after processing.
            </DialogDescription>
          </DialogHeader>
          <div className="empty-state">
            <Files />
            <p>Original document is not attached to this sample.</p>
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
export function VideoDetail({ id }: { id: string }) {
  const [active, setActive] = useState(1);
  const [speaker, setSpeaker] = useState("All speakers");
  const [search, setSearch] = useState("");
  const [correction, setCorrection] = useState(false);
  const [label, setLabel] = useState("Speaker 1");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [currentSpeaker, setCurrentSpeaker] = useState("Speaker 1");
  const file = sampleFiles.find((f) => f.id === id);
  const segment = segments.find((s) => s.id === active) ?? segments[0];
  return (
    <Shell title="Video Intelligence">
      <PageHeader
        eyebrow="VIDEO INTELLIGENCE / VISUAL TRANSCRIPT"
        title={file?.name.replace(".mp4", "") ?? "Recording not found"}
        description="Timestamped speech. Consistent speakers. Connected source references."
        action={<SampleLabel />}
      />
      <div className="notice">
        <AlertCircle size={17} />
        Illustrative transcript only. The original recording and actual slide screenshots are not
        connected.
      </div>
      <div className="detail-grid">
        <div>
          <div className="source-unavailable">
            <Play size={38} />
            <h3>Original recording unavailable</h3>
            <p>
              Selected timestamp {stamp(segment.start)} · FRAME_00{segment.slide}
            </p>
            <span>Sample source reference</span>
          </div>
          <div className="detail-meta">
            <span>{file?.size ?? "Unknown size"}</span>
            <span>4 sample segments</span>
            <span>2 anonymous speakers</span>
            <span>Original preserved</span>
          </div>
          <SectionTitle
            title={segment.title}
            description={`FRAME_00${segment.slide} · ${stamp(segment.start)}–${stamp(segment.end)}`}
          />
          <div className="slide-placeholder">
            <Files />
            <strong>Actual screenshot unavailable</strong>
            <small>Generated images are never substituted for extracted slides.</small>
          </div>
          <div className="slide-timeline">
            {segments.map((s) => (
              <Button
                key={s.id}
                variant="ghost"
                className={`slide-tile ${active === s.id ? "selected" : ""}`}
                onClick={() => setActive(s.id)}
              >
                <span className="slide-placeholder">
                  <Files size={22} />
                  <span>Slide {s.slide}</span>
                  <small>Sample reference</small>
                </span>
                <strong>
                  {stamp(s.start)} · FRAME_00{s.slide}
                </strong>
                <span>{s.title}</span>
              </Button>
            ))}
          </div>
        </div>
        <section className="chart-panel">
          <SectionTitle
            title="Visual transcript"
            action={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit sample speaker label"
                onClick={() => {
                  setCurrentSpeaker("Speaker 1");
                  setLabel(labels["Speaker 1"] ?? "Speaker 1");
                  setCorrection(true);
                }}
              >
                <Settings2 />
              </Button>
            }
          />
          <div className="toolbar px-5">
            <Input
              aria-label="Search transcript"
              placeholder="Search transcript..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter by speaker"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
            >
              <option>All speakers</option>
              <option>Speaker 1</option>
              <option>Speaker 2</option>
            </select>
          </div>
          <div className="speaker-summary px-5">
            {["Speaker 1", "Speaker 2"].map((name) => (
              <div key={name}>
                <strong className={name === "Speaker 2" ? "speaker-two" : ""}>
                  {labels[name] ?? name}
                </strong>
                <p>2 sample segments</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setCurrentSpeaker(name);
                    setLabel(labels[name] ?? name);
                    setCorrection(true);
                  }}
                >
                  Edit label
                </Button>
              </div>
            ))}
          </div>
          <div className="transcript-list">
            {segments
              .filter(
                (s) =>
                  (speaker === "All speakers" || s.speaker === speaker) &&
                  s.text.toLowerCase().includes(search.toLowerCase()),
              )
              .map((s) => (
                <Button
                  key={s.id}
                  variant="ghost"
                  className={`transcript-segment ${active === s.id ? "selected" : ""}`}
                  onClick={() => setActive(s.id)}
                >
                  <div>
                    <div className="segment-meta">
                      <span>{stamp(s.start)}</span>
                      <strong className={s.speaker === "Speaker 2" ? "speaker-two" : ""}>
                        {labels[s.speaker] ?? s.speaker}
                      </strong>
                      <span>FRAME_00{s.slide}</span>
                    </div>
                    <p>{s.text}</p>
                  </div>
                </Button>
              ))}
          </div>
          <div className="action-row p-5">
            {["TXT", "JSON", "PDF"].map((type) => (
              <Button key={type} variant="outline" size="sm" onClick={() => exportTranscript(type)}>
                <Download />
                {type}
              </Button>
            ))}
          </div>
        </section>
      </div>
      <Dialog open={correction} onOpenChange={setCorrection}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct sample speaker label</DialogTitle>
            <DialogDescription>
              This change applies only to the sample view in this session. Real corrections require
              authorized access and an audit record.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Speaker display label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <DialogFooter>
            <Button
              onClick={() => {
                if (!label.trim()) return;
                setLabels((prev) => ({ ...prev, [currentSpeaker]: label.trim() }));
                setCorrection(false);
                toast.success("Sample display label updated");
              }}
            >
              Save sample label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
export function Duplicates() {
  const [group, setGroup] = useState(false);
  const [review, setReview] = useState("Awaiting Review");
  const [approve, setApprove] = useState(false);
  return (
    <Shell title="Duplicate Detection">
      <PageHeader
        title="Less repetition. More clarity."
        description="Compare matching content and make informed retention decisions."
        action={<SampleLabel />}
      />
      <div className="metrics-grid">
        {[
          ["Exact file matches", "128"],
          ["Repeated slides & pages", "214"],
          ["Similar documents", "42"],
        ].map(([title, value]) => (
          <article className="metric" key={title}>
            <span className="metric-label">{title}</span>
            <strong className="metric-value block">{value}</strong>
            <small className="text-muted-foreground">Sample findings · not verified</small>
          </article>
        ))}
      </div>
      <SectionTitle
        title="Duplicate groups"
        description="Similarity is not proof of duplication. Review original sources before approval."
      />
      <div className="table-scroll chart-panel">
        <table>
          <thead>
            <tr>
              <th>GROUP</th>
              <th>SOURCE / MATCH</th>
              <th>METHOD</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>DG-001</td>
              <td>AI-native Networks Strategy / Technology Roadmap Q4 2026</td>
              <td>Sample perceptual similarity · 96.8%</td>
              <td>
                <Status value={review} />
              </td>
              <td>
                <Button variant="outline" size="sm" onClick={() => setGroup(!group)}>
                  Compare
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {group && (
        <section className="content-section">
          <SectionTitle
            title="Side-by-side comparison"
            description="Sample candidate pair · slide images unavailable"
          />
          <div className="comparison-grid">
            {["AI-native Networks Strategy.pptx", "Technology Roadmap Q4 2026.pptx"].map(
              (name, i) => (
                <div className="comparison-source" key={name}>
                  <h3>{name}</h3>
                  <div className="slide-placeholder">
                    <Files />
                    <span>Actual slide preview not connected</span>
                  </div>
                  <p>
                    Sample extracted topic: AI-native network architecture and intelligent
                    operations.
                  </p>
                  <div className="detail-meta">
                    <span>Slide {i ? 12 : 8}</span>
                    <span>Source retained</span>
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="action-row">
            <Button onClick={() => setApprove(true)}>
              <ShieldCheck />
              Recommend canonical copy
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setReview("Kept Both");
                toast.success("Sample review: keep both sources");
              }}
            >
              Keep both
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setReview("Not Duplicate");
                toast.success("Sample candidate marked not duplicate");
              }}
            >
              Not a duplicate
            </Button>
          </div>
        </section>
      )}
      <Dialog open={approve} onOpenChange={setApprove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit retention recommendation?</DialogTitle>
            <DialogDescription>
              This is a sample review, not a deletion or verification. Both original files remain
              preserved. An authorized reviewer must verify source content before any retention
              operation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprove(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setReview("Review Submitted");
                setApprove(false);
                toast.success("Sample recommendation submitted. No originals deleted.");
              }}
            >
              Submit sample recommendation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
export function Knowledge({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [speaker, setSpeaker] = useState("All speakers");
  const results = segments.filter(
    (s) =>
      (speaker === "All speakers" || s.speaker === speaker) &&
      `${s.title} ${s.text}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Shell title="Knowledge Explorer">
      <PageHeader
        title="Find the knowledge. Not just the file."
        description="Explore connected transcripts, speakers, slides, and source references."
        action={<SampleLabel />}
      />
      <div className="toolbar">
        <Input
          aria-label="Search knowledge"
          placeholder="Search network slicing, architecture, AI..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          aria-label="Filter knowledge by speaker"
        >
          <option>All speakers</option>
          <option>Speaker 1</option>
          <option>Speaker 2</option>
        </select>
        <Button
          variant="outline"
          onClick={() =>
            toast.info(
              "Ask MEMORA is unavailable until real content retrieval and an AI provider are connected.",
            )
          }
        >
          <Search />
          Ask MEMORA
        </Button>
      </div>
      <SectionTitle
        title={`${results.length} knowledge matches`}
        description="Keyword search · illustrative source content"
      />
      {results.map((s) => (
        <article className="search-result" key={s.id}>
          <div className="segment-meta">
            <Video size={15} />
            <span>Video transcript</span>
            <strong>{s.speaker}</strong>
            <span>
              {stamp(s.start)} · FRAME_00{s.slide}
            </span>
          </div>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
          <small>5G Network Architecture — Technical Deep Dive.mp4 · Sample source</small>
          <div className="action-row">
            <Button variant="outline" size="sm" asChild>
              <Link to="/videos/$id" params={{ id: "network" }}>
                Open source
                <ArrowRight />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard
                  .writeText(s.text)
                  .then(() => toast.success("Sample transcript text copied"))
                  .catch(() => toast.error("Could not copy text"));
              }}
            >
              <Copy />
              Copy text
            </Button>
          </div>
        </article>
      ))}
      {results.length === 0 && (
        <div className="empty-state">
          <Search />
          <h2>No knowledge matches</h2>
          <p>Try a broader topic or another speaker.</p>
        </div>
      )}
    </Shell>
  );
}
export function Storage() {
  const [open, setOpen] = useState(false);
  return (
    <Shell title="Storage Optimization">
      <PageHeader
        title="Preserve more. Store less."
        description="Measured knowledge packages and human-reviewed optimization opportunities."
        action={<SampleLabel />}
      />
      <div className="metrics-grid">
        {[
          ["Original storage", "6.84 TB"],
          ["Knowledge packages", "1.92 TB"],
          ["Potential savings", "4.92 TB"],
          ["Potential reduction", "71.9%"],
          ["Verified reclaimed", "0 B"],
        ].map(([title, value]) => (
          <article className="metric" key={title}>
            <span className="metric-label">{title}</span>
            <strong className="metric-value block">{value}</strong>
          </article>
        ))}
      </div>
      <div className="notice">
        <ShieldCheck size={18} />
        Sample estimates only. Potential savings are not reclaimed storage. All originals are
        retained.
      </div>
      <SectionTitle
        title="Knowledge package breakdown"
        description="Illustrative measurements for the sample workspace"
      />
      <div className="table-scroll chart-panel">
        <table>
          <thead>
            <tr>
              <th>ASSET TYPE</th>
              <th>SIZE</th>
              <th>SOURCE TRACEABILITY</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Timestamped transcripts", "0.08 TB"],
              ["Speaker metadata", "0.01 TB"],
              ["Extracted frames", "0.92 TB"],
              ["Document pages & slides", "0.78 TB"],
              ["Metadata & search index", "0.13 TB"],
            ].map(([label, size]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{size}</td>
                <td>Original source references retained</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="content-section">
        <SectionTitle title="Retention recommendations" />
        <div className="review-band">
          <ShieldCheck />
          <div>
            <strong>Review the original recording after knowledge-package verification</strong>
            <p>
              Sample potential impact: 1.18 GB. Reason: compact transcript and slide package. Human
              approval required.
            </p>
          </div>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Review
          </Button>
        </div>
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retention review</DialogTitle>
            <DialogDescription>
              No actual source package has been verified for this sample. Retention approval is
              unavailable. Connect the original recording and processing service first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Keep original</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
export function Offboarding() {
  const [inventory, setInventory] = useState<File | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Shell title="Offboarding">
      <PageHeader
        title="Knowledge stays. Transitions move forward."
        description="Review employee inventories against your preserved repository."
      />
      <div className="notice">
        <AlertCircle size={18} />
        Repository comparison is unavailable until the inventory analysis service is connected.
        Employee files are never automatically deleted.
      </div>
      <div className="dropzone">
        <UserRound size={38} />
        <h2>Select an employee file inventory</h2>
        <p>CSV inventory with file name, size, and source location</p>
        <input
          type="file"
          accept=".csv"
          hidden
          ref={ref}
          onChange={(e) => setInventory(e.target.files?.[0] ?? null)}
        />
        <Button onClick={() => ref.current?.click()}>
          <Upload />
          Browse inventory
        </Button>
        {inventory && (
          <small>
            Selected: {inventory.name} · {(inventory.size / 1024).toFixed(1)} KB · Not analyzed
          </small>
        )}
      </div>
      {inventory && (
        <div className="action-row">
          <Button
            variant="outline"
            onClick={() =>
              toast.info(
                "Inventory selected. Analysis requires the processing service; no results have been generated.",
              )
            }
          >
            Check analysis availability
          </Button>
        </div>
      )}
    </Shell>
  );
}
export function Reports() {
  const [type, setType] = useState("");
  const names = [
    "Storage Optimization",
    "Duplicate Detection",
    "Video Processing",
    "Speaker Diarization",
    "Visual Transcript",
    "Document Analysis",
    "Offboarding",
    "Knowledge Asset",
  ];
  return (
    <Shell title="Reports">
      <PageHeader
        title="Intelligence, ready to share."
        description="Export source-aware findings and storage insights."
        action={<SampleLabel />}
      />
      <div className="file-grid">
        {names.map((name) => (
          <article className="report-card" key={name}>
            <FileChartColumn size={25} />
            <h3>{name} Report</h3>
            <p>Nov 1–13, 2026 · Clearly labeled sample data</p>
            <div className="action-row">
              <Button variant="outline" size="sm" onClick={() => setType(name)}>
                View report
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  exportCsv(`memora-${name.toLowerCase().replaceAll(" ", "-")}-sample`)
                }
              >
                <Download />
                CSV
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Dialog open={!!type} onOpenChange={() => setType("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{type} Report</DialogTitle>
            <DialogDescription>
              Sample workspace report · November 2026. Not a record of actual processing.
            </DialogDescription>
          </DialogHeader>
          <div className="integration-row">
            <span>Original storage</span>
            <strong>6.84 TB</strong>
          </div>
          <div className="integration-row">
            <span>Potential savings</span>
            <strong>4.92 TB</strong>
          </div>
          <div className="integration-row">
            <span>Verified reclaimed storage</span>
            <strong>0 B</strong>
          </div>
          <p className="text-muted-foreground text-xs">
            All source originals retained. Processing-specific sample details are available in the
            corresponding workspace.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => exportCsv()}>
              <Download />
              Export sample CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
export function SettingsWorkspace() {
  const [organization, setOrganization] = useState("Enterprise workspace");
  const [review, setReview] = useState(true);
  return (
    <Shell title="Settings">
      <PageHeader
        title="Workspace settings"
        description="Configuration, access, integrations, and retention safeguards."
      />
      <div className="settings-grid">
        <div>
          <section className="settings-group">
            <h2>Workspace</h2>
            <label htmlFor="organization">Sample workspace name</label>
            <Input
              id="organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
            <Button onClick={() => toast.success("Sample workspace name updated for this session")}>
              Save sample settings
            </Button>
          </section>
          <section className="settings-group">
            <h2>Retention & approvals</h2>
            <div className="integration-row">
              <span>Require human review</span>
              <Switch
                aria-label="Require human review"
                checked={review}
                onCheckedChange={() => {
                  setReview(true);
                  toast.info(
                    "Human approval is mandatory. Originals are never automatically deleted.",
                  );
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Human review is mandatory for retention decisions.
            </p>
          </section>
          <section className="settings-group">
            <h2>Users & access</h2>
            <p className="text-xs text-muted-foreground">
              Sign in to manage your files. Shared workspace roles and enterprise permission
              management are not configured yet.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/auth">
                <UserRound />
                Manage account
              </Link>
            </Button>
          </section>
        </div>
        <div>
          <section className="settings-group">
            <h2>Integrations</h2>
            {[
              ["Lovable Cloud", "Connected"],
              ["Private original storage", "Connected"],
              ["Python processing service", "Not connected"],
              ["Speaker diarization", "Not connected"],
              ["AI-assisted search", "Not connected"],
            ].map(([name, status]) => (
              <div className="integration-row" key={name}>
                <span>{name}</span>
                <Status
                  value={status === "Connected" ? "Completed" : (status ?? "Not connected")}
                />
              </div>
            ))}
          </section>
          <section className="settings-group">
            <h2>Processing configuration</h2>
            <div className="integration-row">
              <span>Transcription</span>
              <span>Faster-Whisper · Awaiting service</span>
            </div>
            <div className="integration-row">
              <span>Speakers</span>
              <span>pyannote Community-1 · Awaiting service</span>
            </div>
            <div className="integration-row">
              <span>Slide extraction</span>
              <span>OpenCV · Awaiting service</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Real processing results appear only after successful service execution.
            </p>
          </section>
        </div>
      </div>
    </Shell>
  );
}

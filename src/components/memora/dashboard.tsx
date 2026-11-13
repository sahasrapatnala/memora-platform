import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowRight,
  Upload,
  Files,
  HardDrive,
  Sparkles,
  Copy,
  CheckCheck,
  ChevronDown,
  Download,
  Video,
  Check,
  Layers,
  MoreHorizontal,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, SampleLabel, SectionTitle, Status, FileIcon, ViewLink } from "./shell";
import { sampleFiles } from "@/lib/memora/data";
import { exportCsv } from "@/lib/memora/export";
import flowImage from "@/assets/knowledge-flow.jpg";
const metrics = [
  {
    label: "Files analyzed",
    value: "2,486",
    change: "+12.8%",
    detail: "vs. previous month",
    icon: Files,
    trend: true,
  },
  {
    label: "Original storage",
    value: "6.84",
    unit: "TB",
    change: "+8.2%",
    detail: "vs. previous month",
    icon: HardDrive,
    trend: false,
  },
  {
    label: "Knowledge assets",
    value: "18,942",
    change: "+24.6%",
    detail: "vs. previous month",
    icon: Sparkles,
    trend: true,
  },
  {
    label: "Potential savings",
    value: "4.92",
    unit: "TB",
    change: "71.9%",
    detail: "storage reduction potential",
    icon: ArrowUpRight,
    trend: true,
  },
  {
    label: "Duplicate content",
    value: "384",
    change: "12 groups",
    detail: "awaiting verification",
    icon: Copy,
    trend: false,
  },
  {
    label: "Completed jobs",
    value: "2,312",
    change: "93.0%",
    detail: "successful completion rate",
    icon: CheckCheck,
    trend: true,
  },
];
export function Dashboard() {
  const [period, setPeriod] = useState("Last 30 days");
  return (
    <Shell title="Overview">
      <div className="dashboard-head">
        <div>
          <h1>Workspace overview</h1>
          <p>A clearer view of your data. A smarter way to preserve it.</p>
        </div>
        <div className="heading-actions">
          <SampleLabel />
          <Button
            variant="outline"
            onClick={() => setPeriod(period === "Last 30 days" ? "Last 7 days" : "Last 30 days")}
          >
            <CalendarDays />
            {period}
            <ChevronDown />
          </Button>
          <Button variant="outline" onClick={() => exportCsv()}>
            <Download />
            Export report
          </Button>
        </div>
      </div>
      <section className="overview-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="live-dot" /> INTELLIGENT STORAGE. LASTING KNOWLEDGE.
          </span>
          <h2>
            Turn stored data into
            <br />
            searchable knowledge.
          </h2>
          <p>
            Preserve what matters. Eliminate redundancy.
            <br />
            Unlock the intelligence within your enterprise data.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link to="/upload">
                <Upload />
                Upload files
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/knowledge" search={{ q: undefined }}>
                Explore knowledge
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <span className="hero-note">
            <ShieldCheck size={14} /> Your original files are always preserved.
          </span>
        </div>
        <img
          src={flowImage}
          width={1024}
          height={640}
          alt="Documents and recordings flowing into a structured knowledge cube"
        />
        <span className="hero-image-caption">LESS STORAGE. MORE INTELLIGENCE.</span>
      </section>
      <div className="metrics-grid">
        {metrics.map((m) => (
          <article className="metric" key={m.label}>
            <div className="metric-label">
              {m.label}
              <m.icon size={17} />
            </div>
            <div className="metric-value">
              {m.value} {m.unit && <span>{m.unit}</span>}
            </div>
            <div className="metric-detail">
              <strong className={m.trend ? "positive" : "neutral"}>
                {m.trend && <ArrowUpRight size={12} />} {m.change}
              </strong>
              <span>{m.detail}</span>
            </div>
          </article>
        ))}
      </div>
      <div className="analytics-grid">
        <section className="chart-panel storage-panel">
          <SectionTitle
            title="Storage overview"
            description="Original data vs. preserved knowledge"
            action={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Export storage data"
                onClick={() => exportCsv("storage-sample")}
              >
                <MoreHorizontal />
              </Button>
            }
          />
          <div className="storage-chart">
            <div className="chart-scale">
              <span>8 TB</span>
              <span>6 TB</span>
              <span>4 TB</span>
              <span>2 TB</span>
              <span>0</span>
            </div>
            <div className="bars-area">
              <div className="chart-gridline one" />
              <div className="chart-gridline two" />
              <div className="chart-gridline three" />
              <div className="chart-gridline four" />
              <div className="chart-bar original">
                <span>6.84 TB</span>
              </div>
              <div className="chart-bar preserved">
                <span>1.92 TB</span>
                <div className="preserved-frame" />
                <div className="preserved-index" />
              </div>
              <div className="chart-bar savings">
                <span>4.92 TB</span>
                <strong>−71.9%</strong>
              </div>
              <div className="bar-labels">
                <span>Original storage</span>
                <span>Knowledge package</span>
                <span>Potential savings</span>
              </div>
            </div>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-original" />
              Original files
            </span>
            <span>
              <i className="legend-transcript" />
              Transcripts
            </span>
            <span>
              <i className="legend-frames" />
              Frames & pages
            </span>
            <span>
              <i className="legend-index" />
              Metadata & index
            </span>
          </div>
        </section>
        <section className="chart-panel distribution-panel">
          <SectionTitle title="Content distribution" description="Across your analyzed files" />
          <div className="donut">
            <div>
              <strong>2,486</strong>
              <span>Total files</span>
            </div>
          </div>
          <div className="distribution-legend">
            {[
              ["Videos", "42%", "1,044", "video"],
              ["Presentations", "28%", "696", "presentation"],
              ["PDF documents", "22%", "547", "pdf"],
              ["Word documents", "8%", "199", "word"],
            ].map(([label, percent, count, key]) => (
              <div key={key}>
                <span>
                  <i className={`legend-${key}`} />
                  {label}
                </span>
                <strong>
                  {percent}
                  <small>{count}</small>
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="chart-panel activity-panel">
          <SectionTitle
            title="Processing activity"
            description={
              period === "Last 30 days" ? "This week · Sample data" : "Last 7 days · Sample data"
            }
            action={
              <span className="mini-total">
                +18.6% <ArrowUpRight size={12} />
              </span>
            }
          />
          <div className="weekly-chart">
            {[54, 72, 62, 88, 100, 39, 27].map((v, i) => (
              <div key={i}>
                <div className={`weekly-bar weekly-${i}`}>
                  <i />
                  <b />
                </div>
                <span>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</span>
              </div>
            ))}
          </div>
          <div className="processing-counts">
            <div>
              <strong>2,312</strong>
              <span>
                <i className="legend-success" />
                Completed
              </span>
            </div>
            <div>
              <strong>128</strong>
              <span>
                <i className="legend-transcript" />
                In queue
              </span>
            </div>
            <div>
              <strong>46</strong>
              <span>
                <i className="legend-warning" />
                Review
              </span>
            </div>
          </div>
        </section>
      </div>
      <div className="lower-grid">
        <section className="chart-panel recent-files">
          <SectionTitle
            title="Recently analyzed files"
            description="Your latest content, transformed into knowledge"
            action={<ViewLink to="/videos" />}
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>FILE NAME</th>
                  <th>SIZE</th>
                  <th>STATUS</th>
                  <th>ASSETS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sampleFiles.slice(0, 4).map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link
                        to={f.format === "MP4" ? "/videos/$id" : "/documents"}
                        params={{ id: f.id }}
                        className="file-cell"
                      >
                        <FileIcon format={f.format} />
                        <span>
                          <strong>{f.name}</strong>
                          <small>
                            {f.format} <span>·</span> {f.date}
                          </small>
                        </span>
                      </Link>
                    </td>
                    <td>{f.size}</td>
                    <td>
                      <Status value={f.status} />
                    </td>
                    <td>{f.assets}</td>
                    <td>
                      <ArrowUpRight size={14} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="chart-panel recent-activity">
          <SectionTitle
            title="Recent activity"
            action={<ViewLink to="/reports" label="All activity" />}
          />
          <div className="activity-list">
            {[
              {
                icon: Check,
                title: "Knowledge package generated",
                detail: "5G Network Architecture",
                time: "12 min ago",
                kind: "success",
              },
              {
                icon: Copy,
                title: "12 duplicate slides identified",
                detail: "AI-native Networks Strategy",
                time: "28 min ago",
                kind: "info",
              },
              {
                icon: Video,
                title: "Visual transcript ready",
                detail: "Cloud RAN Training Session",
                time: "46 min ago",
                kind: "info",
              },
              {
                icon: Layers,
                title: "32 slides extracted",
                detail: "Technology Roadmap Q4 2026",
                time: "1 hour ago",
                kind: "cyan",
              },
            ].map((a) => (
              <div className="activity-item" key={a.title}>
                <span className={`activity-icon ${a.kind}`}>
                  <a.icon size={15} />
                </span>
                <div>
                  <strong>{a.title}</strong>
                  <p>{a.detail}</p>
                  <small>{a.time} · Sample</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="review-band">
        <div className="review-icon">
          <ShieldCheck />
        </div>
        <div>
          <strong>Better decisions. Nothing deleted without your approval.</strong>
          <p>12 duplicate groups are ready for human review. Original sources remain intact.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/duplicates">
            Review duplicates
            <ArrowRight />
          </Link>
        </Button>
      </section>
    </Shell>
  );
}

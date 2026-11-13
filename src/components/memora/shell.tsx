import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Upload,
  Video,
  Files,
  Copy,
  Search,
  HardDrive,
  UserRoundMinus,
  ChartNoAxesCombined,
  Settings,
  ChevronDown,
  ChevronsLeft,
  Bell,
  ArrowUpRight,
  Layers,
  Menu,
  Command,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
const nav = [
  ["Overview", "/", LayoutDashboard],
  ["Upload & Process", "/upload", Upload],
  ["Video Intelligence", "/videos", Video],
  ["Document Intelligence", "/documents", Files],
  ["Duplicate Detection", "/duplicates", Copy],
  ["Knowledge Explorer", "/knowledge", Search],
  ["Storage Optimization", "/storage", HardDrive],
  ["Offboarding", "/offboarding", UserRoundMinus],
  ["Reports", "/reports", ChartNoAxesCombined],
  ["Settings", "/settings", Settings],
] as const;
export function Shell({ children, title }: { children: ReactNode; title: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const path = useLocation().pathname;
  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className={`app-sidebar ${mobile ? "mobile-open" : ""}`}>
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Layers size={25} />
          </span>
          <span>
            MEMORA<span className="brand-caption">KNOWLEDGE, PRESERVED.</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-avatar">M</span>
          <div>
            <strong>Enterprise workspace</strong>
            <small>Technology & innovation</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map(([label, to, Icon], i) => (
            <Link
              key={to}
              to={to}
              search={{ q: undefined }}
              onClick={() => setMobile(false)}
              className={`nav-item ${path === to || (to === "/videos" && path.startsWith("/videos/")) ? "active" : ""}`}
              title={label}
            >
              <Icon size={18} />
              <span>{label}</span>
              {i === 4 && <small className="nav-count">12</small>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-mini">
            <span>
              <HardDrive size={14} /> Workspace storage <strong>68%</strong>
            </span>
            <div className="meter">
              <i />
            </div>
            <small>6.8 TB of 10 TB · Sample</small>
          </div>
          <Link to="/settings" className="profile">
            <span className="avatar">SP</span>
            <div>
              <strong>Sahasra Patnala</strong>
              <small>Sample workspace profile</small>
            </div>
            <ChevronDown size={14} />
          </Link>
          <Button
            className="collapse-control"
            variant="ghost"
            onClick={() => setCollapsed(!collapsed)}
            title="Collapse sidebar"
          >
            <ChevronsLeft />
            <span>Collapse sidebar</span>
          </Button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </Button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate({ to: "/knowledge", search: { q: search } });
              }}
            >
              <Search size={16} />
              <Input
                aria-label="Search workspace"
                placeholder="Search anything..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>
                <Command size={10} /> K
              </kbd>
            </form>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              onClick={() =>
                toast.info("No new notifications. Sample activity is shown on Overview.")
              }
            >
              <Bell />
            </Button>
            <span className="avatar small">SP</span>
          </div>
        </header>
        <main>{children}</main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} /> Originals preserved. Knowledge connected.
          </span>
          <span>
            MEMORA <span className="footer-dot">•</span> Preserve Knowledge. Eliminate Redundancy.
          </span>
        </footer>
      </div>
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function SampleLabel() {
  return (
    <span className="sample-badge">
      <span /> Sample workspace
    </span>
  );
}
export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`status ${value === "Completed" ? "success" : value === "Failed" ? "danger" : value === "Awaiting Review" ? "warning" : "info"}`}
    >
      <i />
      {value}
    </span>
  );
}
export function FileIcon({ format }: { format: string }) {
  return (
    <span className={`file-icon ${format === "MP4" ? "video" : format === "PDF" ? "pdf" : "deck"}`}>
      {format === "MP4" ? <Video size={18} /> : <Files size={18} />}
    </span>
  );
}
export function ViewLink({
  to,
  label = "View all",
}: {
  to:
    | "/"
    | "/videos"
    | "/documents"
    | "/duplicates"
    | "/reports"
    | "/storage"
    | "/knowledge"
    | "/upload";
  label?: string;
}) {
  return (
    <Button variant="link" size="sm" asChild>
      <Link to={to} search={{ q: undefined }}>
        {label}
        <ArrowUpRight size={14} />
      </Link>
    </Button>
  );
}

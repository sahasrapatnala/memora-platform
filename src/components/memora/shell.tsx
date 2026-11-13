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
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-data";
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
  const { user, workspace, workspaces, selectWorkspace } = useWorkspace();
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
            <select
              aria-label="Select workspace"
              value={workspace?.id ?? ""}
              onChange={(e) => selectWorkspace(e.target.value)}
              disabled={!workspaces.length}
            >
              {!workspaces.length && <option value="">No workspace</option>}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <small>{user ? "Member workspace" : "Sign in required"}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map(([label, to, Icon]) => (
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
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/auth" className="profile">
            <span className="avatar">
              <UserRound size={17} />
            </span>
            <div>
              <strong>{user ? "Your account" : "Sign in"}</strong>
              <small>{user ? "Account & access" : "Connect your workspace"}</small>
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
            </form>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              onClick={() =>
                toast.info(
                  "Notifications are not connected yet. Workspace activity is available on Overview.",
                )
              }
            >
              <Bell />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Account" asChild>
              <Link to="/auth">
                <UserRound />
              </Link>
            </Button>
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

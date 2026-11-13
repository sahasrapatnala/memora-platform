import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { useWorkspace } from "./workspace-data";
import { FileIcon, Status } from "./shell";
import { formatBytes } from "@/lib/memora/integrity";
import { filterOriginals } from "@/lib/memora/file-rules";
import { deleteOriginal } from "@/lib/memora/api.functions";
import { supabase } from "@/integrations/supabase/client";

type Original = NonNullable<ReturnType<typeof useWorkspace>["data"]>["files"][number];
export function FileManager({ files }: { files: Original[] }) {
  const { user, refresh } = useWorkspace();
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("All formats");
  const [detail, setDetail] = useState<Original | null>(null);
  const [remove, setRemove] = useState<Original | null>(null);
  const [busy, setBusy] = useState(false);
  const deleteFile = useServerFn(deleteOriginal);
  const visible = filterOriginals(files, search, format);
  return <>
    <div className="toolbar">
      <Input aria-label="Search filenames" placeholder="Search filenames…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select aria-label="Filter by file type" value={format} onChange={(e) => setFormat(e.target.value)}>
        {["All formats", "MP4", "MOV", "PDF", "PPTX", "DOCX"].map((value) => <option key={value}>{value}</option>)}
      </select>
    </div>
    <div className="table-scroll"><table><thead><tr><th>Original file</th><th>Format</th><th>Size</th><th>Status</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>
      {visible.map((file) => <tr key={file.id}>
        <td><span className="file-cell"><FileIcon format={file.format} /><strong title={file.name}>{file.name}</strong></span></td>
        <td>{file.format}</td><td>{formatBytes(file.size_bytes)}</td><td><Status value={file.status} /></td><td>{new Date(file.created_at).toLocaleString()}</td>
        <td><div className="action-row"><Button variant="ghost" size="icon" title="View file details" aria-label={`Details for ${file.name}`} onClick={() => setDetail(file)}><Eye /></Button>
        {user?.id === file.user_id && <Button variant="ghost" size="icon" title="Delete original" aria-label={`Delete ${file.name}`} onClick={() => setRemove(file)}><Trash2 /></Button>}</div></td>
      </tr>)}
    </tbody></table></div>
    {!visible.length && <p className="quiet-empty">{files.length ? "No matching files." : "No originals uploaded yet."}</p>}
    <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}><DialogContent><DialogHeader><DialogTitle className="break-all">{detail?.name}</DialogTitle></DialogHeader>
      {detail && <><dl className="space-y-3 text-sm"><div><dt>Format</dt><dd>{detail.format}</dd></div><div><dt>Size</dt><dd>{formatBytes(detail.size_bytes)} · {detail.size_bytes} bytes</dd></div><div><dt>Uploaded</dt><dd>{new Date(detail.created_at).toLocaleString()}</dd></div><div><dt>Owner</dt><dd className="break-all">{detail.user_id}</dd></div><div><dt>SHA-256</dt><dd className="break-all font-mono">{detail.sha256 ?? "Unavailable"}</dd></div><div><dt>Status</dt><dd>{detail.status}</dd></div></dl>
        <Button disabled={detail.status !== "Uploaded"} onClick={async () => {
          const result = await supabase.storage.from("original-files").createSignedUrl(detail.storage_path, 60);
          if (result.error) toast.error("Could not open this private file.");
          else window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
        }}><Download />Open original</Button></>}
    </DialogContent></Dialog>
    <AlertDialog open={!!remove} onOpenChange={(open) => { if (!open && !busy) setRemove(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete original permanently?</AlertDialogTitle><AlertDialogDescription className="break-all">{remove?.name} will be removed from private storage. This cannot be undone. Its upload and deletion history will remain.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={async () => {
      if (!remove) return;
      setBusy(true);
      try { await deleteFile({ data: { fileId: remove.id, confirmed: true } }); setRemove(null); await refresh(); toast.success("Original deleted. History retained."); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Deletion failed"); }
      finally { setBusy(false); }
    }}>{busy ? "Deleting…" : "Delete permanently"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
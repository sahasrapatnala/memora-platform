import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
export function PageControls({ page, hasNext, busy, onPage }: { page: number; hasNext: boolean; busy?: boolean; onPage: (page: number) => void }) {
  return <div className="action-row">
    <Button variant="outline" size="icon" aria-label="Previous page" title="Previous page" disabled={page === 0 || busy} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
    <span>Page {page + 1}</span>
    <Button variant="outline" size="icon" aria-label="Next page" title="Next page" disabled={!hasNext || busy} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
  </div>;
}
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SearchPanel } from "@/components/SearchPanel";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { EntrySearchResult } from "@/utils/entrySearch";

export const OPEN_SEARCH_EVENT = "lexi:open-search";

/** The app-wide search, opened by the topbar button and Ctrl+K. */
export function SearchDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpenSearch = () => setOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
  }, []);

  const openEntry = (result: EntrySearchResult) => {
    setOpen(false);
    navigate(`${result.kind === "word" ? "/definitions" : "/translations"}?entry=${encodeURIComponent(result.id)}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* The panel is its own frame, like the capture dialog, so the dialog
          shell stays transparent and its built-in close button is hidden. */}
      <DialogContent className="h-[min(40rem,85vh)] max-w-2xl border-none bg-transparent p-0 shadow-none [&>button]:hidden">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search every saved definition and translation.</DialogDescription>
        {open ? <SearchPanel onClose={() => setOpen(false)} onOpen={openEntry} /> : null}
      </DialogContent>
    </Dialog>
  );
}

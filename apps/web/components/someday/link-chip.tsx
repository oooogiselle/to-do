import { ExternalLink } from "lucide-react";
import { linkLabel } from "@tt/shared";

/** A link's site as a small chip that opens it in a new tab. */
export function LinkChip({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-md bg-chip px-1.5 py-0.5 text-[11px] font-semibold text-chip-ink hover:bg-line hover:text-ink"
    >
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{linkLabel(url)}</span>
    </a>
  );
}

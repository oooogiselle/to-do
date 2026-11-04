import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Shared page header: breadcrumb, title, optional description, right-aligned actions. */
export function PageHeader({
  title,
  crumb,
  description,
  children,
}: {
  title: string;
  /** Short context shown after "tt." in the breadcrumb; defaults to the title. */
  crumb?: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3 pb-5">
      <div className="mr-auto min-w-0">
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          tt.
          <ChevronRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
          <span className="text-chip-ink">{crumb ?? title}</span>
        </p>
        <h1 className="mt-1.5 text-[22px] font-medium tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-xl text-[13px] text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

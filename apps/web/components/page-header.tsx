import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Shared page header: breadcrumb (or a back link), title, optional description, right-aligned actions. */
export function PageHeader({
  title,
  crumb,
  back,
  icon,
  description,
  children,
}: {
  title: string;
  /** Replaces the breadcrumb with a link back, e.g. "All lists" on one list. */
  back?: { href: string; label: string };
  /** Shown before the title, e.g. a list's colour dot. */
  icon?: ReactNode;
  /** Short context shown after "tt." in the breadcrumb; defaults to the title. */
  crumb?: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3 pb-5">
      <div className="mr-auto min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="-ml-1 inline-flex items-center gap-0.5 rounded-md px-1 text-[12px] font-medium text-muted hover:text-ink"
          >
            <ChevronLeft className="h-3 w-3" aria-hidden="true" />
            {back.label}
          </Link>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-muted">
            tt.
            <ChevronRight className="h-3 w-3 text-faint" aria-hidden="true" />
            <span className="text-chip-ink">{crumb ?? title}</span>
          </p>
        )}
        <h1 className="mt-1 flex items-center gap-3.5 text-[15px] font-semibold tracking-tight text-ink">
          {icon}
          {title}
        </h1>
        {description && <p className="mt-1 max-w-xl text-[13px] text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

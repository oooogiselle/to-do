"use client";

import {
  BookOpen,
  CirclePlay,
  Clock,
  FileText,
  GraduationCap,
  Link2,
  RotateCw,
  Sparkles,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatMinutes, linkLabel, type ResearchResource, type ResourceKind, type Task } from "@tt/shared";
import { effortLabel, isTemp, researchState, useResearchTask, useUpdateTask } from "@tt/client";

const KIND_ICON: Record<ResourceKind, LucideIcon> = {
  article: FileText,
  video: CirclePlay,
  course: GraduationCap,
  book: BookOpen,
  tool: Wrench,
  community: Users,
  other: Link2,
};

const KIND_LABEL: Record<ResourceKind, string> = {
  article: "Article",
  video: "Video",
  course: "Course",
  book: "Book",
  tool: "Tool",
  community: "Community",
  other: "Link",
};

export function ResourceLink({ r, compact }: { r: ResearchResource; compact?: boolean }) {
  const Icon = KIND_ICON[r.kind];
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={compact ? `${r.note}\n${r.url}` : r.url}
      onClick={(e) => e.stopPropagation()}
      className="group flex min-w-0 items-start gap-1.5 rounded-md text-[12px] hover:text-ink"
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-label={KIND_LABEL[r.kind]} />
      <span className="min-w-0">
        <span className={`font-semibold text-ink group-hover:underline ${compact ? "line-clamp-1" : ""}`}>
          {r.title}
        </span>
        <span className="text-faint">
          {" · "}
          {linkLabel(r.url)}
          {r.minutes ? ` · ${formatMinutes(r.minutes)}` : ""}
        </span>
      </span>
    </a>
  );
}

export function Pulse({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
      <Sparkles className="h-3.5 w-3.5 animate-pulse" aria-hidden />
      <span className="animate-pulse">{label}</span>
    </p>
  );
}

/** On a Someday card: the estimate and the first few resources, or the research status. */
export function ResearchSummary({
  task,
  onMore,
  className = "",
}: {
  task: Task;
  onMore: () => void;
  className?: string;
}) {
  const research = useResearchTask();
  const s = researchState(task);
  if (s.state === "none" && !research.error) return null;
  if (s.state === "pending")
    return (
      <div className={className}>
        <Pulse label="Finding resources…" />
      </div>
    );

  const r = s.state === "none" ? null : s.research;
  const effort = r ? effortLabel(r) : null;
  const shown = r?.resources.slice(0, 3) ?? [];
  const more = (r?.resources.length ?? 0) - shown.length;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {effort && (
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-chip-ink" title={r?.basis ?? undefined}>
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {effort}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="space-y-1">
          {shown.map((res) => (
            <li key={res.url}>
              <ResourceLink r={res} compact />
            </li>
          ))}
        </ul>
      )}
      {more > 0 && (
        <button type="button" onClick={onMore} className="text-[12px] font-bold text-muted hover:text-ink">
          +{more} more
        </button>
      )}
      {(s.state === "error" || research.error) && (
        <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          <span>{research.error?.message ?? (s.state === "error" ? s.message : "")}</span>
          <button
            type="button"
            disabled={research.isPending || isTemp(task.id)}
            onClick={() => research.mutate(task.id)}
            className="font-bold text-chip-ink hover:text-ink disabled:opacity-50"
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}

const label = "mb-1.5 block text-[11px] font-bold tracking-wider text-muted uppercase";

/** In the task sheet: every resource (removable), the estimate and how it was made, and re-run. */
export function ResearchSection({ task }: { task: Task }) {
  const research = useResearchTask();
  const updateTask = useUpdateTask();
  const s = researchState(task);
  const r = s.state === "done" || s.state === "error" ? s.research : null;
  const effort = r ? effortLabel(r) : null;

  const remove = (url: string) =>
    r && updateTask.mutate({ id: task.id, patch: { research: { ...r, resources: r.resources.filter((x) => x.url !== url) } } });

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`${label} mb-0`}>Resources</span>
        {s.state !== "pending" && (
          <button
            type="button"
            disabled={research.isPending || isTemp(task.id)}
            onClick={() => research.mutate(task.id)}
            className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] font-bold text-chip-ink hover:bg-row disabled:opacity-50"
          >
            {s.state === "none" ? <Sparkles className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
            {s.state === "none" ? "Find resources" : "Find again"}
          </button>
        )}
      </div>

      {s.state === "none" && (
        <p className="text-[12px] text-muted">
          Search the web for guides, courses and videos, and get a rough time estimate.
        </p>
      )}
      {s.state === "pending" && <Pulse label="Searching the web… this takes up to a minute." />}
      {(research.error || s.state === "error") && (
        <p role="alert" className="mb-1.5 text-[12px] font-semibold text-risk">
          {research.error?.message ?? (s.state === "error" ? s.message : "")}
        </p>
      )}

      {effort && (
        <div className="mb-2 rounded-lg bg-row px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {effort}
          </p>
          {r?.basis && <p className="mt-0.5 text-[12px] text-muted">{r.basis}</p>}
        </div>
      )}

      {r && r.resources.length > 0 && (
        <ul className="space-y-2">
          {r.resources.map((res) => (
            <li key={res.url} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ResourceLink r={res} />
                {res.note && <p className="pl-5 text-[12px] text-muted">{res.note}</p>}
              </div>
              <button
                type="button"
                onClick={() => remove(res.url)}
                aria-label={`Remove ${res.title}`}
                className="rounded p-0.5 text-faint hover:bg-row hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {r && s.state === "done" && r.resources.length === 0 && (
        <p className="text-[12px] text-muted">No resources found this time.</p>
      )}
    </div>
  );
}

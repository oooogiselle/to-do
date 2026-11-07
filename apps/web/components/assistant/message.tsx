"use client";

import { Fragment, type ReactNode } from "react";
import { messageState } from "@tt/client";
import type { AssistantBlock, AssistantMessage } from "@tt/shared";
import { DraftCard, IdeaPlanCard, LinksCard, ScheduleCard, SlotsCard, StepsCard, TaskListCard } from "./cards";

/** Small monochrome "tt." mark beside replies. */
export function AssistantAvatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-ink text-[10px] font-medium tracking-tight text-white"
    >
      <span>
        tt<span className="text-coral">.</span>
      </span>
    </span>
  );
}

/** **phrases** in medium-weight ink. */
function Emphasis({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <span key={i} className="font-medium text-ink">
            {part.slice(2, -2)}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Reply copy: paragraphs, "- " bullets and **emphasis**. */
export function RichText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  const endPara = () => {
    if (para.length)
      out.push(
        <p key={out.length}>
          <Emphasis text={para.join(" ")} />
        </p>,
      );
    para = [];
  };
  const endList = () => {
    if (bullets.length)
      out.push(
        <ul key={out.length} className="list-disc space-y-0.5 pl-4 marker:text-faint">
          {bullets.map((b, i) => (
            <li key={i}>
              <Emphasis text={b} />
            </li>
          ))}
        </ul>,
      );
    bullets = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (!line) {
      endPara();
      endList();
    } else if (bullet) {
      endPara();
      bullets.push(bullet[1]!);
    } else {
      endList();
      para.push(line);
    }
  }
  endPara();
  endList();
  return <div className="space-y-1.5 text-[13px] leading-relaxed text-chip-ink">{out}</div>;
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5" role="status" aria-label="tt. is thinking">
      <AssistantAvatar />
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function BlockView({ block, index, message }: { block: AssistantBlock; index: number; message: AssistantMessage }) {
  const card = { messageId: message.id, index, resolved: message.resolved };
  switch (block.kind) {
    case "text":
      return <RichText text={block.text} />;
    case "schedule":
      return <ScheduleCard {...card} block={block} />;
    case "tasks":
      return <TaskListCard block={block} />;
    case "draft":
      return <DraftCard {...card} block={block} />;
    case "steps":
      return <StepsCard {...card} block={block} />;
    case "slots":
      return <SlotsCard block={block} />;
    case "links":
      return <LinksCard block={block} />;
    case "idea":
      return <IdeaPlanCard {...card} block={block} />;
  }
}

export function ChatMessage({
  message,
  isLast,
  showFollowUps,
  onFollowUp,
  onRetry,
  retrying,
}: {
  message: AssistantMessage;
  isLast: boolean;
  showFollowUps: boolean;
  onFollowUp: (text: string) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-xl rounded-br-[4px] bg-row-hover px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
          {message.content}
        </p>
      </div>
    );
  }
  const s = messageState(message);
  if (s.state === "pending") return <Thinking />;
  if (s.state === "error")
    return (
      <div className="flex gap-2.5">
        <AssistantAvatar />
        <p role="alert" className="flex flex-wrap items-center gap-x-2 pt-0.5 text-[13px] text-risk">
          <span>{s.message}</span>
          {isLast && (
            <button
              type="button"
              disabled={retrying}
              onClick={onRetry}
              className="text-[12px] text-chip-ink underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            >
              Try again
            </button>
          )}
        </p>
      </div>
    );

  return (
    <div className="flex gap-2.5">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-2.5">
        {message.blocks.map((b, i) => (
          <BlockView key={i} block={b} index={i} message={message} />
        ))}
        {showFollowUps && message.follow_ups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {message.follow_ups.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onFollowUp(f)}
                className="h-7 rounded-lg border border-line bg-surface px-2.5 text-[12px] text-chip-ink transition-colors hover:border-line-strong hover:bg-row hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

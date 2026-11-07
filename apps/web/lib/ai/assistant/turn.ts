import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { AssistantBlock } from "@tt/shared";
import { runStructuredWithTools } from "@/lib/ai/client";
import { assistantSystemPrompt } from "./prompts";
import type { Snapshot } from "./snapshot";
import { ReplyOut, validateReply } from "./validate";

/** How many earlier messages the model sees. */
const HISTORY = 20;

export type PastMessage = {
  role: "user" | "assistant";
  content: string;
  blocks: AssistantBlock[];
  resolved: Record<string, string>;
};

const time = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

/**
 * A past reply as text. Codes change every turn, so tasks are named by title; the model also
 * learns which cards the user acted on.
 */
function describeReply(m: PastMessage, snap: Snapshot): string {
  const title = (id: string) => `"${snap.titleOf.get(id) ?? "a task"}"`;
  const parts = m.blocks.map((b, i) => {
    const acted = Object.keys(m.resolved).some((k) => k.startsWith(`${i}:`));
    const tag = acted ? " (they added it)" : "";
    switch (b.kind) {
      case "text":
        return b.text;
      case "schedule":
        return `[Schedule for ${b.date}: ${b.picks.map((p) => `${time(p.start, snap.timezone)}-${time(p.end, snap.timezone)} ${title(p.task_id)}`).join("; ")}]${tag}`;
      case "tasks":
        return `[${b.label}: ${b.task_ids.map(title).join(", ")}]`;
      case "draft":
        return `[Draft to-do: "${b.draft.title}"]${tag}`;
      case "steps":
        return `[Steps for ${title(b.task_id)}: ${b.steps.map((s) => s.title).join("; ")}]${tag}`;
      case "slots":
        return `[Free time on ${b.date}]`;
      case "idea":
        return `[Idea plan "${b.plan.title}": ${b.plan.steps.join("; ")}${b.plan.resources.length ? `; links: ${b.plan.resources.map((r) => r.url).join(", ")}` : ""}]${tag}`;
      case "links":
        return `[${b.label}: ${b.resources.map((r) => `${r.title} ${r.url}`).join("; ")}]`;
    }
  });
  return parts.join("\n");
}

/**
 * One Ask tt. reply. Doesn't check limits: the caller calls `assertAiAllowed(userId,
 * "assistant")` first. `history` ends with the message to answer.
 */
export async function assistantTurn(userId: string, history: PastMessage[], snap: Snapshot) {
  const turns: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of history.slice(-HISTORY)) {
    const text = m.role === "user" ? m.content : describeReply(m, snap);
    if (!text) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === m.role) prev.text += `\n\n${text}`;
    else turns.push({ role: m.role, text });
  }
  if (turns[0]?.role !== "user") turns.unshift({ role: "user", text: "(Earlier messages trimmed.)" });
  const last = turns[turns.length - 1]!;
  const userText = last.role === "user" ? last.text : "";
  // The snapshot rides on the latest turn, so earlier turns stay the same (and cacheable).
  last.text = `${snap.text}\n\n<message>\n${last.text}\n</message>`;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = turns.map((t) => ({
    role: t.role,
    content: t.text,
  }));

  const { output, content } = await runStructuredWithTools({
    userId,
    system: assistantSystemPrompt({ settings: snap.notes, focus: snap.focus }),
    messages,
    schema: ReplyOut,
    effort: "medium",
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
  });

  // Links verified earlier (in this chat or the item's research) can be pointed at again.
  const trusted = [
    ...(snap.focus?.research?.resources.map((r) => r.url) ?? []),
    ...history.flatMap((m) =>
      m.blocks.flatMap((b) =>
        b.kind === "idea" ? b.plan.resources.map((r) => r.url) : b.kind === "links" ? b.resources.map((r) => r.url) : [],
      ),
    ),
  ];
  return validateReply(output, snap, {
    toolBlocks: content.filter((b) => b.type !== "text"),
    userText,
    trusted,
  });
}

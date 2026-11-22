import { findUrls, urlKey } from "../parse/link";

/**
 * Deterministic checks on Ask tt.'s reply text, run after the model answers. The prompt already
 * asks for all of this; these make sure of it. Each check that changes or flags the text adds a
 * tag to `fired`, which is stored on the reply so we can see what trips in production.
 */

export type GuardTag = "code" | "url" | "markdown" | "claim";

/** Snapshot codes: tasks (t3), steps (t3.s2) and booked blocks (b3). */
const CODE_RE = /\b([tb]\d+(?:\.s\d+)?)\b/g;
/** A code in brackets right after a name: "Essay (t3)". The name is already there, so drop it. */
const BRACKETED_CODE_RE = /\s*[([]\s*([tb]\d+(?:\.s\d+)?)\s*[)\]]/g;
const MD_LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const HEADING_RE = /^[ \t]*#{1,6}[ \t]+/m;
const TABLE_ROW_RE = /^[ \t]*\|(.*)\|[ \t]*$/;
const TABLE_RULE_RE = /^[\s|:-]+$/;
const BARE_WWW_RE = /(?<![\w/.@])www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)]*)?/gi;

/**
 * Claims that something in the planner already changed. Tapestry only proposes; the user applies
 * cards. Matches "I've added", "I have scheduled", "I just moved", "I went ahead and booked".
 */
const CLAIM_RE =
  /\bI(?:['’]ve| have| just| went ahead and|['’]ve just| have just)\s+(?:also\s+)?(?:added|scheduled|booked|moved|deleted|removed|updated|changed|marked|rescheduled|created|cleared|cancell?ed|renamed)\b/i;

/** Words that mean the user wants something gone, not just moved or cleared from a day. */
const DELETE_INTENT_RE =
  /\b(delete|deleting|remove|removing|drop|cancel|get rid of|scrap|ditch|trash|forget about|no longer|not doing|won['’]?t do|don['’]?t need|do not need|doesn['’]?t need|not needed|done with)\b/i;

export function claimsAction(text: string): boolean {
  return CLAIM_RE.test(text);
}

export function hasDeleteIntent(text: string): boolean {
  return DELETE_INTENT_RE.test(text);
}

export type GuardTextOpts = {
  /** What to call a snapshot code in text (task or step title, a block's task), or null if unknown. */
  nameOf: (code: string) => string | null;
  /**
   * Links the reply may show, as `urlKey`s (see `collectUrlKeys`): this turn's search results,
   * earlier verified links, the user's own.
   */
  allowedUrlKeys: Set<string>;
};

/** Cleans one piece of reply text (the text block or a follow-up). */
export function guardText(input: string, opts: GuardTextOpts): { text: string; fired: GuardTag[] } {
  const fired = new Set<GuardTag>();
  let text = input;

  // Markdown links: keep the label; the URL is checked below like any other.
  text = text.replace(MD_LINK_RE, (_m, label: string, url: string) => {
    fired.add("markdown");
    return isAllowed(url, opts.allowedUrlKeys) ? `${label} (${url})` : label;
  });
  if (HEADING_RE.test(text)) {
    fired.add("markdown");
    text = text.replace(new RegExp(HEADING_RE.source, "gm"), "");
  }
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const row = TABLE_ROW_RE.exec(line);
    if (!row) {
      kept.push(line);
      continue;
    }
    fired.add("markdown");
    if (TABLE_RULE_RE.test(line)) continue;
    const cells = row[1]!.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length) kept.push(`- ${cells.join(" · ")}`);
  }
  text = kept.join("\n");

  // Links that didn't come from a search, the user, or an earlier verified card.
  const urls = [...findUrls(text), ...(text.match(BARE_WWW_RE) ?? [])];
  for (const url of urls) {
    if (isAllowed(url, opts.allowedUrlKeys)) continue;
    fired.add("url");
    text = text.split(url).join("");
  }

  // Codes the user should never see.
  text = text.replace(BRACKETED_CODE_RE, (m, code: string) => {
    if (!opts.nameOf(code)) return m;
    fired.add("code");
    return "";
  });
  text = text.replace(CODE_RE, (m, code: string) => {
    const name = opts.nameOf(code);
    if (!name) return m;
    fired.add("code");
    return name;
  });

  if (fired.has("url") || fired.has("code")) text = tidy(text);
  return { text: text.trim(), fired: [...fired] };
}

function isAllowed(url: string, allowed: Set<string>): boolean {
  const key = urlKey(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  return !!key && allowed.has(key);
}

/** Cleans up what removing a link or code leaves behind: empty brackets, doubled spaces. */
function tidy(text: string): string {
  return text
    .replace(/[([]\s*[)\]]/g, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

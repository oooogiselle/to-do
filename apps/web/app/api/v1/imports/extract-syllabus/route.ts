import { ExtractSyllabusRequest } from "@tt/shared";
import { HttpError, parseBody, route } from "@/lib/api";
import { extractContext } from "@/lib/ai/context";
import { extractSyllabus, type SyllabusSource } from "@/lib/ai/extract";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/**
 * Syllabus (pasted text, or a PDF/image the client uploaded to the private `imports` bucket)
 * → proposed tasks. Uploaded files are deleted as soon as they've been read.
 */
export const POST = route(async (req, { supabase, user }) => {
  const body = await parseBody(req, ExtractSyllabusRequest);
  const ctx = await extractContext(supabase, user.id);
  if ("text" in body) return extractSyllabus({ kind: "text", text: body.text }, ctx);

  const path = body.storage_path;
  if (!path.startsWith(`${user.id}/`) || path.includes("..")) {
    throw new HttpError(403, "That file isn't yours");
  }
  const bucket = adminClient().storage.from("imports");
  try {
    const { data: blob, error } = await bucket.download(path);
    if (error || !blob) throw new HttpError(404, "Upload not found. Try uploading again.");
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const type = blob.type || "";
    let source: SyllabusSource;
    if (type === "application/pdf" || path.toLowerCase().endsWith(".pdf")) {
      source = { kind: "pdf", base64 };
    } else if ((IMAGE_TYPES as readonly string[]).includes(type)) {
      source = { kind: "image", base64, mediaType: type as ImageType };
    } else {
      throw new HttpError(415, "Upload a PDF or an image (PNG, JPEG, WebP).");
    }
    return await extractSyllabus(source, ctx);
  } finally {
    await bucket.remove([path]);
  }
});

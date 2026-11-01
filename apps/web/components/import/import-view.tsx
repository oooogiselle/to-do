"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, Sparkles, Upload } from "lucide-react";
import type { ProposedTask } from "@tt/shared";
import { api } from "@/lib/client/api";
import { uuid } from "@tt/client";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { ImportReview } from "./review";

type Tab = "text" | "syllabus";
type Proposal = {
  kind: Tab;
  name: string;
  tasks: ProposedTask[];
  course?: { code: string | null; title: string | null };
};

export const PREFILL_KEY = "import.prefill";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

const firstLine = (text: string) => text.trim().split("\n")[0]!.slice(0, 80) || "Pasted text";

export function ImportView() {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [syllabusText, setSyllabusText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const started = useRef(false);

  const extractText = async (input: string) => {
    setBusy("Finding tasks in your text…");
    setError(null);
    try {
      const { tasks } = await api.extractText(input);
      setProposal({ kind: "text", name: firstLine(input), tasks });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  // Quick add hands long text over with ⌘Enter: start right away.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let prefill: string | null = null;
    try {
      prefill = sessionStorage.getItem(PREFILL_KEY);
      sessionStorage.removeItem(PREFILL_KEY);
    } catch {}
    if (prefill?.trim()) {
      setText(prefill);
      void extractText(prefill);
    }
  }, []);

  const extractSyllabus = async () => {
    setError(null);
    try {
      if (file) {
        setBusy("Uploading…");
        const supabase = createBrowserSupabase();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Your session expired. Sign in again.");
        const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${user.id}/${uuid()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("imports").upload(path, file, {
          contentType: file.type,
        });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        setBusy("Reading your syllabus…");
        const r = await api.extractSyllabus({ storage_path: path, file_name: file.name });
        setProposal({ kind: "syllabus", name: file.name, ...r });
      } else {
        setBusy("Reading your syllabus…");
        const r = await api.extractSyllabus({ text: syllabusText });
        setProposal({ kind: "syllabus", name: firstLine(syllabusText), ...r });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that syllabus. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    if (/\.hei[cf]$/i.test(f.name) || f.type.includes("heic")) {
      return setError(
        "HEIC photos aren't supported yet. Export the photo as JPEG or PNG and try again.",
      );
    }
    if (!ACCEPT.split(",").includes(f.type))
      return setError("Upload a PDF or an image (PNG, JPEG, WebP).");
    if (f.size > MAX_FILE_BYTES)
      return setError("That file is over 20 MB. Try a smaller PDF or paste the text.");
    setFile(f);
  };

  const primary =
    "flex items-center gap-1.5 rounded-xl bg-sun px-4 py-2 text-sm font-extrabold text-[#4a3a12] transition-colors hover:bg-[#d9ae48] disabled:opacity-40";
  const area =
    "w-full flex-1 resize-y rounded-xl border border-line bg-[#fafafd] p-3 text-[13px] text-ink outline-none placeholder:text-[#a5a9bd] focus:border-sky focus:ring-2 focus:ring-sky/20";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-4 md:p-8">
        <p className="text-[12px] font-bold tracking-wider text-[#b88400] uppercase">Bulk add</p>
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Import</h1>
        <p className="mt-1 max-w-xl text-sm text-[#5b6078]">
          Paste a syllabus, an email or a messy list, or upload a syllabus PDF or photo. AI finds
          the tasks and due dates, and you review every one before it&apos;s added.
        </p>

        {proposal ? (
          <div className="mt-6">
            <ImportReview
              key={`${proposal.kind}-${proposal.name}`}
              {...proposal}
              onCancel={() => setProposal(null)}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <section className="flex flex-col rounded-2xl border border-line bg-white p-4">
              <div
                role="tablist"
                aria-label="Import from"
                className="mb-3 inline-flex self-start rounded-xl bg-[#e6e8f1] p-1"
              >
                {(
                  [
                    ["text", "Paste text"],
                    ["syllabus", "Syllabus"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => setTab(value)}
                    className={`rounded-lg px-3 py-1 text-sm font-bold transition-colors ${tab === value ? "bg-ink text-white" : "text-[#5b6078] hover:text-ink"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "text" ? (
                <form
                  className="flex flex-1 flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) void extractText(text);
                  }}
                >
                  <label htmlFor="import-text" className="text-[13px] font-extrabold text-ink">
                    Paste here
                  </label>
                  <textarea
                    id="import-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={12}
                    placeholder={
                      "cs61 lab fri 11pm, email prof re extension, buy poster board\n\nor paste an email thread, meeting notes, a project brief…"
                    }
                    className={area}
                  />
                  <div className="flex justify-end">
                    <button type="submit" disabled={!text.trim() || !!busy} className={primary}>
                      <Sparkles className="h-4 w-4" />
                      Find tasks
                      <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-1 flex-col gap-3">
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      pickFile(e.dataTransfer.files[0] ?? null);
                    }}
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line-strong bg-[#fafafd] px-4 py-8 text-center transition-colors hover:border-sun hover:bg-warn-bg"
                  >
                    <input
                      type="file"
                      accept={ACCEPT}
                      className="sr-only"
                      onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    />
                    {file ? (
                      <>
                        <FileText className="mb-1 h-6 w-6 text-sun" />
                        <span className="text-sm font-bold text-ink">{file.name}</span>
                        <span className="text-[12px] text-muted">Click to choose a different file</span>
                      </>
                    ) : (
                      <>
                        <Upload className="mb-1 h-6 w-6 text-sun" />
                        <span className="text-sm font-bold text-ink">
                          Drop a syllabus PDF or photo here
                        </span>
                        <span className="text-[12px] text-muted">
                          or click to choose a file, up to 20 MB
                        </span>
                      </>
                    )}
                  </label>
                  {!file && (
                    <>
                      <label htmlFor="syllabus-text" className="text-[13px] font-extrabold text-ink">
                        Or paste the syllabus text
                      </label>
                      <textarea
                        id="syllabus-text"
                        value={syllabusText}
                        onChange={(e) => setSyllabusText(e.target.value)}
                        rows={6}
                        className={area}
                      />
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="mr-auto text-[12px] text-muted">
                      The file is deleted as soon as it&apos;s been read.
                    </p>
                    {file && (
                      <button
                        onClick={() => setFile(null)}
                        className="px-2 py-2 text-sm font-bold text-muted hover:text-ink"
                      >
                        Remove file
                      </button>
                    )}
                    <button
                      onClick={extractSyllabus}
                      disabled={(!file && !syllabusText.trim()) || !!busy}
                      className={primary}
                    >
                      Find assignments and exams
                      <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="flex min-h-64 flex-col rounded-2xl bg-[#e9ebf3] p-4" aria-live="polite">
              <h2 className="mb-3 text-[13px] font-extrabold text-ink">Preview</h2>
              <div className="grid flex-1 place-items-center rounded-xl border-2 border-dashed border-[#cdd0de] p-8 text-center text-sm">
                {busy ? (
                  <p role="status" className="flex flex-col items-center gap-2 font-semibold text-ink">
                    <Sparkles className="h-5 w-5 animate-pulse text-sun" />
                    {busy}
                    <span className="font-normal text-muted">This can take up to a minute.</span>
                  </p>
                ) : error ? (
                  <p className="font-semibold text-risk">{error}</p>
                ) : (
                  <p className="text-[#7a7f96]">Tasks will show up here before anything is added.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

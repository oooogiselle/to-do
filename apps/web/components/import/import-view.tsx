"use client";

import { useEffect, useRef, useState } from "react";
import type { ProposedTask } from "@tt/shared";
import { api } from "@/lib/client/api";
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
        const path = `${user.id}/${crypto.randomUUID()}-${safe}`;
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Import tasks</h1>
          <p className="text-muted">
            Paste anything or upload a syllabus. You&apos;ll review every task before it&apos;s
            added.
          </p>
        </div>

        {proposal ? (
          <ImportReview
            key={`${proposal.kind}-${proposal.name}`}
            {...proposal}
            onCancel={() => setProposal(null)}
          />
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Import from"
              className="flex gap-1 border-b border-line"
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
                  className={`-mb-px border-b-2 px-3 py-2 ${tab === value ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "text" ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) void extractText(text);
                }}
              >
                <label htmlFor="import-text" className="sr-only">
                  Text to import
                </label>
                <textarea
                  id="import-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={12}
                  placeholder={
                    "cs61 lab fri 11pm, email prof re extension, buy poster board\n\nor paste an email thread, meeting notes, a project brief…"
                  }
                  className="w-full resize-y rounded-lg border border-line bg-surface p-3 outline-none focus:border-line-strong"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || !!busy}
                  className="rounded-md bg-ink px-4 py-2 text-paper hover:opacity-90 disabled:opacity-40"
                >
                  Find tasks
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    pickFile(e.dataTransfer.files[0] ?? null);
                  }}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-line-strong bg-surface px-4 py-8 text-center hover:border-ink"
                >
                  <input
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <>
                      <span className="font-medium">{file.name}</span>
                      <span className="text-muted">Click to choose a different file</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Drop a syllabus PDF or photo here</span>
                      <span className="text-muted">or click to choose a file, up to 20 MB</span>
                    </>
                  )}
                </label>
                {!file && (
                  <>
                    <label htmlFor="syllabus-text" className="text-muted">
                      Or paste the syllabus text
                    </label>
                    <textarea
                      id="syllabus-text"
                      value={syllabusText}
                      onChange={(e) => setSyllabusText(e.target.value)}
                      rows={6}
                      className="w-full resize-y rounded-lg border border-line bg-surface p-3 outline-none focus:border-line-strong"
                    />
                  </>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={extractSyllabus}
                    disabled={(!file && !syllabusText.trim()) || !!busy}
                    className="rounded-md bg-ink px-4 py-2 text-paper hover:opacity-90 disabled:opacity-40"
                  >
                    Find assignments and exams
                  </button>
                  {file && (
                    <button
                      onClick={() => setFile(null)}
                      className="px-3 py-2 text-muted hover:text-ink"
                    >
                      Remove file
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted">
                  The file is deleted as soon as it&apos;s been read.
                </p>
              </div>
            )}

            {busy && (
              <p role="status" className="text-muted">
                {busy} This can take up to a minute.
              </p>
            )}
            {error && <p className="text-risk">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

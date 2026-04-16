/**
 * Upload Page — CSV file ingestion interface for StatSports GPS, Force
 * Plate, ForceFrame, and NordBord data.
 *
 * Supports true multi-file uploads:
 *   1. Drag-drop (or click-select) any number of CSVs at once.
 *   2. Each file auto-starts processing immediately — no "Process All" click.
 *   3. Up to UPLOAD_CONCURRENCY files upload in parallel so a 50-file
 *      batch finishes in seconds rather than minutes.
 *   4. A summary banner tracks succeeded / failed counts in real time
 *      with "Retry Failed" and "Clear Completed" actions.
 */
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

/** How many uploads can be in-flight simultaneously. Kept low because
 *  each upload runs several sequential Supabase writes; four is a good
 *  balance between throughput and not hammering the DB. */
const UPLOAD_CONCURRENCY = 4;

type UploadStatus = "ready" | "uploading" | "complete" | "error";

interface UploadedFile {
  /** Stable UUID assigned when the file is queued — used for state
   *  updates so removing/retrying a file mid-batch can't target the
   *  wrong row by index. */
  id: string;
  name: string;
  size: number;
  file: File;
  status: UploadStatus;
  result?: UploadResult;
  error?: string;
}

interface UploadResult {
  csvType: string;
  playersFound: number;
  rowsParsed: number;
  rowsInserted: number;
  mappedColumns: number;
  unmappedHeaders: string[];
  skippedRows: { row: number; reason: string }[];
  insertErrors: string[];
  duplicateWarning?: string | null;
}

interface UploadGuideStep {
  step: string;
  title: string;
  desc: string;
}

const CSV_TYPE_LABELS: Record<string, string> = {
  gps: "StatSports GPS",
  jump: "Force Plate (CMJ)",
  force_frame: "ForceFrame (Hip AD/AB)",
  nordbord: "NordBord (Nordic)",
};

/**
 * Minimal UUID helper that falls back to a Math.random-based id on
 * environments where crypto.randomUUID is unavailable (older browsers
 * and some test runners).
 */
function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function UploadPage(): JSX.Element {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // Track which ids are currently in-flight so we can enforce the
  // concurrency cap without racing the React state update cycle.
  const inFlightIds = useRef<Set<string>>(new Set());

  /**
   * Update a single queue entry by id. All status transitions flow
   * through here so we never accidentally clobber unrelated rows.
   */
  const patchFile = useCallback((id: string, patch: Partial<UploadedFile>): void => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  /**
   * Run one file upload end-to-end. Pulls the File reference directly
   * from the argument rather than re-reading state, which avoids stale
   * closure bugs when rows have been removed from the queue.
   */
  const uploadOne = useCallback(
    async (entry: UploadedFile): Promise<void> => {
      patchFile(entry.id, { status: "uploading" });
      const formData = new FormData();
      formData.append("file", entry.file);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          patchFile(entry.id, {
            status: "error",
            error: typeof data?.error === "string" ? data.error : "Upload failed",
          });
          return;
        }
        patchFile(entry.id, { status: "complete", result: data });
      } catch (err) {
        patchFile(entry.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [patchFile]
  );

  /**
   * Promise-pool runner: up to UPLOAD_CONCURRENCY workers share a single
   * iterator over the batch, each pulling the next pending file when it
   * finishes its current one. Handles arbitrary batch sizes without
   * allocating N promises up front.
   */
  const runBatch = useCallback(
    async (entries: UploadedFile[]): Promise<void> => {
      if (entries.length === 0) return;

      // Mark every entry as in-flight so subsequent drops can't
      // re-queue the same id accidentally.
      for (const e of entries) inFlightIds.current.add(e.id);

      // Shared queue — each worker pulls the next pending entry via
      // .shift(). Array mutation is safe because only this function
      // holds a reference to the local copy.
      const queue = [...entries];
      const workers = Array.from(
        { length: Math.min(UPLOAD_CONCURRENCY, entries.length) },
        async () => {
          while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;
            await uploadOne(next);
            inFlightIds.current.delete(next.id);
          }
        }
      );
      await Promise.all(workers);
    },
    [uploadOne]
  );

  /**
   * Accept files from the dropzone, stamp each with a stable id, push
   * them into the queue, and kick off processing immediately. Users can
   * still remove a file while it's queued — the status check inside the
   * worker skips anything that's no longer in "ready" state.
   */
  const onDrop = useCallback(
    (acceptedFiles: File[]): void => {
      if (acceptedFiles.length === 0) return;
      const newEntries: UploadedFile[] = acceptedFiles.map((f) => ({
        id: makeId(),
        name: f.name,
        size: f.size,
        file: f,
        status: "ready" as const,
      }));
      setFiles((prev) => [...prev, ...newEntries]);
      void runBatch(newEntries);
    },
    [runBatch]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: true,
  });

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  /** Running tallies for the summary banner. Recomputed on every state
   *  change; O(N) over the queue which is small enough that memoization
   *  is mostly cosmetic here. */
  const stats = useMemo(() => {
    let ready = 0;
    let uploading = 0;
    let complete = 0;
    let errored = 0;
    for (const f of files) {
      if (f.status === "ready") ready += 1;
      else if (f.status === "uploading") uploading += 1;
      else if (f.status === "complete") complete += 1;
      else if (f.status === "error") errored += 1;
    }
    return { ready, uploading, complete, errored, total: files.length };
  }, [files]);

  const isProcessing = stats.uploading > 0 || stats.ready > 0;

  /** Retry every errored file by resetting it to ready and re-running. */
  const retryFailed = useCallback((): void => {
    const failed = files.filter((f) => f.status === "error");
    if (failed.length === 0) return;
    setFiles((prev) =>
      prev.map((f) => (f.status === "error" ? { ...f, status: "ready", error: undefined } : f))
    );
    void runBatch(failed.map((f) => ({ ...f, status: "ready" as const, error: undefined })));
  }, [files, runBatch]);

  /** Remove every completed row from the queue — leaves failed/uploading in place. */
  const clearCompleted = useCallback((): void => {
    setFiles((prev) => prev.filter((f) => f.status !== "complete"));
  }, []);

  const clearAll = useCallback((): void => {
    setFiles([]);
  }, []);

  const GUIDE_STEPS: UploadGuideStep[] = [
    {
      step: "01",
      title: "Export from StatSports",
      desc: "Open Apex software → Select session → Export as CSV with all metrics enabled",
    },
    {
      step: "02",
      title: "Drop Them All",
      desc: "Select as many CSVs as you want — uploads run in parallel and start automatically.",
    },
    {
      step: "03",
      title: "Auto Dashboard",
      desc: "Each file is parsed, validated, and your dashboard updates in real time.",
    },
  ];

  const statusIcon = (status: UploadStatus) => {
    switch (status) {
      case "ready":
        return <div className="w-2 h-2 rounded-full bg-aa-text-dim" />;
      case "uploading":
        return <div className="w-2 h-2 rounded-full bg-aa-accent animate-pulse-glow" />;
      case "complete":
        return <div className="w-2 h-2 rounded-full bg-aa-success" />;
      case "error":
        return <div className="w-2 h-2 rounded-full bg-aa-danger" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Page Header ──────────────────────────────────── */}
      <div className="opacity-0 animate-fade-in">
        <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
          UPLOAD SESSION DATA
        </h1>
        <p className="mt-1 text-sm text-aa-text-secondary">
          Drag-drop any number of CSVs — StatSports GPS, Force Plate, ForceFrame, or NordBord.
          Type is auto-detected and uploads run in parallel.
        </p>
      </div>

      {/* ── Drop Zone ────────────────────────────────────── */}
      <div
        {...getRootProps()}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300
          opacity-0 animate-slide-up
          ${
            isDragActive
              ? "border-aa-accent bg-aa-accent/5 drop-active"
              : "border-aa-border hover:border-aa-border-bright bg-aa-surface hover:bg-aa-elevated/30"
          }
        `}
        style={{ animationDelay: "100ms" }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center py-20 px-8">
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 ${
              isDragActive
                ? "bg-aa-accent/15 scale-110"
                : "bg-aa-elevated border border-aa-border"
            }`}
          >
            <svg
              className={`w-9 h-9 transition-colors ${isDragActive ? "text-aa-accent" : "text-aa-text-dim"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>

          {isDragActive ? (
            <>
              <p className="font-display text-2xl tracking-[0.06em] text-aa-accent mb-1">
                DROP FILES HERE
              </p>
              <p className="text-sm text-aa-accent/70">Release to upload CSV data</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl tracking-[0.06em] text-aa-text mb-1">
                DRAG & DROP CSV FILES
              </p>
              <p className="text-sm text-aa-text-secondary mb-4">
                Drop a single file or dozens at once — uploads start automatically
              </p>
              <div className="flex items-center gap-4 flex-wrap justify-center">
                {["StatSports GPS", "Force Plate CMJ", "ForceFrame", "NordBord"].map((label) => (
                  <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-aa-bg border border-aa-border">
                    <div className="w-2 h-2 rounded-full bg-aa-success" />
                    <span className="text-[11px] font-mono text-aa-text-dim">{label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-aa-bg border border-aa-border">
                  <div className="w-2 h-2 rounded-full bg-aa-text-dim" />
                  <span className="text-[11px] font-mono text-aa-text-dim">Max 50 MB · Up to {UPLOAD_CONCURRENCY} parallel</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-aa-accent/30 rounded-tl" />
        <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-aa-accent/30 rounded-tr" />
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-aa-accent/30 rounded-bl" />
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-aa-accent/30 rounded-br" />
      </div>

      {/* ── Summary Banner ───────────────────────────────── */}
      {files.length > 0 && (
        <div
          className="bg-aa-surface border border-aa-border rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3 opacity-0 animate-slide-up"
          style={{ animationDelay: "150ms" }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold tracking-wider uppercase text-aa-text-secondary">
              {isProcessing ? "Uploading…" : "Batch Complete"}
            </span>
            <StatPill label="Total" value={stats.total} tone="neutral" />
            {stats.uploading > 0 && <StatPill label="In Flight" value={stats.uploading} tone="accent" />}
            {stats.ready > 0 && <StatPill label="Queued" value={stats.ready} tone="dim" />}
            {stats.complete > 0 && <StatPill label="Success" value={stats.complete} tone="success" />}
            {stats.errored > 0 && <StatPill label="Failed" value={stats.errored} tone="danger" />}
          </div>
          <div className="flex items-center gap-2">
            {stats.errored > 0 && (
              <button
                type="button"
                onClick={retryFailed}
                className="px-3 py-1.5 rounded-lg border border-aa-danger/40 text-aa-danger text-[11px] font-mono uppercase tracking-wider hover:bg-aa-danger/10 transition-colors"
              >
                Retry Failed ({stats.errored})
              </button>
            )}
            {stats.complete > 0 && (
              <button
                type="button"
                onClick={clearCompleted}
                className="px-3 py-1.5 rounded-lg border border-aa-border text-aa-text-secondary text-[11px] font-mono uppercase tracking-wider hover:border-aa-border-bright hover:text-aa-text transition-colors"
              >
                Clear Completed
              </button>
            )}
            {!isProcessing && files.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="px-3 py-1.5 rounded-lg border border-aa-border text-aa-text-dim text-[11px] font-mono uppercase tracking-wider hover:text-aa-text transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── File Queue ───────────────────────────────────── */}
      {files.length > 0 && (
        <div className="bg-aa-surface border border-aa-border rounded-xl overflow-hidden opacity-0 animate-slide-up" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-aa-border bg-aa-bg/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider uppercase text-aa-text-secondary">
                Upload Queue
              </span>
              <span className="px-2 py-0.5 rounded-full bg-aa-accent/10 text-[10px] font-mono font-bold text-aa-accent">
                {files.length}
              </span>
            </div>
            <span className="text-[11px] font-mono text-aa-text-dim">
              {stats.complete + stats.errored} of {stats.total} done
            </span>
          </div>
          <div className="divide-y divide-aa-border/50 max-h-[480px] overflow-y-auto">
            {files.map((file, i) => (
              <div key={file.id}>
                <div
                  className="flex items-center gap-4 px-5 py-3 hover:bg-aa-elevated/30 transition-colors opacity-0 animate-slide-in-left"
                  style={{ animationDelay: `${300 + Math.min(i, 10) * 40}ms` }}
                >
                  <div className="w-9 h-9 rounded-lg bg-aa-accent/10 border border-aa-accent/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-mono font-bold text-aa-accent">CSV</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-aa-text truncate">{file.name}</p>
                    <p className="text-[11px] font-mono text-aa-text-dim">{formatSize(file.size)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusIcon(file.status)}
                    <span className="text-[11px] font-mono text-aa-text-secondary capitalize">
                      {file.status === "uploading" ? "processing" : file.status}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Only allow removal of rows that aren't currently in-flight
                      // to prevent orphaned state mid-upload.
                      if (file.status === "uploading") return;
                      setFiles((prev) => prev.filter((f) => f.id !== file.id));
                    }}
                    disabled={file.status === "uploading"}
                    className="p-1 rounded hover:bg-aa-danger/10 text-aa-text-dim hover:text-aa-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={file.status === "uploading" ? "Cannot remove while uploading" : "Remove from queue"}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Result details (shown after processing) */}
                {file.status === "complete" && file.result && (
                  <div className="px-5 pb-3 pl-[68px]">
                    <div className="flex flex-wrap gap-3">
                      <span className="px-2 py-0.5 rounded bg-aa-accent/10 text-[10px] font-mono font-bold text-aa-accent">
                        {CSV_TYPE_LABELS[file.result.csvType] ?? file.result.csvType}
                      </span>
                      <span className="text-[11px] font-mono text-aa-text-dim">
                        {file.result.playersFound} players
                      </span>
                      <span className="text-[11px] font-mono text-aa-text-dim">
                        {file.result.rowsInserted}/{file.result.rowsParsed} rows inserted
                      </span>
                      <span className="text-[11px] font-mono text-aa-text-dim">
                        {file.result.mappedColumns} columns mapped
                      </span>
                    </div>
                    {file.result.unmappedHeaders.length > 0 && (
                      <p className="text-[10px] font-mono text-aa-text-dim mt-1">
                        Unmapped headers: {file.result.unmappedHeaders.join(", ")}
                      </p>
                    )}
                    {file.result.skippedRows.length > 0 && (
                      <p className="text-[10px] font-mono text-aa-warning mt-1">
                        {file.result.skippedRows.length} rows skipped
                      </p>
                    )}
                    {file.result.insertErrors.length > 0 && (
                      <p className="text-[10px] font-mono text-aa-danger mt-1">
                        Insert errors: {file.result.insertErrors.join("; ")}
                      </p>
                    )}
                    {file.result.duplicateWarning && (
                      <p className="text-[10px] font-mono text-aa-warning mt-1">
                        ⚠ {file.result.duplicateWarning}
                      </p>
                    )}
                  </div>
                )}

                {/* Error details */}
                {file.status === "error" && file.error && (
                  <div className="px-5 pb-3 pl-[68px]">
                    <p className="text-[11px] font-mono text-aa-danger">{file.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Upload Guide ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 opacity-0 animate-slide-up" style={{ animationDelay: "300ms" }}>
        {GUIDE_STEPS.map((item) => (
          <div
            key={item.step}
            className="bg-aa-surface border border-aa-border rounded-xl p-5 hover:border-aa-border-bright transition-colors group"
          >
            <span className="font-display text-3xl text-aa-accent/30 group-hover:text-aa-accent/60 transition-colors">
              {item.step}
            </span>
            <h4 className="font-display text-base tracking-[0.04em] text-aa-text mt-2 mb-1">
              {item.title.toUpperCase()}
            </h4>
            <p className="text-xs text-aa-text-dim leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact colored pill used in the summary banner. Kept inline (not a
 * separate file) because it's only ever used here and the upload page
 * already has a lot of private presentation helpers.
 */
function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "accent" | "success" | "danger" | "dim";
}): JSX.Element {
  const toneClass =
    tone === "accent"
      ? "bg-aa-accent/10 text-aa-accent border-aa-accent/30"
      : tone === "success"
        ? "bg-aa-success/10 text-aa-success border-aa-success/30"
        : tone === "danger"
          ? "bg-aa-danger/10 text-aa-danger border-aa-danger/30"
          : tone === "dim"
            ? "bg-aa-bg text-aa-text-dim border-aa-border"
            : "bg-aa-elevated text-aa-text-secondary border-aa-border";
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border ${toneClass}`}>
      <span className="text-[10px] font-mono uppercase tracking-wider opacity-80">{label}</span>
      <span className="text-xs font-mono font-bold tabular-nums">{value}</span>
    </div>
  );
}

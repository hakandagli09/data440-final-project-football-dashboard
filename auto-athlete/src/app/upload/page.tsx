/**
 * Upload Page — CSV file ingestion interface for StatSports GPS data.
 *
 * Uses `react-dropzone` to provide a drag-and-drop file upload zone.
 * Files are sent to /api/upload which auto-detects the CSV type,
 * parses columns, and inserts into Supabase.
 */
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

interface UploadedFile {
  name: string;
  size: number;
  file: File;
  status: "ready" | "uploading" | "complete" | "error";
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

export default function UploadPage(): JSX.Element {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]): void => {
    const newFiles: UploadedFile[] = acceptedFiles.map((f) => ({
      name: f.name,
      size: f.size,
      file: f,
      status: "ready" as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

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

  const processFile = async (index: number) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, status: "uploading" as const } : f))
    );

    const fileEntry = files[index];
    const formData = new FormData();
    formData.append("file", fileEntry.file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setFiles((prev) =>
          prev.map((f, i) =>
            i === index ? { ...f, status: "error" as const, error: data.error } : f
          )
        );
        return;
      }

      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "complete" as const, result: data } : f
        )
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? { ...f, status: "error" as const, error: err instanceof Error ? err.message : "Upload failed" }
            : f
        )
      );
    }
  };

  const processAll = async () => {
    setIsProcessing(true);
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === "ready") {
        await processFile(i);
      }
    }
    setIsProcessing(false);
  };

  const GUIDE_STEPS: UploadGuideStep[] = [
    {
      step: "01",
      title: "Export from StatSports",
      desc: "Open Apex software → Select session → Export as CSV with all metrics enabled",
    },
    {
      step: "02",
      title: "Upload Here",
      desc: "Drag the exported CSV into the upload zone above. Multi-file upload supported.",
    },
    {
      step: "03",
      title: "Auto Dashboard",
      desc: "Data is parsed, validated, and your dashboard updates in real-time with session metrics.",
    },
  ];

  const statusIcon = (status: UploadedFile["status"]) => {
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
          Import CSV exports from StatSports Apex, Force Plate, ForceFrame, or NordBord — type is auto-detected
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
                or click to browse your file system
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
                  <span className="text-[11px] font-mono text-aa-text-dim">Max 50 MB</span>
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                processAll();
              }}
              disabled={isProcessing || files.every((f) => f.status !== "ready")}
              className="px-4 py-1.5 rounded-lg bg-aa-accent text-aa-bg text-xs font-bold tracking-wider uppercase hover:bg-aa-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isProcessing ? "Processing..." : "Process All"}
            </button>
          </div>
          <div className="divide-y divide-aa-border/50">
            {files.map((file, i) => (
              <div key={`${file.name}-${i}`}>
                <div
                  className="flex items-center gap-4 px-5 py-3 hover:bg-aa-elevated/30 transition-colors opacity-0 animate-slide-in-left"
                  style={{ animationDelay: `${300 + i * 60}ms` }}
                >
                  {/* File icon */}
                  <div className="w-9 h-9 rounded-lg bg-aa-accent/10 border border-aa-accent/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-mono font-bold text-aa-accent">CSV</span>
                  </div>
                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-aa-text truncate">{file.name}</p>
                    <p className="text-[11px] font-mono text-aa-text-dim">{formatSize(file.size)}</p>
                  </div>
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {statusIcon(file.status)}
                    <span className="text-[11px] font-mono text-aa-text-secondary capitalize">
                      {file.status === "uploading" ? "processing" : file.status}
                    </span>
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    className="p-1 rounded hover:bg-aa-danger/10 text-aa-text-dim hover:text-aa-danger transition-colors"
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

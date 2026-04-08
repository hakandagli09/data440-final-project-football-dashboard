"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatTimestamp, formatTimestampTime } from "@/lib/date-utils";

interface Upload {
  id: string;
  filename: string;
  csv_type: string;
  uploaded_at: string;
  row_count: number | null;
  status: string;
  error_detail: { skippedRows?: { row: number; reason: string }[]; insertErrors?: string[] } | null;
  players: string[];
}

const CSV_TYPE_LABELS: Record<string, string> = {
  gps: "StatSports GPS",
  jump: "Force Plate",
  force_frame: "ForceFrame",
  nordbord: "NordBord",
};

const CSV_TYPE_COLORS: Record<string, string> = {
  gps: "bg-aa-accent/10 text-aa-accent border-aa-accent/20",
  jump: "bg-aa-warm/10 text-aa-warm border-aa-warm/20",
  force_frame: "bg-aa-success/10 text-aa-success border-aa-success/20",
  nordbord: "bg-aa-warning/10 text-aa-warning border-aa-warning/20",
};

const FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "gps", label: "StatSports GPS" },
  { value: "jump", label: "Force Plate" },
  { value: "force_frame", label: "ForceFrame" },
  { value: "nordbord", label: "NordBord" },
];

export default function DataManagementPage() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Upload | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUploads = useCallback(async () => {
    setLoading(true);
    const params = filter !== "all" ? `?type=${filter}` : "";
    const res = await fetch(`/api/uploads${params}`);
    if (res.ok) {
      setUploads(await res.json());
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/uploads/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setUploads((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const formatDate = formatTimestamp;
  const formatTime = formatTimestampTime;

  const totalRows = uploads.reduce((sum, u) => sum + (u.row_count ?? 0), 0);
  const totalPlayers = new Set(uploads.flatMap((u) => u.players)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between opacity-0 animate-fade-in">
        <div>
          <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
            DATA MANAGEMENT
          </h1>
          <p className="mt-1 text-sm text-aa-text-secondary">
            View, inspect, and delete uploaded data files
          </p>
        </div>
        <Link
          href="/upload"
          className="px-4 py-2 rounded-lg bg-aa-accent/10 border border-aa-accent/20 text-xs font-semibold text-aa-accent hover:bg-aa-accent/20 transition-colors"
        >
          Upload New Data
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 opacity-0 animate-slide-up" style={{ animationDelay: "100ms" }}>
        {[
          { label: "Total Uploads", value: uploads.length, accent: "text-aa-accent" },
          { label: "Total Rows", value: totalRows.toLocaleString(), accent: "text-aa-text" },
          { label: "Unique Players", value: totalPlayers, accent: "text-aa-text" },
          {
            label: "Errors",
            value: uploads.filter((u) => u.status === "error" || u.status === "partial").length,
            accent: uploads.some((u) => u.status === "error") ? "text-aa-danger" : "text-aa-text",
          },
        ].map((card) => (
          <div key={card.label} className="bg-aa-surface border border-aa-border rounded-xl p-4">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-aa-text-dim">
              {card.label}
            </span>
            <p className={`font-display text-2xl mt-1 ${card.accent}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 opacity-0 animate-slide-up" style={{ animationDelay: "200ms" }}>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wider transition-colors border ${
              filter === opt.value
                ? "bg-aa-accent/10 text-aa-accent border-aa-accent/20"
                : "text-aa-text-dim hover:text-aa-text border-transparent hover:border-aa-border"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Upload table */}
      <div className="bg-aa-surface border border-aa-border rounded-xl overflow-hidden opacity-0 animate-slide-up" style={{ animationDelay: "300ms" }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-aa-accent/30 border-t-aa-accent rounded-full animate-spin" />
          </div>
        ) : uploads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-aa-elevated border border-aa-border flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-aa-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <p className="font-display text-lg tracking-[0.06em] text-aa-text-secondary">NO UPLOADS FOUND</p>
            <p className="text-xs text-aa-text-dim mt-1">Upload CSV data to get started</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-aa-border bg-aa-bg/50">
                <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-5 py-3 w-8" />
                <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Filename</th>
                <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Type</th>
                <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Date</th>
                <th className="text-right text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Rows</th>
                <th className="text-center text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Status</th>
                <th className="text-right text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload, i) => {
                const isExpanded = expandedId === upload.id;
                const hasErrors = upload.status === "error" || upload.status === "partial";
                const skipped = upload.error_detail?.skippedRows ?? [];
                const insertErrors = upload.error_detail?.insertErrors ?? [];

                return (
                  <tr key={upload.id} className="group" style={{ animationDelay: `${400 + i * 40}ms` }}>
                    <td colSpan={7} className="p-0">
                      {/* Main row */}
                      <div
                        className="flex items-center border-b border-aa-border/30 hover:bg-aa-elevated/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : upload.id)}
                      >
                        <div className="px-5 py-3.5 w-8">
                          <svg
                            className={`w-3.5 h-3.5 text-aa-text-dim transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                        <div className="flex-1 px-4 py-3.5">
                          <span className="text-sm font-semibold text-aa-text">{upload.filename}</span>
                        </div>
                        <div className="px-4 py-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${CSV_TYPE_COLORS[upload.csv_type] ?? "text-aa-text-dim"}`}>
                            {CSV_TYPE_LABELS[upload.csv_type] ?? upload.csv_type}
                          </span>
                        </div>
                        <div className="px-4 py-3.5 min-w-[140px]">
                          <span className="text-xs text-aa-text-secondary">{formatDate(upload.uploaded_at)}</span>
                          <span className="text-[10px] text-aa-text-dim ml-2">{formatTime(upload.uploaded_at)}</span>
                        </div>
                        <div className="px-4 py-3.5 text-right min-w-[80px]">
                          <span className="text-sm font-mono text-aa-text tabular-nums">{upload.row_count ?? 0}</span>
                        </div>
                        <div className="px-4 py-3.5 text-center min-w-[90px]">
                          {upload.status === "success" && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-aa-success/10 text-[10px] font-bold text-aa-success">
                              <span className="w-1.5 h-1.5 rounded-full bg-aa-success" />
                              Success
                            </span>
                          )}
                          {upload.status === "partial" && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-aa-warning/10 text-[10px] font-bold text-aa-warning">
                              <span className="w-1.5 h-1.5 rounded-full bg-aa-warning" />
                              Partial
                            </span>
                          )}
                          {upload.status === "error" && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-aa-danger/10 text-[10px] font-bold text-aa-danger">
                              <span className="w-1.5 h-1.5 rounded-full bg-aa-danger" />
                              Error
                            </span>
                          )}
                        </div>
                        <div className="px-5 py-3.5 text-right min-w-[80px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(upload);
                            }}
                            className="p-1.5 rounded-lg text-aa-text-dim hover:text-aa-danger hover:bg-aa-danger/10 transition-colors"
                            title="Delete upload and all associated data"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-5 py-4 bg-aa-bg/30 border-b border-aa-border/30">
                          <div className="grid grid-cols-2 gap-6">
                            {/* Player list */}
                            <div>
                              <span className="text-[10px] font-bold tracking-wider uppercase text-aa-text-dim mb-2 block">
                                Players ({upload.players.length})
                              </span>
                              {upload.players.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {upload.players.map((name) => (
                                    <span
                                      key={name}
                                      className="px-2 py-0.5 rounded bg-aa-elevated border border-aa-border text-[11px] font-mono text-aa-text-secondary"
                                    >
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-aa-text-dim">No player data</p>
                              )}
                            </div>

                            {/* Error details */}
                            <div>
                              {hasErrors && (skipped.length > 0 || insertErrors.length > 0) ? (
                                <>
                                  <span className="text-[10px] font-bold tracking-wider uppercase text-aa-warning mb-2 block">
                                    Issues
                                  </span>
                                  {skipped.length > 0 && (
                                    <div className="mb-2">
                                      <p className="text-[11px] font-semibold text-aa-text-secondary mb-1">
                                        {skipped.length} row{skipped.length !== 1 ? "s" : ""} skipped:
                                      </p>
                                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                                        {skipped.map((s, idx) => (
                                          <p key={idx} className="text-[10px] font-mono text-aa-text-dim">
                                            Row {s.row}: {s.reason}
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {insertErrors.length > 0 && (
                                    <div>
                                      <p className="text-[11px] font-semibold text-aa-danger mb-1">Insert errors:</p>
                                      {insertErrors.map((e, idx) => (
                                        <p key={idx} className="text-[10px] font-mono text-aa-danger/80">{e}</p>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="text-[10px] font-bold tracking-wider uppercase text-aa-text-dim mb-2 block">
                                    Upload Details
                                  </span>
                                  <p className="text-xs text-aa-text-dim">
                                    Type: {CSV_TYPE_LABELS[upload.csv_type] ?? upload.csv_type}
                                  </p>
                                  <p className="text-xs text-aa-text-dim">
                                    Uploaded: {formatDate(upload.uploaded_at)} at {formatTime(upload.uploaded_at)}
                                  </p>
                                  <p className="text-xs text-aa-text-dim">
                                    {upload.row_count ?? 0} rows across {upload.players.length} players
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-aa-surface border border-aa-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-aa-danger/10 border border-aa-danger/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-aa-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="font-display text-xl tracking-[0.04em] text-aa-text">DELETE UPLOAD</h3>
                <p className="text-xs text-aa-text-dim">This action cannot be undone</p>
              </div>
            </div>

            <div className="bg-aa-bg rounded-lg border border-aa-border p-4 mb-5">
              <p className="text-sm text-aa-text font-semibold">{deleteTarget.filename}</p>
              <p className="text-xs text-aa-text-dim mt-1">
                This will permanently delete <strong className="text-aa-text">{deleteTarget.row_count ?? 0} rows</strong> of{" "}
                {CSV_TYPE_LABELS[deleteTarget.csv_type] ?? deleteTarget.csv_type} data
                for <strong className="text-aa-text">{deleteTarget.players.length} player{deleteTarget.players.length !== 1 ? "s" : ""}</strong>.
              </p>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-aa-text-secondary hover:text-aa-text hover:bg-aa-elevated transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-aa-danger text-white text-sm font-semibold hover:bg-aa-danger/90 transition-colors disabled:opacity-40"
              >
                {deleting ? "Deleting..." : "Delete Data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

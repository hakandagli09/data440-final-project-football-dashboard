export type PositionGroup = "skills_mids" | "bigs" | "other";

const SKILLS_MIDS_POSITIONS = new Set([
  "QB",
  "RB",
  "WR",
  "TE",
  "DB",
  "CB",
  "S",
  "FS",
  "SS",
  "LB",
  "ILB",
  "OLB",
  "EDGE",
  "DE",
  "NT",
]);

const BIGS_POSITIONS = new Set([
  "OL",
  "DL",
  "OT",
  "OG",
  "C",
  "LT",
  "RT",
  "LG",
  "RG",
  "DT",
]);

export function normalizePosition(position: string | null | undefined): string {
  if (!position) return "";
  return position.trim().toUpperCase();
}

export function getPositionGroup(position: string | null | undefined): PositionGroup {
  const normalized = normalizePosition(position);
  if (!normalized) return "other";

  if (SKILLS_MIDS_POSITIONS.has(normalized)) {
    return "skills_mids";
  }
  if (BIGS_POSITIONS.has(normalized)) {
    return "bigs";
  }

  // Handle combined or variant labels from CSV imports.
  if (normalized.includes("EDGE")) return "skills_mids";
  if (normalized.includes("LB")) return "skills_mids";
  if (normalized.includes("DB")) return "skills_mids";
  if (normalized.includes("OL")) return "bigs";
  if (normalized.includes("DL")) return "bigs";

  return "other";
}

export function getPositionGroupLabel(position: string | null | undefined): "Skills / Mids" | "Bigs" | "Other" {
  const group = getPositionGroup(position);
  if (group === "skills_mids") return "Skills / Mids";
  if (group === "bigs") return "Bigs";
  return "Other";
}

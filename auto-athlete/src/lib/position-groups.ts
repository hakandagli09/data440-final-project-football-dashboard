export type PositionGroup = "skills_mids" | "bigs" | "other";

/**
 * Offense vs. defense label used for the coach-facing Session Report.
 * "unknown" is returned when the position cannot be mapped (rare, but
 * possible for mis-keyed CSV imports).
 */
export type PositionSide = "offense" | "defense" | "unknown";

const OFFENSE_POSITIONS = new Set([
  "QB", "RB", "WR", "TE", "OL", "OT", "OG", "C", "LT", "RT", "LG", "RG", "FB", "HB",
]);

const DEFENSE_POSITIONS = new Set([
  "DB", "CB", "S", "FS", "SS", "LB", "ILB", "OLB", "EDGE", "DE", "DT", "DL", "NT", "MLB",
]);

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

/**
 * Map a raw position string to offense / defense. Returns "unknown"
 * when the position is blank or cannot be mapped — we do NOT default
 * to either side because that would silently place a player on the
 * wrong report sheet.
 */
export function getSide(position: string | null | undefined): PositionSide {
  const normalized = normalizePosition(position);
  if (!normalized) return "unknown";

  if (OFFENSE_POSITIONS.has(normalized)) return "offense";
  if (DEFENSE_POSITIONS.has(normalized)) return "defense";

  // Substring fallbacks for hyphenated / combo labels like "EDGE-DE".
  if (normalized.includes("QB") || normalized.includes("RB") || normalized.includes("WR") || normalized.includes("TE") || normalized.includes("OL")) {
    return "offense";
  }
  if (normalized.includes("DB") || normalized.includes("LB") || normalized.includes("DL") || normalized.includes("EDGE")) {
    return "defense";
  }

  return "unknown";
}

export function getSideLabel(side: PositionSide): "Offense" | "Defense" | "Unassigned" {
  if (side === "offense") return "Offense";
  if (side === "defense") return "Defense";
  return "Unassigned";
}

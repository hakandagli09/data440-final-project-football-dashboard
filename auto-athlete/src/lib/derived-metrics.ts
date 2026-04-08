import { subtractDays } from "@/lib/date-utils";

export function computeEwma(series: number[], lambda = 0.28): number[] {
  if (series.length === 0) return [];
  const out: number[] = [series[0]];
  for (let i = 1; i < series.length; i++) {
    out.push(lambda * series[i] + (1 - lambda) * out[i - 1]);
  }
  return out;
}

export function computeHsbi(zone46Decelerations: number, maxSpeed: number): number {
  return zone46Decelerations * maxSpeed;
}

export function computeMomentum(bodyWeightKg: number | null, weeklyTopSpeed: number): number | null {
  if (bodyWeightKg == null || bodyWeightKg <= 0) return null;
  return bodyWeightKg * weeklyTopSpeed;
}

export function computePctMaxVelocity(maxSpeed: number, playerTopSpeed: number): number | null {
  if (playerTopSpeed <= 0) return null;
  return (maxSpeed / playerTopSpeed) * 100;
}

export function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

export function computeSprintRecency(
  sessionDatesAndMaxSpeed: Array<{ date: string; maxSpeed: number }>
): { daysSince90: number | null; daysSince85: number | null; allTimeMax: number | null } {
  if (sessionDatesAndMaxSpeed.length === 0) {
    return { daysSince90: null, daysSince85: null, allTimeMax: null };
  }

  const sorted = [...sessionDatesAndMaxSpeed].sort((a, b) => a.date.localeCompare(b.date));
  const allTimeMax = Math.max(...sorted.map((row) => row.maxSpeed));
  if (allTimeMax <= 0) return { daysSince90: null, daysSince85: null, allTimeMax: null };

  const latestDate = sorted[sorted.length - 1].date;
  const threshold90 = allTimeMax * 0.9;
  const threshold85 = allTimeMax * 0.85;

  const last90 = [...sorted].reverse().find((row) => row.maxSpeed >= threshold90)?.date ?? null;
  const last85 = [...sorted].reverse().find((row) => row.maxSpeed >= threshold85)?.date ?? null;

  return {
    daysSince90: last90 ? daysBetween(last90, latestDate) : null,
    daysSince85: last85 ? daysBetween(last85, latestDate) : null,
    allTimeMax,
  };
}

export function getWeekStart(date: string): string {
  let cursor = date;
  let guard = 0;
  while (guard < 7) {
    const day = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (day === 1) return cursor;
    cursor = subtractDays(cursor, 1);
    guard += 1;
  }
  return cursor;
}

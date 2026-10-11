import type { Database } from "@/integrations/supabase/types";

export type Doc = Database["public"]["Tables"]["documents"]["Row"];

export const CATEGORIES = ["Identity", "Education", "Insurance", "Financial", "Others"] as const;

export const MS_DAY = 86_400_000;

/** Whole days from `today` until the expiry date (negative when expired). */
export function daysUntil(expiry: string | null, today: Date = new Date()): number | null {
  if (!expiry) return null;
  const end = new Date(expiry + "T00:00:00");
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end.getTime() - start.getTime()) / MS_DAY);
}

export type ExpiryState = "none" | "expired" | "soon" | "upcoming" | "valid";

/** Expiring soon = within 30 days; upcoming = within a year. */
export function expiryState(expiry: string | null, today: Date = new Date()): ExpiryState {
  const d = daysUntil(expiry, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= 30) return "soon";
  if (d <= 365) return "upcoming";
  return "valid";
}

export function humanDays(d: number | null) {
  if (d === null) return "—";
  if (d < 0) return `${Math.abs(d)} days ago`;
  if (d < 60) return `${d} days`;
  return `${Math.round(d / 30)} months`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const STORAGE_LIMIT = 10 * 1024 ** 3;

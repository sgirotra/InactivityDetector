import seed from "../data/seed-data.json";
import { DEFAULT_ALIASES } from "@/lib/defaults";
import { normalizeTransfer, transferSchema } from "@/lib/transfer";
import type { PlannerState } from "@/lib/types";

export function seedState(): PlannerState {
  return normalizeTransfer(transferSchema.parse(seed));
}

/** Seed state with the default quick-add aliases the seed script installs. */
export function seededWithAliases(): PlannerState {
  const s = seedState();
  for (const sec of s.sections) sec.aliases = DEFAULT_ALIASES[sec.id] ?? "";
  return s;
}

/** An instant given as Eastern wall-clock time during EDT (UTC-4). */
export function edt(date: string, time = "12:00"): Date {
  return new Date(`${date}T${time}:00-04:00`);
}

/** An instant given as Eastern wall-clock time during EST (UTC-5). */
export function est(date: string, time = "12:00"): Date {
  return new Date(`${date}T${time}:00-05:00`);
}

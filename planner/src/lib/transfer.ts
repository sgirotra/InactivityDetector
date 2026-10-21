import { z } from "zod";
import { DOW, TZ } from "./dates";
import type { PlannerState } from "./types";

// The backup format is the same shape as data/seed-data.json, extended with the
// fields the app adds (ids on blocks, completedAt, order, ...). Everything new is
// optional, so the original seed file and any export both import cleanly.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullish();

const focusItemIn = z.object({
  id: z.string().min(1),
  title: z.string(),
  note: opt(z.string()),
  order: opt(z.number().int()),
  linkedTaskId: opt(z.string()),
  completedAt: opt(z.string()),
});
const focusListIn = z.object({ date, label: opt(z.string()), items: z.array(focusItemIn).default([]) });

export const transferSchema = z.object({
  _meta: z.record(z.string(), z.unknown()).optional(),
  recurringBlocks: z
    .array(
      z.object({
        id: opt(z.string()),
        weekday: z.number().int().min(0).max(6),
        start: time,
        end: time,
        name: z.string(),
        kind: z.string().default(""),
        survivesDaysOff: z.boolean().default(false),
        activeFrom: opt(date),
        activeUntil: opt(date),
      }),
    )
    .default([]),
  events: z
    .array(
      z.object({
        id: z.string().min(1),
        date,
        start: opt(time),
        end: opt(time),
        title: z.string(),
        category: z.string().default(""),
        note: opt(z.string()),
        completedAt: opt(z.string()),
      }),
    )
    .default([]),
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        area: z.string(),
        name: z.string(),
        credits: opt(z.number().int()),
        aliases: opt(z.string()),
        order: opt(z.number().int()),
        archived: opt(z.boolean()),
      }),
    )
    .default([]),
  tasks: z
    .array(
      z.object({
        id: z.string().min(1),
        sectionId: z.string(),
        title: z.string(),
        note: opt(z.string()),
        due: opt(date),
        dueTime: opt(time),
        priority: opt(z.number().int()),
        order: opt(z.number().int()),
        completedAt: opt(z.string()),
        createdAt: opt(z.string()),
      }),
    )
    .default([]),
  focus: opt(focusListIn),
  focusLists: z.array(focusListIn).optional(),
  daysOff: z.array(z.object({ date, label: z.string().default("Day off") })).default([]),
  blockSkips: z
    .array(
      z.object({
        id: opt(z.string()),
        date,
        blockNames: z.array(z.string()).optional(),
        blockIds: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  clashNotes: z.array(z.object({ id: opt(z.string()), date, text: z.string() })).default([]),
});

export type TransferData = z.infer<typeof transferSchema>;

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Small stable hash so id-less rows (clash notes) get the same id every import. */
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function blockId(b: { weekday: number; start: string; name: string }): string {
  return `blk-${b.weekday}-${b.start.replace(":", "")}-${slug(b.name)}`;
}

/** Normalize a seed/export file into plain records with ids filled in. */
export function normalizeTransfer(data: TransferData): PlannerState {
  const nowIso = new Date().toISOString();
  const focusLists = [...(data.focusLists ?? [])];
  if (data.focus && !focusLists.some((l) => l.date === data.focus!.date)) focusLists.push(data.focus);

  return {
    sections: data.sections.map((s, i) => ({
      id: s.id,
      area: s.area,
      name: s.name,
      credits: s.credits ?? null,
      aliases: s.aliases ?? "",
      order: s.order ?? i,
      archived: s.archived ?? false,
    })),
    tasks: data.tasks.map((t, i) => ({
      id: t.id,
      sectionId: t.sectionId,
      title: t.title,
      note: t.note ?? null,
      due: t.due ?? null,
      dueTime: t.dueTime ?? null,
      priority: t.priority ?? null,
      order: t.order ?? i,
      completedAt: t.completedAt ?? null,
      createdAt: t.createdAt ?? nowIso,
    })),
    blocks: data.recurringBlocks.map((b) => ({
      id: b.id ?? blockId(b),
      weekday: b.weekday,
      start: b.start,
      end: b.end,
      name: b.name,
      kind: b.kind,
      survivesDaysOff: b.survivesDaysOff,
      activeFrom: b.activeFrom ?? null,
      activeUntil: b.activeUntil ?? null,
    })),
    events: data.events.map((e) => ({
      id: e.id,
      date: e.date,
      start: e.start ?? null,
      end: e.end ?? null,
      title: e.title,
      category: e.category,
      note: e.note ?? null,
      completedAt: e.completedAt ?? null,
    })),
    daysOff: data.daysOff.map((d) => ({ date: d.date, label: d.label })),
    skips: data.blockSkips.flatMap((s) => [
      ...(s.blockNames ?? []).map((n) => ({
        id: s.id && (s.blockNames?.length ?? 0) + (s.blockIds?.length ?? 0) === 1 ? s.id : `skip-${s.date}-${slug(n)}`,
        date: s.date,
        blockId: null,
        blockName: n,
      })),
      ...(s.blockIds ?? []).map((bid) => ({
        id: s.id && (s.blockNames?.length ?? 0) + (s.blockIds?.length ?? 0) === 1 ? s.id : `skip-${s.date}-${slug(bid)}`,
        date: s.date,
        blockId: bid,
        blockName: null,
      })),
    ]),
    focusLists: focusLists.map((l) => ({
      date: l.date,
      label: l.label ?? null,
      items: l.items.map((it, i) => ({
        id: it.id,
        listDate: l.date,
        title: it.title,
        note: it.note ?? null,
        linkedTaskId: it.linkedTaskId ?? null,
        order: it.order ?? i,
        completedAt: it.completedAt ?? null,
      })),
    })),
    clashNotes: data.clashNotes.map((c) => ({
      id: c.id ?? `clash-${c.date}-${shortHash(c.text)}`,
      date: c.date,
      text: c.text,
    })),
  };
}

const strip = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;

/** Export everything in the seed-data.json shape (plus ids, completion and ordering). */
export function toTransfer(state: PlannerState, now: Date = new Date()): Record<string, unknown> {
  const lists = [...state.focusLists].sort((a, b) => a.date.localeCompare(b.date));
  const latest = lists[lists.length - 1];
  const focusOut = (l: (typeof lists)[number]) =>
    strip({
      date: l.date,
      label: l.label,
      items: l.items.map((i) => strip({ id: i.id, title: i.title, note: i.note, order: i.order, linkedTaskId: i.linkedTaskId, completedAt: i.completedAt })),
    });
  return {
    _meta: { exportedAt: now.toISOString(), timezone: TZ, source: "Planner export", notes: "All times are Eastern, 24h HH:MM. Dates are YYYY-MM-DD local Eastern dates." },
    recurringBlocks: [...state.blocks]
      .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
      .map((b) =>
        strip({
          id: b.id,
          weekday: b.weekday,
          weekdayName: DOW[b.weekday],
          start: b.start,
          end: b.end,
          name: b.name,
          kind: b.kind,
          survivesDaysOff: b.survivesDaysOff,
          activeFrom: b.activeFrom,
          activeUntil: b.activeUntil,
        }),
      ),
    events: [...state.events].sort((a, b) => a.date.localeCompare(b.date)).map((e) => strip({ ...e })),
    sections: [...state.sections].sort((a, b) => a.order - b.order).map((s) => strip({ ...s })),
    tasks: [...state.tasks].sort((a, b) => a.sectionId.localeCompare(b.sectionId) || a.order - b.order).map((t) => strip({ ...t })),
    focus: latest ? focusOut(latest) : null,
    focusLists: lists.map(focusOut),
    daysOff: [...state.daysOff].sort((a, b) => a.date.localeCompare(b.date)),
    blockSkips: [...state.skips]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => strip({ id: s.id, date: s.date, blockNames: s.blockName ? [s.blockName] : undefined, blockIds: s.blockId ? [s.blockId] : undefined })),
    clashNotes: [...state.clashNotes].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

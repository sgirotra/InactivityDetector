import type { PlannerState } from "../types";
import { prisma, type Tx } from "./db";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function loadState(db: Tx = prisma): Promise<PlannerState> {
  const [sections, tasks, blocks, events, daysOff, skips, focusLists, clashNotes] = await Promise.all([
    db.section.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
    db.task.findMany({ orderBy: [{ sectionId: "asc" }, { order: "asc" }, { createdAt: "asc" }] }),
    db.recurringBlock.findMany({ orderBy: [{ weekday: "asc" }, { start: "asc" }] }),
    db.event.findMany({ orderBy: [{ date: "asc" }, { start: "asc" }] }),
    db.dayOff.findMany({ orderBy: { date: "asc" } }),
    db.blockSkip.findMany({ orderBy: { date: "asc" } }),
    db.focusList.findMany({ orderBy: { date: "asc" }, include: { items: { orderBy: { order: "asc" } } } }),
    db.clashNote.findMany({ orderBy: { date: "asc" } }),
  ]);
  return {
    sections,
    tasks: tasks.map((t) => ({ ...t, completedAt: iso(t.completedAt), createdAt: t.createdAt.toISOString() })),
    blocks,
    events: events.map((e) => ({ ...e, completedAt: iso(e.completedAt) })),
    daysOff,
    skips,
    focusLists: focusLists.map((l) => ({
      date: l.date,
      label: l.label,
      items: l.items.map((i) => ({ ...i, completedAt: iso(i.completedAt) })),
    })),
    clashNotes,
  };
}

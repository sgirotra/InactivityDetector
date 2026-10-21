import { addDays, dayDiff, fmtShort } from "./dates";
import type { CalEvent, FocusList, PlannerState, Section, Task } from "./types";

export type DueTone = "past" | "today" | "soon" | "plain";

export interface DueChip {
  tone: DueTone;
  label: string;
  /** due - today in days; negative when late */
  days: number;
}

/** Overdue: red "Nd late". Today: amber. Within 4 days: gold "Nd". Further: plain date. */
export function dueChip(due: string | null | undefined, today: string): DueChip | null {
  if (!due) return null;
  const n = dayDiff(today, due);
  const date = fmtShort(due);
  if (n < 0) return { tone: "past", label: `${date} · ${-n}d late`, days: n };
  if (n === 0) return { tone: "today", label: "Due today", days: 0 };
  if (n <= 4) return { tone: "soon", label: `${date} · ${n}d`, days: n };
  return { tone: "plain", label: date, days: n };
}

/** Tasks that belong on the board: not in an archived section. */
export function liveTasks(state: Pick<PlannerState, "tasks" | "sections">): Task[] {
  const archived = new Set(state.sections.filter((s) => s.archived).map((s) => s.id));
  return state.tasks.filter((t) => !archived.has(t.sectionId));
}

export interface SlippedItem {
  kind: "task" | "event";
  id: string;
  title: string;
  note: string | null;
  date: string;
  daysLate: number;
  group: string;
}

export function sectionShortName(s: Section | undefined): string {
  return s ? s.name : "Unsorted";
}

/** Every open event whose date has passed and every open task whose due date has passed. */
export function slippedItems(state: PlannerState, today: string): SlippedItem[] {
  const out: SlippedItem[] = [];
  const byId = new Map(state.sections.map((s) => [s.id, s]));
  for (const e of state.events) {
    if (e.completedAt) continue;
    const late = dayDiff(e.date, today);
    if (late > 0) {
      out.push({ kind: "event", id: e.id, title: e.title, note: e.note, date: e.date, daysLate: late, group: e.category });
    }
  }
  for (const t of liveTasks(state)) {
    if (t.completedAt || !t.due) continue;
    const late = dayDiff(t.due, today);
    if (late > 0) {
      out.push({
        kind: "task",
        id: t.id,
        title: t.title,
        note: t.note,
        date: t.due,
        daysLate: late,
        group: sectionShortName(byId.get(t.sectionId)),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function openEventsOn(events: CalEvent[], date: string): CalEvent[] {
  return events.filter((e) => e.date === date && !e.completedAt);
}

export interface Counters {
  slipped: number;
  today: number;
  due7: number;
  open: number;
}

export function counters(state: PlannerState, today: string): Counters {
  const tasks = liveTasks(state).filter((t) => !t.completedAt);
  return {
    slipped: slippedItems(state, today).length,
    today: openEventsOn(state.events, today).length,
    due7: tasks.filter((t) => {
      if (!t.due) return false;
      const n = dayDiff(today, t.due);
      return n >= 0 && n <= 7;
    }).length,
    open: tasks.length,
  };
}

/** The next `limit` open tasks with a due date of today or later, soonest first. */
export function dueNext(state: PlannerState, today: string, limit = 8): Task[] {
  return liveTasks(state)
    .filter((t) => !t.completedAt && t.due && t.due >= today)
    .sort(
      (a, b) =>
        a.due!.localeCompare(b.due!) ||
        (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") ||
        (a.priority ?? 9) - (b.priority ?? 9) ||
        a.order - b.order,
    )
    .slice(0, limit);
}

export type FocusMode = "today" | "tomorrow" | "lastNight";

export interface VisibleFocus {
  list: FocusList;
  mode: FocusMode;
}

/**
 * Today's list shows as "Today's focus", tomorrow's as "Tomorrow's focus", and
 * yesterday's stays up as "Still open from last night" while anything in it is
 * unchecked. Anything older is hidden. Order: last night, today, tomorrow.
 */
export function visibleFocus(lists: FocusList[], today: string): VisibleFocus[] {
  const out: VisibleFocus[] = [];
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const y = lists.find((l) => l.date === yesterday);
  if (y && y.items.some((i) => !i.completedAt)) out.push({ list: y, mode: "lastNight" });
  const t = lists.find((l) => l.date === today);
  if (t) out.push({ list: t, mode: "today" });
  const tm = lists.find((l) => l.date === tomorrow);
  if (tm) out.push({ list: tm, mode: "tomorrow" });
  return out;
}

export function focusTitle(v: VisibleFocus): string {
  if (v.mode === "lastNight") return "Still open from last night";
  if (v.mode === "tomorrow") return "Tomorrow's focus";
  return v.list.label ? `${v.list.label}` : "Today's focus";
}

/** Count of completed things the "Show completed" toggle would reveal. */
export function completedCount(state: PlannerState): number {
  return (
    liveTasks(state).filter((t) => t.completedAt).length +
    state.events.filter((e) => e.completedAt).length +
    state.focusLists.reduce((n, l) => n + l.items.filter((i) => i.completedAt).length, 0)
  );
}

import { fmtTime, fromMinutes, toMinutes, weekdayOf } from "./dates";
import type { BlockSkip, CalEvent, DayOff, PlannerState, RecurringBlock } from "./types";

type ScheduleData = Pick<PlannerState, "blocks" | "daysOff" | "skips">;

export function dayOffOn(date: string, daysOff: DayOff[]): DayOff | undefined {
  return daysOff.find((d) => d.date === date);
}

function isSkipped(block: RecurringBlock, date: string, skips: BlockSkip[]): boolean {
  return skips.some(
    (s) =>
      s.date === date &&
      ((s.blockId != null && s.blockId === block.id) ||
        (s.blockName != null && s.blockName.toLowerCase() === block.name.toLowerCase())),
  );
}

/** Recurring blocks that actually meet on `date`, after days off and skips. */
export function blocksOn(date: string, data: ScheduleData): RecurringBlock[] {
  const wd = weekdayOf(date);
  const off = !!dayOffOn(date, data.daysOff);
  return data.blocks
    .filter((b) => {
      if (b.weekday !== wd) return false;
      if (b.activeFrom && date < b.activeFrom) return false;
      if (b.activeUntil && date > b.activeUntil) return false;
      if (off && !b.survivesDaysOff) return false;
      if (isSkipped(b, date, data.skips)) return false;
      return true;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Blocks on `date` hidden only because of a skip (so the UI can offer to restore them). */
export function skippedBlocksOn(date: string, data: ScheduleData): { block: RecurringBlock; skip: BlockSkip }[] {
  const wd = weekdayOf(date);
  const out: { block: RecurringBlock; skip: BlockSkip }[] = [];
  for (const b of data.blocks) {
    if (b.weekday !== wd) continue;
    const skip = data.skips.find(
      (s) =>
        s.date === date &&
        ((s.blockId != null && s.blockId === b.id) ||
          (s.blockName != null && s.blockName.toLowerCase() === b.name.toLowerCase())),
    );
    if (skip) out.push({ block: b, skip });
  }
  return out;
}

export function eventsOn(date: string, events: CalEvent[], includeDone: boolean): CalEvent[] {
  return events
    .filter((e) => e.date === date && (includeDone || !e.completedAt))
    .sort((a, b) => (a.start ?? "99").localeCompare(b.start ?? "99"));
}

export interface TimedItem {
  key: string;
  type: "block" | "event";
  id: string;
  title: string;
  kind: string;
  s0: number;
  e0: number;
  done: boolean;
  col?: number;
  cols?: number;
}

/** Event span in minutes; a missing or non-positive end defaults to one hour. */
export function eventSpan(e: Pick<CalEvent, "start" | "end">): [number, number] | null {
  if (!e.start) return null;
  const s0 = toMinutes(e.start);
  let e0 = e.end ? toMinutes(e.end) : s0 + 60;
  if (e0 <= s0) e0 = s0 + 60;
  return [s0, e0];
}

export function timedItemsOn(
  date: string,
  state: ScheduleData & { events: CalEvent[] },
  includeDone: boolean,
): TimedItem[] {
  const items: TimedItem[] = [];
  for (const b of blocksOn(date, state)) {
    items.push({
      key: `b:${b.id}`,
      type: "block",
      id: b.id,
      title: b.name,
      kind: b.kind,
      s0: toMinutes(b.start),
      e0: toMinutes(b.end),
      done: false,
    });
  }
  for (const e of eventsOn(date, state.events, includeDone)) {
    const span = eventSpan(e);
    if (!span) continue;
    items.push({
      key: `e:${e.id}`,
      type: "event",
      id: e.id,
      title: e.title,
      kind: e.category,
      s0: span[0],
      e0: span[1],
      done: !!e.completedAt,
    });
  }
  return items.sort((a, b) => a.s0 - b.s0 || b.e0 - a.e0);
}

export interface Clash {
  a: TimedItem;
  b: TimedItem;
  text: string;
}

function span(i: TimedItem): string {
  return `${fmtTime(fromMinutes(i.s0))}–${fmtTime(fromMinutes(i.e0))}`;
}

/** Every pair of timed items whose intervals overlap. Touching ends do not count. */
export function detectClashes(items: TimedItem[]): Clash[] {
  const live = items.filter((i) => !i.done).slice().sort((a, b) => a.s0 - b.s0 || a.e0 - b.e0);
  const out: Clash[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (b.s0 >= a.e0) break;
      out.push({ a, b, text: `${a.title} (${span(a)}) overlaps ${b.title} (${span(b)})` });
    }
  }
  return out;
}

export function clashesOn(date: string, state: ScheduleData & { events: CalEvent[] }): Clash[] {
  return detectClashes(timedItemsOn(date, state, false));
}

/**
 * Group transitively-overlapping items, then give each a column inside its group
 * (ported from the reference page). Items must be sorted by start. Mutates col/cols.
 */
export function layoutColumns<T extends { s0: number; e0: number; col?: number; cols?: number }>(items: T[]): T[] {
  const groups: T[][] = [];
  let cur: T[] = [];
  let curEnd = -1;
  for (const it of items) {
    if (cur.length && it.s0 >= curEnd) {
      groups.push(cur);
      cur = [];
      curEnd = -1;
    }
    cur.push(it);
    curEnd = Math.max(curEnd, it.e0);
  }
  if (cur.length) groups.push(cur);
  for (const g of groups) {
    const colEnds: number[] = [];
    for (const it of g) {
      let c = 0;
      while (c < colEnds.length && colEnds[c] > it.s0) c++;
      colEnds[c] = it.e0;
      it.col = c;
    }
    for (const it of g) it.cols = colEnds.length;
  }
  return items;
}

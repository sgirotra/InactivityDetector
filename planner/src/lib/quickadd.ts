import { addDays, dayDiff, DOW, easternClock, fmtDay, fmtTime, makeISO, weekdayOf } from "./dates";
import { matchSection, recase, similarity } from "./match";
import type { CalEvent, FocusList, RecurringBlock, Section, Task } from "./types";

// Turns short phrases like "3030 homework due fri" or "focus tomorrow: gym, math"
// into a preview object. Nothing is saved here; the UI shows the preview, lets the
// user fix it, and then commits it.

export interface QuickContext {
  now: Date;
  sections: Section[];
  blocks: RecurringBlock[];
  tasks?: Task[];
  events?: CalEvent[];
  focusLists?: FocusList[];
}

export type QuickPreview =
  | {
      kind: "task";
      title: string;
      sectionId: string | null;
      newSection: { name: string; area: string } | null;
      due: string | null;
      dueTime: string | null;
      priority: number | null;
    }
  | {
      kind: "event";
      title: string;
      date: string;
      start: string | null;
      end: string | null;
      endAssumed: boolean;
      category: string;
    }
  | { kind: "daysOff"; dates: string[]; label: string }
  | { kind: "focus"; date: string; items: string[] }
  | { kind: "skip"; date: string; blockId: string; blockName: string }
  | { kind: "complete"; query: string; candidates: { type: "task" | "event" | "focus"; id: string; title: string; detail: string }[] };

export interface QuickResult {
  preview: QuickPreview | null;
  /** human notes shown under the preview, e.g. how "tomorrow" was resolved after midnight */
  notes: string[];
  error?: string;
}

// ---------------------------------------------------------------- dates

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

const MONTH_RE = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const WEEKDAY_RE = "sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?";

export interface DateBase {
  /** Eastern calendar date right now */
  today: string;
  /** true between midnight and 4am Eastern */
  lateNight: boolean;
}

export function dateBase(now: Date): DateBase {
  const c = easternClock(now);
  return { today: c.date, lateNight: c.hour < 4 };
}

interface DateHit {
  start: number;
  end: number;
  date: string;
  /** set when "tomorrow" was resolved with the after-midnight rule */
  lateNightTomorrow?: boolean;
}

/** Explicit month/day: this year, unless that lands more than ~2 months back (then next year). */
function inferYear(base: DateBase, m: number, d: number, y?: number): string | null {
  if (y != null) return makeISO(y < 100 ? 2000 + y : y, m, d);
  const year = Number(base.today.slice(0, 4));
  const iso = makeISO(year, m, d);
  if (!iso) return null;
  return dayDiff(iso, base.today) > 60 ? makeISO(year + 1, m, d) : iso;
}

/** The coming `wd` after `today` (or today itself when allowed). */
function upcoming(today: string, wd: number, allowToday: boolean): string {
  let n = (wd - weekdayOf(today) + 7) % 7;
  if (n === 0 && !allowToday) n = 7;
  return addDays(today, n);
}

function mondayIndex(wd: number): number {
  return (wd + 6) % 7;
}

/**
 * Plain weekday ("fri") = the next one after today. "this fri" = the coming one,
 * today included. "next fri" = the one in next Mon–Sun week.
 */
export function resolveWeekday(today: string, wd: number, mod: "this" | "next" | null): string {
  if (mod === "this") return upcoming(today, wd, true);
  if (mod === "next") {
    const thisWeekMonday = addDays(today, -mondayIndex(weekdayOf(today)));
    return addDays(thisWeekMonday, 7 + mondayIndex(wd));
  }
  return upcoming(today, wd, false);
}

export function findDates(text: string, base: DateBase): DateHit[] {
  const hits: DateHit[] = [];
  const taken: [number, number][] = [];
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && a < e);
  const push = (s: number, e: number, date: string | null, extra: Partial<DateHit> = {}) => {
    if (!date || !free(s, e)) return;
    taken.push([s, e]);
    hits.push({ start: s, end: e, date, ...extra });
  };
  const scan = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) fn(m);
  };

  scan(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => push(m.index, m.index + m[0].length, makeISO(+m[1], +m[2], +m[3])));
  scan(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (m) =>
    push(m.index, m.index + m[0].length, inferYear(base, +m[1], +m[2], m[3] ? +m[3] : undefined)),
  );
  scan(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi"), (m) =>
    push(m.index, m.index + m[0].length, inferYear(base, MONTHS[m[1].toLowerCase()], +m[2], m[3] ? +m[3] : undefined)),
  );
  scan(/\b(today|tonight|tomorrow|tmrw|tmr|2morrow)\b/gi, (m) => {
    const w = m[1].toLowerCase();
    if (w === "today" || w === "tonight") return push(m.index, m.index + m[0].length, base.today);
    // after midnight, "tomorrow" means the calendar day that just started
    if (base.lateNight) return push(m.index, m.index + m[0].length, base.today, { lateNightTomorrow: true });
    push(m.index, m.index + m[0].length, addDays(base.today, 1));
  });
  scan(/\bin\s+(\d+|an?|one|two|three|four|five)\s+(days?|weeks?)\b/gi, (m) => {
    const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
    push(m.index, m.index + m[0].length, addDays(base.today, m[2].toLowerCase().startsWith("week") ? n * 7 : n));
  });
  scan(/\bnext\s+week\b/gi, (m) => push(m.index, m.index + m[0].length, resolveWeekday(base.today, 1, "next")));
  scan(new RegExp(`\\b(?:(this|next|on)\\s+)?(${WEEKDAY_RE})\\b`, "gi"), (m) => {
    const mod = m[1]?.toLowerCase();
    const wd = WEEKDAYS[m[2].toLowerCase()];
    push(m.index, m.index + m[0].length, resolveWeekday(base.today, wd, mod === "this" || mod === "next" ? mod : null));
  });
  return hits.sort((a, b) => a.start - b.start);
}

/** All dates named in `text`, expanding ranges like "mon-wed" or "10/5 through 10/7". */
export function datesInText(text: string, base: DateBase): string[] {
  const hits = findDates(text, base);
  const out: string[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const next = hits[i + 1];
    if (next && /^\s*(?:-|–|to|through|thru|until)\s*$/i.test(text.slice(h.end, next.start))) {
      let end = next.date;
      if (end < h.date) end = addDays(end, 7);
      for (let d = h.date; d <= end && out.length < 60; d = addDays(d, 1)) out.push(d);
      i++;
      continue;
    }
    out.push(h.date);
  }
  return [...new Set(out)].sort();
}

// ---------------------------------------------------------------- times

interface TimeHit {
  start: number;
  end: number;
  from: string;
  to: string | null;
}

type Mer = "a" | "p" | null;

function mer(s: string | undefined): Mer {
  if (!s) return null;
  return s.toLowerCase().startsWith("a") ? "a" : "p";
}

function to24(h: number, m: number, md: Mer): number {
  if (md === "a") return (h % 12) * 60 + m;
  if (md === "p") return ((h % 12) + 12) * 60 + m;
  return h * 60 + m;
}

/** Bare hour with no am/pm: 1–7 is evening, 8–11 morning, 12 noon, 13+ is 24h. */
function guess(h: number, m: number): number {
  if (h >= 13 || h === 0) return h * 60 + m;
  if (h === 12) return 12 * 60 + m;
  if (h <= 7) return (h + 12) * 60 + m;
  return h * 60 + m;
}

function hhmm(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

const T = "(\\d{1,2})(?::(\\d{2}))?";
const MER = "(?:\\s*(am|pm|a\\.m\\.|p\\.m\\.)|(a|p)(?![a-z]))";

export function findTimes(text: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const taken: [number, number][] = [];
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && a < e);
  let m: RegExpExecArray | null;

  const range = new RegExp(
    `(?:\\b(?:from|at)\\s+|@\\s*)?\\b${T}${MER}?\\s*(?:-|–|to|until|till)\\s*${T}${MER}?(?![\\w/])`,
    "gi",
  );
  while ((m = range.exec(text))) {
    const [, h1, m1, ma1, mb1, h2, m2, ma2, mb2] = m;
    const md1 = mer(ma1 ?? mb1);
    const md2 = mer(ma2 ?? mb2);
    const strong = m1 || m2 || md1 || md2 || /^(from|at|@)/i.test(m[0]);
    if (!strong) continue;
    const H1 = +h1, M1 = m1 ? +m1 : 0, H2 = +h2, M2 = m2 ? +m2 : 0;
    if (H1 > 23 || H2 > 23 || M1 > 59 || M2 > 59) continue;
    let s: number, e: number;
    if (md1 || md2) {
      const endMer = md2 ?? md1;
      // "11-1pm": the start is morning if its clock hour sits after the end's
      const startMer = md1 ?? (endMer === "p" && H1 % 12 > H2 % 12 ? "a" : endMer);
      s = to24(H1, M1, startMer);
      e = to24(H2, M2, endMer);
    } else {
      s = guess(H1, M1);
      e = to24(H2, M2, null);
      if (H2 <= 12 && s >= 12 * 60 && H2 !== 12) e += 12 * 60;
    }
    if (e <= s) e += 12 * 60;
    if (e > 24 * 60) e = 24 * 60 - 1;
    const end = m.index + m[0].length;
    taken.push([m.index, end]);
    hits.push({ start: m.index, end, from: hhmm(s), to: hhmm(e) });
  }

  const single = new RegExp(`(?:\\b(at)\\s+|(@)\\s*)?\\b${T}${MER}?(?![\\w/:])`, "gi");
  while ((m = single.exec(text))) {
    const [, at, atSign, h, mm, ma, mb] = m;
    const md = mer(ma ?? mb);
    if (!(mm || md || at || atSign)) continue;
    const H = +h, M = mm ? +mm : 0;
    if (H > 23 || M > 59 || (md && H > 12)) continue;
    const end = m.index + m[0].length;
    if (!free(m.index, end)) continue;
    taken.push([m.index, end]);
    hits.push({ start: m.index, end, from: hhmm(md ? to24(H, M, md) : guess(H, M)), to: null });
  }

  const words = /\b(?:at\s+)?(noon|midnight)\b/gi;
  while ((m = words.exec(text))) {
    const end = m.index + m[0].length;
    if (!free(m.index, end)) continue;
    taken.push([m.index, end]);
    hits.push({ start: m.index, end, from: m[1].toLowerCase() === "noon" ? "12:00" : "00:00", to: null });
  }
  return hits.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------- helpers

function cut(text: string, spans: { start: number; end: number }[]): string {
  let out = "";
  let pos = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    if (s.start < pos) continue;
    out += text.slice(pos, s.start) + " ";
    pos = s.end;
  }
  return out + text.slice(pos);
}

function tidy(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  // drop connectors left dangling by removed date/time words
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\s+(?:at|on|by|from|due|for|this|next|until|till|to|@|-|–|,)$/i, "")
      .replace(/^(?:at|on|by|from|due|@|-|–|,)\s+/i, "")
      .trim();
  }
  return t.replace(/\s+([,.])/g, "$1");
}

function capFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const EVENT_WORDS =
  /\b(meeting|mtg|call|interview|exam|test|midterm|final|quiz|chat|coffee|1:1|1-1|session|event|dinner|lunch|breakfast|appointment|appt|presentation|workshop|superday|kickoff|office hours|info session|run-through|case)\b/i;
const EXAM_WORDS = /\b(exam|test|midterm|final|quiz)\b/i;

function categoryFor(title: string, ctx: QuickContext): string {
  if (EXAM_WORDS.test(title)) return "Exam";
  const m = matchSection(title, ctx.sections, ctx.blocks);
  if (m?.section) return m.section.name.split("·")[0].trim();
  if (m?.suggest) return m.suggest.name;
  return "";
}

function lateNightNote(hits: DateHit[], base: DateBase, now: Date): string[] {
  if (!hits.some((h) => h.lateNightTomorrow)) return [];
  const c = easternClock(now);
  return [
    `It's ${fmtTime(hhmm(c.minutes))} ET, so “tomorrow” means ${fmtDay(base.today)}, the day that just started.`,
  ];
}

function splitList(s: string): string[] {
  const parts = /[,;\n]/.test(s) ? s.split(/\s*[,;\n]\s*/) : s.split(/\s+(?:and|&|\+)\s+/i);
  return parts.map((p) => capFirst(p.replace(/^(?:and|&)\s+/i, "").trim())).filter(Boolean);
}

// ---------------------------------------------------------------- parse

export function parseQuickAdd(raw: string, ctx: QuickContext): QuickResult {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { preview: null, notes: [] };
  const base = dateBase(ctx.now);

  // focus lists: "focus tomorrow: gym, math" / "tomorrow's focus is gym, math"
  const f1 = text.match(/^(today|tonight|tomorrow|tmrw|tmr)(?:['’]?s)?\s+focus\s*(?:is|are|=|:|-)?\s*(.*)$/i);
  const f2 = text.match(/^focus\s*(?:for\s+|on\s+)?([^:]*?)\s*(?::|=|\bis\b)\s*(.*)$/i);
  if (f1 || f2) {
    const when = (f1 ? f1[1] : f2![1]).trim();
    const body = (f1 ? f1[2] : f2![2]).trim();
    const hits = when ? findDates(when, base) : [];
    if (when && !hits.length) return { preview: null, notes: [], error: `Couldn't read the date “${when}”.` };
    const date = hits.length ? hits[0].date : base.today;
    const items = splitList(body);
    if (!items.length) return { preview: null, notes: [], error: "List the focus items after the colon." };
    const notes = lateNightNote(hits, base, ctx.now);
    const existing = ctx.focusLists?.find((l) => l.date === date);
    if (existing?.items.length) notes.push(`Adds to the ${existing.items.length} item(s) already on that list.`);
    return { preview: { kind: "focus", date, items }, notes };
  }

  // completions: "finished the 10/13 GPS", "done 3030 homework"
  const done = text.match(/^(?:done(?:\s+with)?|finished|finish|did|completed?|checked off|check off|x)\s*:?\s+(.+)$/i);
  if (done) {
    const query = done[1];
    const pool: { type: "task" | "event" | "focus"; id: string; title: string; detail: string; hay: string }[] = [];
    const secName = new Map(ctx.sections.map((s) => [s.id, s.name]));
    for (const t of ctx.tasks ?? []) {
      if (!t.completedAt) pool.push({ type: "task", id: t.id, title: t.title, detail: secName.get(t.sectionId) ?? "", hay: `${t.title} ${t.note ?? ""}` });
    }
    for (const e of ctx.events ?? []) {
      if (!e.completedAt) pool.push({ type: "event", id: e.id, title: e.title, detail: fmtDay(e.date), hay: `${e.title} ${e.category}` });
    }
    for (const l of ctx.focusLists ?? []) {
      for (const i of l.items) {
        if (!i.completedAt) pool.push({ type: "focus", id: i.id, title: i.title, detail: `Focus · ${fmtDay(l.date)}`, hay: `${i.title} ${i.note ?? ""}` });
      }
    }
    const ranked = pool
      .map((p) => ({ p, s: similarity(query, p.hay) + similarity(query, p.title) * 0.25 }))
      .filter((x) => x.s >= 0.34)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map(({ p }) => ({ type: p.type, id: p.id, title: p.title, detail: p.detail }));
    if (!ranked.length) return { preview: null, notes: [], error: `Nothing open matches “${query}”.` };
    return { preview: { kind: "complete", query, candidates: ranked }, notes: [] };
  }

  // days off: "no school mon and tue", "day off 11/25"
  const off = text.match(/^(no\s+school|no\s+class(?:es)?|days?\s+off|off)\b\s*(?:on\s+)?(.*)$/i);
  if (off) {
    const dates = datesInText(off[2], base);
    if (!dates.length) return { preview: null, notes: [], error: "Which day(s)? e.g. “no school mon and tue”." };
    const word = off[1].toLowerCase();
    const label = word.startsWith("no school") ? "No school" : word.startsWith("no class") ? "No classes" : "Day off";
    return { preview: { kind: "daysOff", dates, label }, notes: lateNightNote(findDates(off[2], base), base, ctx.now) };
  }

  // one-off skips: "skip home depot fri", "cancel ucc mon"
  const skip = text.match(/^(?:skip|cancel(?:led)?|no)\s+(.+)$/i);
  if (skip) {
    const hits = findDates(skip[1], base);
    const name = tidy(cut(skip[1], hits));
    if (hits.length && name) {
      const date = hits[0].date;
      const wd = weekdayOf(date);
      const candidates = ctx.blocks.filter((b) => b.weekday === wd);
      const best = candidates
        .map((b) => ({ b, s: similarity(name, b.name) + similarity(name, b.kind) * 0.5 }))
        .sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.5) {
        return {
          preview: { kind: "skip", date, blockId: best.b.id, blockName: best.b.name },
          notes: lateNightNote(hits, base, ctx.now),
        };
      }
      if (/^skip|^cancel/i.test(text)) {
        return { preview: null, notes: [], error: `No weekly block called “${name}” meets on ${DOW[wd]}.` };
      }
    }
  }

  // tasks and events
  let body = text.replace(/^(?:add|todo|task|event)\s*:?\s+/i, "");
  let priority: number | null = null;
  // trailing "!" (or "!!") marks it high priority; "p1".."p3" sets it explicitly
  const pr = body.match(/(?:^|\s)(?:!+|p([123]))$/i);
  if (pr) {
    priority = pr[1] ? Number(pr[1]) : 1;
    body = body.slice(0, pr.index).trim();
  }

  const dueMatch = body.match(/\bdue\b/i);
  const dateHits = findDates(body, base);
  const timeHits = findTimes(body);
  // times can't sit inside a date ("10/13" is not 10 o'clock)
  const times = timeHits.filter((t) => !dateHits.some((d) => t.start < d.end && d.start < t.end));
  const notes = lateNightNote(dateHits, base, ctx.now);
  const rest = tidy(cut(body, [...dateHits, ...times, ...(dueMatch ? [{ start: dueMatch.index!, end: dueMatch.index! + 3 }] : [])]));

  const isEvent = !dueMatch && (times.length > 0 || (dateHits.length > 0 && EVENT_WORDS.test(rest)));

  if (isEvent) {
    if (!rest) return { preview: null, notes, error: "What's the event called?" };
    const date = dateHits[0]?.date ?? base.today;
    if (!dateHits.length) notes.push(`No date given, so it goes on today (${fmtDay(date)}).`);
    const t = times[0];
    const start = t?.from ?? null;
    let end = t?.to ?? (times[1] ? times[1].from : null);
    let endAssumed = false;
    if (start && !end) {
      const [h, m] = start.split(":").map(Number);
      end = hhmm(Math.min(h * 60 + m + 60, 24 * 60 - 1));
      endAssumed = true;
      notes.push("End time assumed (1 hour).");
    }
    const m = matchSection(rest, ctx.sections, ctx.blocks);
    const title = capFirst(recase(rest, m));
    return {
      preview: { kind: "event", title, date, start, end, endAssumed, category: categoryFor(rest, ctx) },
      notes,
    };
  }

  if (!rest) return { preview: null, notes, error: "What's the task?" };
  const m = matchSection(rest, ctx.sections, ctx.blocks);
  const title = capFirst(recase(rest, m));
  if (!m) notes.push("No section matched. Pick one below.");
  return {
    preview: {
      kind: "task",
      title,
      sectionId: m?.section?.id ?? null,
      newSection: m?.section ? null : (m?.suggest ?? null),
      due: dateHits[0]?.date ?? null,
      dueTime: times[0]?.from ?? null,
      priority,
    },
    notes,
  };
}

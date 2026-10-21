import { describe, expect, it } from "vitest";
import { matchSection } from "@/lib/match";
import { datesInText, findTimes, parseQuickAdd, resolveWeekday, type QuickContext } from "@/lib/quickadd";
import { edt, est, seededWithAliases, seedState } from "./fixtures";

// Wednesday Oct 21 2026, midday Eastern
const NOON = edt("2026-10-21", "12:00");

function ctx(now: Date = NOON, state = seededWithAliases()): QuickContext {
  return { now, ...state };
}

function parse(text: string, now: Date = NOON) {
  return parseQuickAdd(text, ctx(now));
}

describe("section matching", () => {
  const s = seededWithAliases();
  const id = (q: string) => matchSection(q, s.sections, s.blocks)?.section?.id ?? null;

  it.each([
    ["3030 homework", "isye-3030"],
    ["phys problem set", "phys-2211"],
    ["physics reading", "phys-2211"],
    ["math worksheet", "math-2603-discrete"],
    ["startup lab report", "startup-lab-cs-2701"],
    ["ucc deck", "ucc"],
    ["home depot slides", "product-gt"],
    ["product roadmap", "product-gt"],
    ["ic pitch", "investments-committee"],
  ])("%s -> %s", (q, expected) => {
    expect(id(q)).toBe(expected);
  });

  it("works from section names alone, without aliases", () => {
    const bare = seedState();
    const m = (q: string) => matchSection(q, bare.sections, bare.blocks)?.section?.id ?? null;
    expect(m("3030 homework")).toBe("isye-3030");
    expect(m("phys hw")).toBe("phys-2211");
    expect(m("startup lab")).toBe("startup-lab-cs-2701");
    expect(m("home depot sync")).toBe("product-gt");
    expect(m("product sync")).toBe("product-gt");
  });

  it("suggests a new section for a block that has none (VIP)", () => {
    const m = matchSection("vip presentation", s.sections, s.blocks);
    expect(m?.section).toBeNull();
    expect(m?.suggest).toEqual({ name: "VIP", area: "Coursework" });
  });

  it("returns null when nothing matches", () => {
    expect(matchSection("buy groceries", s.sections, s.blocks)).toBeNull();
  });
});

describe("relative dates", () => {
  const base = { today: "2026-10-21", lateNight: false };

  it("plain weekday is the next one after today", () => {
    expect(resolveWeekday("2026-10-21", 5, null)).toBe("2026-10-23");
    expect(resolveWeekday("2026-10-21", 3, null)).toBe("2026-10-28");
    expect(resolveWeekday("2026-10-21", 1, null)).toBe("2026-10-26");
  });

  it("this/next weekday", () => {
    expect(resolveWeekday("2026-10-21", 3, "this")).toBe("2026-10-21");
    expect(resolveWeekday("2026-10-21", 2, "next")).toBe("2026-10-27");
    // on a Monday, "next fri" is the Friday of next week, not this one
    expect(resolveWeekday("2026-10-19", 5, "next")).toBe("2026-10-30");
    // on a Sunday, next week starts tomorrow
    expect(resolveWeekday("2026-10-25", 1, "next")).toBe("2026-10-26");
  });

  it("reads numeric, month-name, and range dates", () => {
    expect(datesInText("10/30", base)).toEqual(["2026-10-30"]);
    expect(datesInText("nov 3", base)).toEqual(["2026-11-03"]);
    expect(datesInText("December 15th", base)).toEqual(["2026-12-15"]);
    expect(datesInText("1/12", base)).toEqual(["2027-01-12"]);
    expect(datesInText("10/5", base)).toEqual(["2026-10-05"]);
    expect(datesInText("mon-wed", base)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(datesInText("11/25 through 11/27", base)).toEqual(["2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(datesInText("in 2 weeks", base)).toEqual(["2026-11-04"]);
  });
});

describe("times", () => {
  const t = (s: string) => findTimes(s).map((h) => [h.from, h.to]);
  it.each([
    ["6:30-7:30pm", [["18:30", "19:30"]]],
    ["6-7pm", [["18:00", "19:00"]]],
    ["11-1pm", [["11:00", "13:00"]]],
    ["11:30-12:30pm", [["11:30", "12:30"]]],
    ["9:30-10:45", [["09:30", "10:45"]]],
    ["12:30-3:15", [["12:30", "15:15"]]],
    ["at 7", [["19:00", null]]],
    ["6:30", [["18:30", null]]],
    ["9am", [["09:00", null]]],
    ["10:15", [["10:15", null]]],
    ["18:30", [["18:30", null]]],
    ["noon", [["12:00", null]]],
  ])("%s", (s, expected) => {
    expect(t(s)).toEqual(expected);
  });

  it("ignores bare numbers and course codes", () => {
    expect(t("3030 homework")).toEqual([]);
    expect(t("read ch 2-3")).toEqual([]);
  });
});

describe("quick-add: the four examples", () => {
  it("3030 homework due fri -> task in ISYE 3030 due this Friday", () => {
    const r = parse("3030 homework due fri");
    expect(r.preview).toEqual({
      kind: "task",
      title: "3030 homework",
      sectionId: "isye-3030",
      newSection: null,
      due: "2026-10-23",
      dueTime: null,
      priority: null,
    });
  });

  it("home depot meeting tue 6:30-7:30pm -> event", () => {
    const r = parse("home depot meeting tue 6:30-7:30pm");
    expect(r.preview).toEqual({
      kind: "event",
      title: "Home Depot meeting",
      date: "2026-10-27",
      start: "18:30",
      end: "19:30",
      endAssumed: false,
      category: "Product@GT",
    });
  });

  it("no school mon and tue -> two days off", () => {
    expect(parse("no school mon and tue").preview).toEqual({
      kind: "daysOff",
      dates: ["2026-10-26", "2026-10-27"],
      label: "No school",
    });
  });

  it("focus tomorrow: gym, math, kpmg prep -> focus list", () => {
    expect(parse("focus tomorrow: gym, math, kpmg prep").preview).toEqual({
      kind: "focus",
      date: "2026-10-22",
      items: ["Gym", "Math", "Kpmg prep"],
    });
  });
});

describe("quick-add: more phrasing", () => {
  it("home depot meeting 6:30 next tuesday", () => {
    const r = parse("home depot meeting 6:30 next tuesday");
    expect(r.preview).toMatchObject({ kind: "event", date: "2026-10-27", start: "18:30", end: "19:30", endAssumed: true });
    expect(r.notes).toContain("End time assumed (1 hour).");
  });

  it("tomorrow's focus is gym, math, KPMG prep", () => {
    expect(parse("tomorrow's focus is gym, math, KPMG prep").preview).toEqual({
      kind: "focus",
      date: "2026-10-22",
      items: ["Gym", "Math", "KPMG prep"],
    });
  });

  it("finished the 10/13 GPS -> completion search", () => {
    const state = seededWithAliases();
    state.tasks.push({
      id: "g1", sectionId: "isye-3030", title: "10/13 GPS", note: null, due: null, dueTime: null,
      priority: null, order: 9, completedAt: null, createdAt: "",
    });
    const r = parseQuickAdd("finished the 10/13 GPS", ctx(NOON, state));
    expect(r.preview?.kind).toBe("complete");
    if (r.preview?.kind === "complete") expect(r.preview.candidates[0].id).toBe("g1");
  });

  it("done 3030 homework finds the seeded task", () => {
    const r = parse("done 3030 homework");
    expect(r.preview?.kind === "complete" && r.preview.candidates[0].id).toBe("i6");
  });

  it("vip slides due thu suggests creating a VIP section", () => {
    expect(parse("vip slides due thu").preview).toMatchObject({
      kind: "task",
      title: "VIP slides",
      sectionId: null,
      newSection: { name: "VIP", area: "Coursework" },
      due: "2026-10-22",
    });
  });

  it("an unmatched task asks for a section", () => {
    const r = parse("buy a new charger");
    expect(r.preview).toMatchObject({ kind: "task", title: "Buy a new charger", sectionId: null, due: null });
    expect(r.notes).toContain("No section matched. Pick one below.");
  });

  it("phys test review due 10/25 5pm keeps the due time", () => {
    expect(parse("phys test review due 10/25 5pm").preview).toMatchObject({
      kind: "task", title: "PHYS test review", sectionId: "phys-2211", due: "2026-10-25", dueTime: "17:00",
    });
  });

  it("a dated meeting without a time is an all-day event", () => {
    expect(parse("ucc kickoff meeting fri").preview).toMatchObject({ kind: "event", date: "2026-10-23", start: null, end: null });
  });

  it("an exam gets the Exam category", () => {
    expect(parse("math quiz thu 3:30-4:45").preview).toMatchObject({ kind: "event", category: "Exam", start: "15:30", end: "16:45" });
  });

  it("skip home depot fri -> skip one occurrence", () => {
    const r = parse("skip home depot fri");
    expect(r.preview).toMatchObject({ kind: "skip", date: "2026-10-23", blockName: "Home Depot weekly" });
  });

  it("trailing ! marks high priority", () => {
    expect(parse("startup lab report due mon !").preview).toMatchObject({ kind: "task", priority: 1, due: "2026-10-26" });
  });

  it("returns an error for an empty title", () => {
    expect(parse("due fri").error).toBeTruthy();
  });
});

describe("quick-add across midnight in America/New_York", () => {
  it("at 11:50pm, tomorrow is the next calendar day", () => {
    const r = parse("focus tomorrow: gym", edt("2026-10-21", "23:50"));
    expect(r.preview).toMatchObject({ date: "2026-10-22" });
    expect(r.notes).toEqual([]);
  });

  it("at 12:30am, tomorrow is the day that just started, with a note", () => {
    const r = parse("focus tomorrow: gym", edt("2026-10-22", "00:30"));
    expect(r.preview).toMatchObject({ date: "2026-10-22" });
    expect(r.notes[0]).toMatch(/12:30a ET, so “tomorrow” means Thu, Oct 22/);
  });

  it("at 3:59am the late-night rule still applies; at 4:00am it does not", () => {
    expect(parse("gym tomorrow 6pm", edt("2026-10-22", "03:59")).preview).toMatchObject({ date: "2026-10-22" });
    expect(parse("gym tomorrow 6pm", edt("2026-10-22", "04:00")).preview).toMatchObject({ date: "2026-10-23" });
  });

  it("uses Eastern time even when UTC has already rolled over", () => {
    // 9pm ET Oct 21 = 01:00Z Oct 22: "tomorrow" must be Oct 22, not Oct 23
    const now = new Date("2026-10-22T01:00:00Z");
    expect(parse("3030 homework due tomorrow", now).preview).toMatchObject({ due: "2026-10-22" });
  });

  it("weekday names resolve from the Eastern date after midnight", () => {
    // 1am Thu Oct 22: "fri" is the next day
    expect(parse("3030 homework due fri", edt("2026-10-22", "01:00")).preview).toMatchObject({ due: "2026-10-23" });
  });

  it("handles the DST fall-back night", () => {
    // 1:30am EST on Nov 1 2026 (after clocks fall back)
    const r = parse("focus tomorrow: sleep", est("2026-11-01", "01:30"));
    expect(r.preview).toMatchObject({ date: "2026-11-01" });
  });
});

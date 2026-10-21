import { describe, expect, it } from "vitest";
import { completedCount, counters, dueChip, dueNext, slippedItems, visibleFocus } from "@/lib/board";
import type { FocusList } from "@/lib/types";
import { seedState } from "./fixtures";

const TODAY = "2026-10-21";

describe("due chips", () => {
  it("buckets overdue, today, soon and later", () => {
    expect(dueChip("2026-10-19", TODAY)).toEqual({ tone: "past", label: "Oct 19 · 2d late", days: -2 });
    expect(dueChip("2026-10-21", TODAY)).toEqual({ tone: "today", label: "Due today", days: 0 });
    expect(dueChip("2026-10-22", TODAY)).toMatchObject({ tone: "soon", label: "Oct 22 · 1d" });
    expect(dueChip("2026-10-25", TODAY)).toMatchObject({ tone: "soon", label: "Oct 25 · 4d" });
    expect(dueChip("2026-10-26", TODAY)).toMatchObject({ tone: "plain", label: "Oct 26" });
    expect(dueChip(null, TODAY)).toBeNull();
  });

  it("counts lateness across a month boundary", () => {
    expect(dueChip("2026-09-15", TODAY)).toMatchObject({ tone: "past", label: "Sep 15 · 36d late" });
  });
});

describe("slipped", () => {
  it("collects past open events and overdue open tasks from the seed", () => {
    const items = slippedItems(seedState(), TODAY);
    expect(items.map((i) => [i.id, i.daysLate])).toEqual([
      ["k7", 36],
      ["e1018a", 3],
      ["e1020b", 1],
    ]);
    expect(items[0]).toMatchObject({ kind: "task", group: "Investments Committee" });
    expect(items[1]).toMatchObject({ kind: "event", group: "ISYE 3030" });
  });

  it("drops completed items and items due today", () => {
    const s = seedState();
    s.events.find((e) => e.id === "e1018a")!.completedAt = "2026-10-21T10:00:00Z";
    s.tasks.find((t) => t.id === "k7")!.due = TODAY;
    expect(slippedItems(s, TODAY).map((i) => i.id)).toEqual(["e1020b"]);
  });

  it("keeps slipped items around indefinitely", () => {
    const items = slippedItems(seedState(), "2027-03-01");
    expect(items.find((i) => i.id === "k7")?.daysLate).toBe(167);
    expect(items.length).toBeGreaterThan(3);
  });

  it("ignores tasks in archived sections", () => {
    const s = seedState();
    s.sections.find((x) => x.id === "investments-committee")!.archived = true;
    expect(slippedItems(s, TODAY).map((i) => i.id)).not.toContain("k7");
  });
});

describe("counters and due next", () => {
  it("matches the seed on Oct 21", () => {
    const s = seedState();
    expect(counters(s, TODAY)).toEqual({ slipped: 3, today: 0, due7: 3, open: 39 });
  });

  it("lists dated open tasks soonest first", () => {
    expect(dueNext(seedState(), TODAY).map((t) => t.id)).toEqual(["i3", "i6", "p23", "i4"]);
  });

  it("counts completed things", () => {
    const s = seedState();
    s.tasks[0].completedAt = "2026-10-21T10:00:00Z";
    s.focusLists[0].items[0].completedAt = "2026-10-21T10:00:00Z";
    expect(completedCount(s)).toBe(2);
    expect(counters(s, TODAY).open).toBe(38);
  });
});

describe("focus visibility", () => {
  const list = (date: string, open: boolean): FocusList => ({
    date,
    label: null,
    items: [{ id: date, listDate: date, title: "x", note: null, linkedTaskId: null, order: 0, completedAt: open ? null : "2026-10-21T00:00:00Z" }],
  });

  it("shows today's list as today", () => {
    expect(visibleFocus([list("2026-10-21", true)], TODAY).map((v) => v.mode)).toEqual(["today"]);
  });

  it("shows tomorrow's list as tomorrow", () => {
    expect(visibleFocus([list("2026-10-22", true)], TODAY).map((v) => v.mode)).toEqual(["tomorrow"]);
  });

  it("keeps yesterday's list only while something is unchecked", () => {
    expect(visibleFocus([list("2026-10-20", true)], TODAY).map((v) => v.mode)).toEqual(["lastNight"]);
    expect(visibleFocus([list("2026-10-20", false)], TODAY)).toEqual([]);
  });

  it("hides anything older or further out", () => {
    expect(visibleFocus([list("2026-10-19", true), list("2026-10-23", true)], TODAY)).toEqual([]);
  });

  it("orders last night, today, tomorrow", () => {
    const lists = [list("2026-10-22", true), list("2026-10-21", true), list("2026-10-20", true)];
    expect(visibleFocus(lists, TODAY).map((v) => v.mode)).toEqual(["lastNight", "today", "tomorrow"]);
  });

  it("the seed's Oct 21 list becomes last night's list just after midnight", () => {
    expect(visibleFocus(seedState().focusLists, "2026-10-22").map((v) => v.mode)).toEqual(["lastNight"]);
  });
});

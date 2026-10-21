import { describe, expect, it } from "vitest";
import { blocksOn, clashesOn, detectClashes, layoutColumns, skippedBlocksOn, timedItemsOn, type TimedItem } from "@/lib/schedule";
import { seedState } from "./fixtures";

describe("blocks per day", () => {
  it("lists a normal Wednesday's blocks in order", () => {
    expect(blocksOn("2026-10-21", seedState()).map((b) => b.name)).toEqual([
      "PHYS 2211",
      "ISYE 3030",
      "MATH 2603",
      "Startup Lab",
      "VIP",
    ]);
  });

  it("hides academic blocks on a day off but keeps weekly club meetings", () => {
    // Oct 5 is a Monday and a seeded day off
    expect(blocksOn("2026-10-05", seedState()).map((b) => b.name)).toEqual(["UCC"]);
    // Oct 6 is a Tuesday and a seeded day off
    expect(blocksOn("2026-10-06", seedState()).map((b) => b.name)).toEqual(["Investments Committee"]);
  });

  it("drops just one occurrence for a skip", () => {
    const s = seedState();
    expect(blocksOn("2026-10-09", s).map((b) => b.name)).toEqual([]);
    expect(skippedBlocksOn("2026-10-09", s).map((x) => x.block.name)).toEqual(["Home Depot weekly"]);
    expect(blocksOn("2026-10-16", s).map((b) => b.name)).toEqual(["Home Depot weekly"]);
  });

  it("supports skips by block id", () => {
    const s = seedState();
    const vip = s.blocks.find((b) => b.name === "VIP")!;
    s.skips.push({ id: "x", date: "2026-10-21", blockId: vip.id, blockName: null });
    expect(blocksOn("2026-10-21", s).map((b) => b.name)).not.toContain("VIP");
    expect(blocksOn("2026-10-28", s).map((b) => b.name)).toContain("VIP");
  });

  it("respects activeFrom / activeUntil", () => {
    const s = seedState();
    const vip = s.blocks.find((b) => b.name === "VIP")!;
    vip.activeUntil = "2026-10-21";
    expect(blocksOn("2026-10-21", s).map((b) => b.name)).toContain("VIP");
    expect(blocksOn("2026-10-28", s).map((b) => b.name)).not.toContain("VIP");
    vip.activeFrom = "2026-10-22";
    expect(blocksOn("2026-10-21", s).map((b) => b.name)).not.toContain("VIP");
  });
});

describe("clash detection", () => {
  it("flags an event landing on a weekly block (Oct 20 Home Depot vs IC)", () => {
    const clashes = clashesOn("2026-10-20", seedState());
    expect(clashes).toHaveLength(1);
    expect(clashes[0].text).toBe(
      "Investments Committee (6:30p–7:30p) overlaps Home Depot meeting (6:30p–7:30p)",
    );
  });

  it("flags PHYS Test 2 running into UCC on Oct 26", () => {
    const clashes = clashesOn("2026-10-26", seedState());
    expect(clashes.map((c) => [c.a.title, c.b.title])).toEqual([["PHYS 2211 Test 2", "UCC"]]);
  });

  it("does not flag back-to-back items", () => {
    expect(clashesOn("2026-10-21", seedState())).toEqual([]);
  });

  it("drops the clash once the event is completed", () => {
    const s = seedState();
    s.events.find((e) => e.id === "e1020b")!.completedAt = "2026-10-21T00:00:00Z";
    expect(clashesOn("2026-10-20", s)).toEqual([]);
  });

  it("ignores blocks hidden by a day off", () => {
    const s = seedState();
    s.events.push({ id: "z", date: "2026-10-05", start: "09:30", end: "10:00", title: "Coffee", category: "", note: null, completedAt: null });
    expect(clashesOn("2026-10-05", s)).toEqual([]);
  });

  it("finds every overlapping pair", () => {
    const mk = (title: string, s0: number, e0: number): TimedItem => ({ key: title, type: "event", id: title, title, kind: "", s0, e0, done: false });
    const c = detectClashes([mk("A", 0, 100), mk("B", 50, 60), mk("C", 90, 120), mk("D", 120, 130)]);
    expect(c.map((x) => x.a.title + x.b.title)).toEqual(["AB", "AC"]);
  });

  it("defaults an event with no end to an hour", () => {
    const s = seedState();
    s.events.push({ id: "z", date: "2026-10-21", start: "15:00", end: null, title: "Chat", category: "", note: null, completedAt: null });
    const items = timedItemsOn("2026-10-21", s, false);
    expect(items.find((i) => i.id === "z")).toMatchObject({ s0: 900, e0: 960 });
    expect(clashesOn("2026-10-21", s).map((c) => c.b.title).sort()).toEqual(["Chat", "VIP"]);
  });
});

describe("layoutColumns", () => {
  it("puts overlapping items side by side and leaves others full width", () => {
    const items = [
      { s0: 0, e0: 60 },
      { s0: 30, e0: 90 },
      { s0: 45, e0: 50 },
      { s0: 120, e0: 180 },
    ] as { s0: number; e0: number; col?: number; cols?: number }[];
    layoutColumns(items);
    expect(items.map((i) => [i.col, i.cols])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [0, 1],
    ]);
  });

  it("reuses a freed column", () => {
    const items = [
      { s0: 0, e0: 60 },
      { s0: 30, e0: 90 },
      { s0: 60, e0: 80 },
    ] as { s0: number; e0: number; col?: number; cols?: number }[];
    layoutColumns(items);
    expect(items.map((i) => i.col)).toEqual([0, 1, 0]);
    expect(items.every((i) => i.cols === 2)).toBe(true);
  });
});

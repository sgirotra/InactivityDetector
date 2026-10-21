import { describe, expect, it } from "vitest";
import { addDays, dayDiff, easternClock, fmtTime, todayET, weekdayOf } from "@/lib/dates";
import { edt, est } from "./fixtures";

describe("Eastern clock", () => {
  it("uses the Eastern date, not UTC, in the evening", () => {
    // 10pm ET on Oct 21 is already Oct 22 in UTC
    const now = new Date("2026-10-22T02:00:00Z");
    expect(now.toISOString().slice(0, 10)).toBe("2026-10-22");
    expect(todayET(now)).toBe("2026-10-21");
    expect(easternClock(now).minutes).toBe(22 * 60);
  });

  it("rolls over at Eastern midnight", () => {
    expect(todayET(edt("2026-10-21", "23:59"))).toBe("2026-10-21");
    expect(todayET(edt("2026-10-22", "00:00"))).toBe("2026-10-22");
    expect(easternClock(edt("2026-10-22", "00:30")).hour).toBe(0);
  });

  it("handles the fall-back DST change (Nov 1 2026)", () => {
    // 11:30pm EST on Nov 1 is 04:30Z on Nov 2
    const now = est("2026-11-01", "23:30");
    expect(todayET(now)).toBe("2026-11-01");
    expect(easternClock(now).minutes).toBe(23 * 60 + 30);
    expect(todayET(new Date("2026-11-02T05:30:00Z"))).toBe("2026-11-02");
  });

  it("reports weekday from the Eastern date", () => {
    expect(easternClock(edt("2026-10-21")).weekday).toBe(3);
  });
});

describe("calendar math", () => {
  it("adds days across month and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("counts whole days", () => {
    expect(dayDiff("2026-10-21", "2026-10-26")).toBe(5);
    expect(dayDiff("2026-10-21", "2026-09-15")).toBe(-36);
    expect(dayDiff("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("knows weekdays and formats times", () => {
    expect(weekdayOf("2026-10-21")).toBe(3);
    expect(weekdayOf("2026-10-25")).toBe(0);
    expect(fmtTime("18:30")).toBe("6:30p");
    expect(fmtTime("09:00")).toBe("9a");
    expect(fmtTime("00:15")).toBe("12:15a");
    expect(fmtTime("12:00")).toBe("12p");
  });
});

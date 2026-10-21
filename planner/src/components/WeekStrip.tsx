"use client";

import { useEffect, useState } from "react";
import { addDays, DOW, fmtShort, MON, fmtTime, parseISOParts, weekdayOf } from "@/lib/dates";
import { blocksOn, clashesOn, dayOffOn, eventsOn } from "@/lib/schedule";
import { usePlanner } from "./store";

export function WeekStrip() {
  const { state, today, showDone, openEditor } = usePlanner();
  const [range, setRange] = useState<"week" | "month">("week");

  useEffect(() => {
    try {
      if (localStorage.getItem("planner.range") === "month") setRange("month");
    } catch {}
  }, []);
  const pick = (r: "week" | "month") => {
    setRange(r);
    try {
      localStorage.setItem("planner.range", r);
    } catch {}
  };

  const span = range === "month" ? 30 : 7;
  const end = addDays(today, span - 1);
  const days = Array.from({ length: span }, (_, k) => addDays(today, k));

  return (
    <section>
      <h2 className="sec">
        <span>{range === "month" ? `Next 30 days · through ${fmtShort(end)}` : "Next seven days"}</span>
        <span className="rangetabs">
          <button type="button" aria-pressed={range === "week"} onClick={() => pick("week")}>
            7 days
          </button>
          <button type="button" aria-pressed={range === "month"} onClick={() => pick("month")}>
            30 days
          </button>
        </span>
      </h2>
      <div
        className={
          range === "week"
            ? "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 lg:grid-cols-7"
            : "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5"
        }
      >
        {days.map((d, k) => {
          const wd = weekdayOf(d);
          const wknd = wd === 0 || wd === 6;
          const blocks = blocksOn(d, state);
          const events = eventsOn(d, state.events, showDone);
          const off = dayOffOn(d, state.daysOff);
          const clashes = clashesOn(d, state);
          const notes = state.clashNotes.filter((n) => n.date === d);
          const { d: dnum, m } = parseISOParts(d);
          return (
            <div key={d} className={`day${k === 0 ? " is-today" : ""}${wknd ? " wknd" : ""}`}>
              <button type="button" className="hd" onClick={() => openEditor({ kind: "day", date: d })} title="Open this day">
                <span className="dow">{DOW[wd]}</span>
                <span className="dnum">{dnum === 1 || k === 0 ? `${MON[m - 1]} ${dnum}` : dnum}</span>
              </button>
              {blocks.map((b) => (
                <button key={b.id} type="button" className="mini block-mini" onClick={() => openEditor({ kind: "day", date: d })}>
                  <span className="mt">{fmtTime(b.start)}</span>
                  <span className="mx">{b.name}</span>
                </button>
              ))}
              {events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`mini event-mini${e.completedAt ? " done-mini" : ""}`}
                  onClick={() => openEditor({ kind: "event", id: e.id })}
                >
                  <span className="mt">{e.start ? fmtTime(e.start) : "●"}</span>
                  <span className="mx">{e.title}</span>
                </button>
              ))}
              {!blocks.length && !events.length && <div className="note">{off ? "" : wknd ? "Open" : "No fixed blocks"}</div>}
              <div className="mt-auto flex flex-col gap-1.5">
                {off && <div className="clash-line off">{off.label}</div>}
                {clashes.map((c) => (
                  <div key={`${c.a.key}|${c.b.key}`} className="clash-line">
                    {c.text}
                  </div>
                ))}
                {notes.map((n) => (
                  <div key={n.id} className="clash-line">
                    {n.text}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

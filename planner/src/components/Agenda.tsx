"use client";

import { useEffect, useRef } from "react";
import { fmtDay, fmtTime, fromMinutes } from "@/lib/dates";
import { clashesOn, dayOffOn, eventsOn, layoutColumns, timedItemsOn } from "@/lib/schedule";
import { usePlanner } from "./store";

const PX = 54;

export function Agenda() {
  const { state, today, clock, showDone, openEditor } = usePlanner();
  const scrollRef = useRef<HTMLDivElement>(null);

  const timed = layoutColumns(timedItemsOn(today, state, showDone));
  const untimed = eventsOn(today, state.events, showDone).filter((e) => !e.start);
  const clashes = clashesOn(today, state);
  const clashing = new Set(clashes.flatMap((c) => [c.a.key, c.b.key]));
  const off = dayOffOn(today, state.daysOff);
  const notes = state.clashNotes.filter((n) => n.date === today);

  let h0 = 8;
  let h1 = 18;
  if (timed.length) {
    const first = Math.min(...timed.map((i) => i.s0));
    const last = Math.max(...timed.map((i) => i.e0));
    h0 = Math.max(0, Math.floor(first / 60) - 1);
    h1 = Math.min(24, Math.ceil(last / 60) + 1);
    if (h1 - h0 < 6) h1 = Math.min(24, h0 + 6);
  }
  const nowMin = clock.minutes;

  // start scrolled near the current time on long days
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const y = ((nowMin - h0 * 60) / 60) * PX - 80;
    if (y > 0) el.scrollTop = y;
    // only on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="agenda">
      <div className="agenda-hd">
        <button type="button" className="text-left text-[17px] font-semibold" onClick={() => openEditor({ kind: "day", date: today })}>
          {fmtDay(today)}
        </button>
        <div className="flex items-center gap-3">
          <span className="eyebrow hidden sm:inline">All times ET</span>
          <button type="button" className="btn ghost sm" onClick={() => openEditor({ kind: "newEvent", date: today })}>
            + Event
          </button>
        </div>
      </div>

      {untimed.length > 0 && (
        <div className="allday">
          {untimed.map((e) => (
            <button key={e.id} type="button" className={`adchip${e.completedAt ? " is-done" : ""}`} onClick={() => openEditor({ kind: "event", id: e.id })}>
              {e.title}
            </button>
          ))}
        </div>
      )}

      {timed.length === 0 ? (
        <div className="px-4 py-5 text-[13.5px] text-muted">
          {untimed.length ? "Nothing on the clock today." : "Nothing scheduled. Best day this week to knock out coursework."}
        </div>
      ) : (
        <div className="calscroll" ref={scrollRef}>
          <div className="cal" style={{ height: (h1 - h0) * PX + 14 }}>
            {Array.from({ length: h1 - h0 + 1 }, (_, k) => h0 + k).map((h) => (
              <div key={h}>
                <div className={`hr${h % 3 === 0 ? " solid" : ""}`} style={{ top: (h - h0) * PX }} />
                <div className="hrlab" style={{ top: (h - h0) * PX }}>
                  {fmtTime(fromMinutes(h * 60 === 1440 ? 0 : h * 60))}
                </div>
              </div>
            ))}
            {timed.map((i) => {
              const top = ((i.s0 - h0 * 60) / 60) * PX;
              const hgt = Math.max(20, ((i.e0 - i.s0) / 60) * PX - 3);
              const col = i.col ?? 0;
              const cols = i.cols ?? 1;
              return (
                <button
                  key={i.key}
                  type="button"
                  className={`ev ${i.type}${hgt < 34 ? " short" : ""}${i.done ? " is-done" : ""}${clashing.has(i.key) ? " clashing" : ""}`}
                  style={{
                    top,
                    height: hgt,
                    left: `calc(60px + ${(col / cols) * 100}% - ${(col / cols) * 74}px)`,
                    width: `calc(${100 / cols}% - ${74 / cols}px - 4px)`,
                  }}
                  onClick={() => openEditor(i.type === "event" ? { kind: "event", id: i.id } : { kind: "day", date: today })}
                  title={i.type === "block" ? "Weekly block · click to skip today or edit" : "Edit event"}
                >
                  <span className="en">{i.title}</span>
                  <span className="et">
                    {fmtTime(fromMinutes(i.s0))}–{fmtTime(fromMinutes(i.e0))}
                    {i.kind ? ` · ${i.kind}` : ""}
                  </span>
                </button>
              );
            })}
            {nowMin >= h0 * 60 && nowMin <= h1 * 60 && <div className="nowline" style={{ top: ((nowMin - h0 * 60) / 60) * PX }} />}
          </div>
        </div>
      )}

      {off && <div className="calnote off">Day off · {off.label}. Classes hidden, weekly meetings kept.</div>}
      {clashes.map((c) => (
        <div key={`${c.a.key}|${c.b.key}`} className="calnote">
          Clash: {c.text}
        </div>
      ))}
      {notes.map((n) => (
        <div key={n.id} className="calnote">
          Collision: {n.text}
        </div>
      ))}
    </div>
  );
}

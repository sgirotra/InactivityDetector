"use client";

import { useEffect, useRef, useState } from "react";
import { completedCount, counters } from "@/lib/board";
import { DOW, MON, parseISOParts } from "@/lib/dates";
import { blocksOn } from "@/lib/schedule";
import type { PlannerState } from "@/lib/types";
import { usePlanner } from "./store";

type Theme = "auto" | "light" | "dark";

function applyTheme(t: Theme) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("planner.theme", t);
  } catch {}
}

export function Header() {
  const { state, today, clock, showDone, setShowDone, openEditor, replaceState, showToast } = usePlanner();
  const [theme, setTheme] = useState<Theme>("auto");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("planner.theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);

  const c = counters(state, today);
  const fixed = blocksOn(today, state).length;
  const { m, d } = parseISOParts(today);
  const done = completedCount(state);

  const cycleTheme = () => {
    const next: Theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    setTheme(next);
    applyTheme(next);
  };

  const onImport = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Import failed");
      replaceState(body.state as PlannerState);
      const r = body.report as { created: number; updated: number; skipped: string[] };
      showToast(`Imported · ${r.created} added, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Import failed");
    }
  };

  const defs = [
    { n: c.slipped, l: "Slipped", cls: c.slipped ? "counter hot" : "counter" },
    { n: c.today, l: "Today", cls: "counter" },
    { n: c.due7, l: "Due ≤7d", cls: c.due7 ? "counter warm" : "counter" },
    { n: c.open, l: "Open", cls: "counter" },
  ];

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
      <div className="min-w-0">
        <h1 className="m-0 text-[clamp(28px,4.4vw,42px)] font-bold leading-[1.02] tracking-[-0.025em]">Fall&nbsp;&apos;26 Critical Path</h1>
        <p className="mono mt-1.5 mb-0 text-xs uppercase tracking-[0.09em] text-muted" suppressHydrationWarning>
          {DOW[clock.weekday].toUpperCase()} · {MON[m - 1].toUpperCase()} {d} · {fixed ? `${fixed} fixed block${fixed > 1 ? "s" : ""}` : "no fixed blocks"}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap gap-2">
          {defs.map((x) => (
            <div key={x.l} className={x.cls}>
              <b>{x.n}</b>
              <span>{x.l}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
          {done > 0 && (
            <button type="button" className="linkbtn" onClick={() => setShowDone(!showDone)}>
              {showDone ? "Hide" : "Show"} completed ({done})
            </button>
          )}
          <button type="button" className="linkbtn" onClick={() => openEditor({ kind: "schedule" })}>
            Schedule
          </button>
          <a className="linkbtn no-underline" href="/api/export" download>
            Export
          </a>
          <button type="button" className="linkbtn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button type="button" className="linkbtn" onClick={cycleTheme} title="Theme: auto, light, dark">
            Theme: {theme}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </header>
  );
}

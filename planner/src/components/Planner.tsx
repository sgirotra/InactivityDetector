"use client";

import type { PlannerState } from "@/lib/types";
import { Agenda } from "./Agenda";
import { DueNext } from "./DueNext";
import { Editors } from "./Editors";
import { FocusCard } from "./FocusCard";
import { Header } from "./Header";
import { QuickAdd } from "./QuickAdd";
import { Slipped } from "./Slipped";
import { PlannerProvider } from "./store";
import { TaskBoard } from "./TaskBoard";
import { Toast } from "./Toast";
import { WeekStrip } from "./WeekStrip";

export function Planner({ initial, nowMs }: { initial: PlannerState; nowMs: number }) {
  return (
    <PlannerProvider initial={initial} nowMs={nowMs}>
      <div className="mx-auto flex max-w-[1080px] flex-col gap-[26px] px-4 pt-7 pb-[72px] sm:px-5">
        <Header />
        <QuickAdd />
        <Slipped />
        <section className="grid grid-cols-1 items-start gap-[22px] md:grid-cols-[1.35fr_1fr]">
          <div className="min-w-0">
            <h2 className="sec">Today</h2>
            <Agenda />
            <FocusCard />
          </div>
          <div className="min-w-0">
            <DueNext />
          </div>
        </section>
        <WeekStrip />
        <TaskBoard />
        <p className="border-t border-line pt-3.5 text-[12.5px] leading-relaxed text-muted">
          All times Eastern. Anything with a date that passes stays on the board as a slipped item until you check it off or move it.
          Click any task, event or day to edit it. Press <span className="kbd">/</span> to quick-add.
        </p>
      </div>
      <Editors />
      <Toast />
    </PlannerProvider>
  );
}

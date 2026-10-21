"use client";

import { dueNext } from "@/lib/board";
import { TaskRow } from "./rows";
import { usePlanner } from "./store";

export function DueNext() {
  const { state, today } = usePlanner();
  const list = dueNext(state, today, 8);
  const names = new Map(state.sections.map((s) => [s.id, s.name]));
  return (
    <div>
      <h2 className="sec">
        Due next <span className="n">{list.length || ""}</span>
      </h2>
      <div className="flex flex-col">
        {list.length === 0 ? (
          <div className="empty">Nothing dated ahead. Everything left is untimed.</div>
        ) : (
          list.map((t) => <TaskRow key={t.id} task={t} group={names.get(t.sectionId)} />)
        )}
      </div>
    </div>
  );
}

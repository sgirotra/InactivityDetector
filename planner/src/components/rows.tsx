"use client";

import { useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { dueChip } from "@/lib/board";
import { fmtTime } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { completeAction, markDone, usePlanner } from "./store";

export interface Chip {
  cls: string;
  label: string;
}

/** Checkbox behavior shared by every list: fade out, save, then offer Undo. */
export function useCheckOff(kind: "task" | "event" | "focus", id: string, title: string) {
  const { mutate, showToast, showDone } = usePlanner();
  const [leaving, setLeaving] = useState(false);

  const toggle = (checked: boolean) => {
    const save = async () => {
      await mutate([completeAction(kind, id, checked)], markDone(kind, id, checked));
      setLeaving(false);
      if (checked) showToast(`Done · ${title}`, [completeAction(kind, id, false)]);
    };
    if (checked && !showDone) {
      setLeaving(true);
      setTimeout(save, 200);
    } else {
      void save();
    }
  };
  return { leaving, toggle };
}

export function CheckRow({
  kind,
  id,
  title,
  note,
  done,
  chips = [],
  onOpen,
  handle,
  rowRef,
  style,
  dragging,
}: {
  kind: "task" | "event" | "focus";
  id: string;
  title: string;
  note?: string | null;
  done: boolean;
  chips?: Chip[];
  onOpen?: () => void;
  handle?: ReactNode;
  rowRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragging?: boolean;
}) {
  const { leaving, toggle } = useCheckOff(kind, id, title);
  return (
    <div
      ref={rowRef}
      style={style}
      className={`row${done ? " done" : ""}${leaving ? " leaving" : ""}${dragging ? " opacity-40" : ""}`}
    >
      {handle}
      <input
        type="checkbox"
        className="cb"
        checked={done || leaving}
        aria-label={`${done ? "Uncheck" : "Check off"} ${title}`}
        onChange={(e) => toggle(e.target.checked)}
      />
      <button type="button" className="rowbtn" onClick={onOpen} disabled={!onOpen}>
        <div className="ttl">{title}</div>
        {note ? <div className="note">{note}</div> : null}
        {chips.length ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {chips.map((c, i) => (
              <span key={i} className={c.cls}>
                {c.label}
              </span>
            ))}
          </div>
        ) : null}
      </button>
    </div>
  );
}

export function taskChips(t: Task, today: string, group?: string): Chip[] {
  const chips: Chip[] = [];
  if (group) chips.push({ cls: "chip tag", label: group });
  if (t.priority === 1) chips.push({ cls: "chip prio", label: "High" });
  else if (t.priority === 2) chips.push({ cls: "chip tag", label: "Med" });
  if (!t.completedAt) {
    const dc = dueChip(t.due, today);
    if (dc) {
      const cls = { past: "chip due-past", today: "chip due-today", soon: "chip due-soon", plain: "chip" }[dc.tone];
      chips.push({ cls, label: t.dueTime ? `${dc.label} · ${fmtTime(t.dueTime)}` : dc.label });
    }
  }
  return chips;
}

export function TaskRow({ task, group, handle, rowRef, style, dragging }: {
  task: Task;
  group?: string;
  handle?: ReactNode;
  rowRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragging?: boolean;
}) {
  const { today, openEditor } = usePlanner();
  return (
    <CheckRow
      kind="task"
      id={task.id}
      title={task.title}
      note={task.note}
      done={!!task.completedAt}
      chips={taskChips(task, today, group)}
      onOpen={() => openEditor({ kind: "task", id: task.id })}
      handle={handle}
      rowRef={rowRef}
      style={style}
      dragging={dragging}
    />
  );
}

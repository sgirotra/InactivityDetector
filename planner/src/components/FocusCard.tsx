"use client";

import { useState } from "react";
import { focusTitle, visibleFocus, type VisibleFocus } from "@/lib/board";
import { addDays, DOW, fmtShort, weekdayOf } from "@/lib/dates";
import { CheckRow } from "./rows";
import { usePlanner } from "./store";

function FocusBox({ v }: { v: VisibleFocus }) {
  const { today, showDone, mutate, showToast, state } = usePlanner();
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const items = v.list.items.filter((i) => showDone || !i.completedAt);
  const open = v.list.items.filter((i) => !i.completedAt).length;
  const linked = new Map(state.tasks.map((t) => [t.id, t]));

  const add = async () => {
    const title = adding.trim();
    if (!title) return;
    setAdding("");
    await mutate([{ type: "focus.addItems", date: v.list.date, items: [{ title }] }]);
  };

  const rollover = async () => {
    const ok = await mutate([{ type: "focus.rollover", from: v.list.date, to: today }]);
    if (ok) showToast(`Moved ${open} item${open === 1 ? "" : "s"} to today's focus`);
  };

  if (!items.length && v.mode !== "today" && v.mode !== "tomorrow") return null;

  return (
    <div className="focus">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[15px] font-semibold">{focusTitle(v)}</h3>
          <div className="eyebrow mt-0.5">
            {DOW[weekdayOf(v.list.date)]} {fmtShort(v.list.date)} · {open} open
          </div>
        </div>
        {v.mode === "lastNight" && open > 0 && (
          <button type="button" className="btn ghost sm" onClick={rollover}>
            Roll over unfinished
          </button>
        )}
      </div>
      <div className="flat mt-2.5 flex flex-col">
        {items.map((i) =>
          editing === i.id ? (
            <form
              key={i.id}
              className="flex gap-2 py-1.5"
              onSubmit={async (e) => {
                e.preventDefault();
                const title = draft.trim();
                setEditing(null);
                if (title && title !== i.title) await mutate([{ type: "focus.updateItem", id: i.id, patch: { title } }]);
              }}
            >
              <input className="field sm" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn sm" type="submit">
                Save
              </button>
              <button
                className="btn danger sm"
                type="button"
                onClick={async () => {
                  setEditing(null);
                  await mutate([{ type: "focus.deleteItem", id: i.id }]);
                }}
              >
                Delete
              </button>
            </form>
          ) : (
            <CheckRow
              key={i.id}
              kind="focus"
              id={i.id}
              title={i.title}
              note={i.note ?? (i.linkedTaskId ? linked.get(i.linkedTaskId)?.title : null)}
              done={!!i.completedAt}
              onOpen={() => {
                setEditing(i.id);
                setDraft(i.title);
              }}
            />
          ),
        )}
      </div>
      {v.mode !== "lastNight" && (
        <form
          className="adder"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input className="field" placeholder="Add to this list" aria-label="Add a focus item" value={adding} onChange={(e) => setAdding(e.target.value)} />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
      )}
    </div>
  );
}

export function FocusCard() {
  const { state, today, mutate } = usePlanner();
  const visible = visibleFocus(state.focusLists, today);
  const hasToday = visible.some((v) => v.mode === "today");
  const hasTomorrow = visible.some((v) => v.mode === "tomorrow");
  return (
    <div className="mt-[18px] flex flex-col gap-3">
      {visible.map((v) => (
        <FocusBox key={v.list.date} v={v} />
      ))}
      {(!hasToday || !hasTomorrow) && (
        <div className="flex gap-4 px-1">
          {!hasToday && (
            <button type="button" className="linkbtn" onClick={() => mutate([{ type: "focus.setLabel", date: today, label: null }])}>
              + Today&apos;s focus
            </button>
          )}
          {!hasTomorrow && (
            <button type="button" className="linkbtn" onClick={() => mutate([{ type: "focus.setLabel", date: addDays(today, 1), label: null }])}>
              + Tomorrow&apos;s focus
            </button>
          )}
        </div>
      )}
    </div>
  );
}

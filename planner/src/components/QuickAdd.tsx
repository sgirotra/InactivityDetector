"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Action } from "@/lib/actions";
import { DOW, fmtDay, fmtTime, weekdayOf } from "@/lib/dates";
import { parseQuickAdd, type QuickPreview } from "@/lib/quickadd";
import { slug } from "@/lib/transfer";
import { completeAction, usePlanner } from "./store";

const rid = (p: string) => `${p}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

const EXAMPLES = ["3030 homework due fri", "home depot meeting tue 6:30-7:30pm", "no school mon and tue", "focus tomorrow: gym, math, kpmg prep", "finished the 10/13 GPS"];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function QuickAdd() {
  const { state, mutate, showToast, openEditor } = usePlanner();
  const inputRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<QuickPreview | null>(null);
  const [pick, setPick] = useState(0);
  const [saving, setSaving] = useState(false);

  // parse against the live clock so "tomorrow" is resolved at the moment of typing;
  // only re-parse when the text changes so background refreshes don't wipe field edits
  const stateRef = useRef(state);
  stateRef.current = state;
  const result = useMemo(() => (text.trim() ? parseQuickAdd(text, { now: new Date(), ...stateRef.current }) : null), [text]);

  useEffect(() => {
    setDraft(result?.preview ?? null);
    setPick(0);
  }, [result]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        openEditor(null);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openEditor]);

  const reset = () => {
    setText("");
    setDraft(null);
  };

  const sections = state.sections.filter((s) => !s.archived).sort((a, b) => a.order - b.order);

  const valid = (() => {
    if (!draft) return false;
    switch (draft.kind) {
      case "task":
        return !!draft.title.trim() && (!!draft.sectionId || !!draft.newSection);
      case "event":
        return !!draft.title.trim() && !!draft.date;
      case "daysOff":
        return draft.dates.length > 0;
      case "focus":
        return draft.items.some((i) => i.trim());
      case "skip":
        return !!draft.blockId;
      case "complete":
        return draft.candidates.length > 0;
    }
  })();

  const save = async () => {
    if (!draft || !valid || saving) return;
    let actions: Action[] = [];
    let undo: Action[] | undefined;
    let message = "";
    switch (draft.kind) {
      case "task": {
        let sectionId = draft.sectionId;
        if (!sectionId && draft.newSection) {
          const base = slug(draft.newSection.name) || "section";
          sectionId = state.sections.some((s) => s.id === base) ? `${base}-${rid("")}` : base;
          actions.push({ type: "section.create", data: { id: sectionId, name: draft.newSection.name, area: draft.newSection.area } });
        }
        const id = rid("t");
        actions.push({
          type: "task.create",
          data: { id, sectionId: sectionId!, title: draft.title.trim(), due: draft.due, dueTime: draft.due ? draft.dueTime : null, priority: draft.priority },
        });
        undo = [{ type: "task.delete", id }];
        message = `Added · ${draft.title}`;
        break;
      }
      case "event": {
        const id = rid("e");
        actions = [
          {
            type: "event.create",
            data: { id, title: draft.title.trim(), date: draft.date, start: draft.start, end: draft.start ? draft.end : null, category: draft.category, note: draft.endAssumed ? "End time assumed" : null },
          },
        ];
        undo = [{ type: "event.delete", id }];
        message = `Added · ${draft.title} · ${fmtDay(draft.date)}`;
        break;
      }
      case "daysOff": {
        const fresh = draft.dates.filter((d) => !state.daysOff.some((x) => x.date === d));
        actions = draft.dates.map((date) => ({ type: "dayOff.set", date, label: draft.label }));
        undo = fresh.map((date) => ({ type: "dayOff.delete", date }));
        message = `${draft.dates.length} day${draft.dates.length > 1 ? "s" : ""} off added`;
        break;
      }
      case "focus":
        actions = [{ type: "focus.addItems", date: draft.date, items: draft.items.filter((i) => i.trim()).map((title) => ({ title: title.trim() })) }];
        message = `Focus for ${fmtDay(draft.date)} saved`;
        break;
      case "skip":
        actions = [{ type: "skip.create", date: draft.date, blockId: draft.blockId, blockName: draft.blockName }];
        message = `Skipping ${draft.blockName} on ${fmtDay(draft.date)}`;
        break;
      case "complete": {
        const c = draft.candidates[pick];
        actions = [completeAction(c.type, c.id, true)];
        undo = [completeAction(c.type, c.id, false)];
        message = `Done · ${c.title}`;
        break;
      }
    }
    setSaving(true);
    const ok = await mutate(actions);
    setSaving(false);
    if (ok) {
      reset();
      showToast(message, undo?.length ? undo : undefined);
      inputRef.current?.focus();
    }
  };

  const set = (patch: Partial<QuickPreview>) => setDraft((d) => (d ? ({ ...d, ...patch } as QuickPreview) : d));
  const blocksFor = (date: string) => state.blocks.filter((b) => b.weekday === weekdayOf(date));

  let fields: ReactNode = null;
  if (draft) {
    switch (draft.kind) {
      case "task":
        fields = (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1.4fr_1fr_0.8fr]">
            <div className="col-span-2 sm:col-span-1">
              <Row label="Task">
                <input className="field sm" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
              </Row>
            </div>
            <Row label="Section">
              <select
                className="field sm"
                value={draft.sectionId ?? (draft.newSection ? "__new" : "")}
                onChange={(e) => set(e.target.value === "__new" ? { sectionId: null } : { sectionId: e.target.value || null, newSection: null })}
              >
                {!draft.sectionId && !draft.newSection && <option value="">Pick a section…</option>}
                {draft.newSection && <option value="__new">New: {draft.newSection.name} ({draft.newSection.area})</option>}
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Due">
              <input className="field sm" type="date" value={draft.due ?? ""} onChange={(e) => set({ due: e.target.value || null })} />
            </Row>
            <Row label="Time">
              <input className="field sm" type="time" value={draft.dueTime ?? ""} disabled={!draft.due} onChange={(e) => set({ dueTime: e.target.value || null })} />
            </Row>
          </div>
        );
        break;
      case "event":
        fields = (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1.2fr_0.8fr_0.8fr_1fr]">
            <div className="col-span-2 sm:col-span-1">
              <Row label="Event">
                <input className="field sm" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
              </Row>
            </div>
            <Row label="Date">
              <input className="field sm" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </Row>
            <Row label="Category">
              <input className="field sm" value={draft.category} onChange={(e) => set({ category: e.target.value })} />
            </Row>
            <Row label="Start">
              <input className="field sm" type="time" value={draft.start ?? ""} onChange={(e) => set({ start: e.target.value || null })} />
            </Row>
            <Row label="End">
              <input className="field sm" type="time" value={draft.end ?? ""} onChange={(e) => set({ end: e.target.value || null, endAssumed: false })} />
            </Row>
          </div>
        );
        break;
      case "daysOff":
        fields = (
          <div className="flex flex-wrap items-end gap-2">
            <Row label="Label">
              <input className="field sm" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
            </Row>
            {draft.dates.map((d, i) => (
              <span key={d} className="chip flex items-center gap-1.5 normal-case">
                {fmtDay(d)}
                <button type="button" aria-label={`Remove ${d}`} onClick={() => set({ dates: draft.dates.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
        );
        break;
      case "focus":
        fields = (
          <div className="flex flex-col gap-2">
            <Row label="Focus list for">
              <input className="field sm w-auto" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </Row>
            <div className="flex flex-wrap gap-2">
              {draft.items.map((it, i) => (
                <input
                  key={i}
                  className="field sm w-auto min-w-0 flex-1 basis-32"
                  value={it}
                  aria-label={`Focus item ${i + 1}`}
                  onChange={(e) => set({ items: draft.items.map((x, k) => (k === i ? e.target.value : x)) })}
                />
              ))}
            </div>
          </div>
        );
        break;
      case "skip":
        fields = (
          <div className="flex flex-wrap items-end gap-2">
            <Row label="Date">
              <input className="field sm w-auto" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </Row>
            <Row label="Block">
              <select
                className="field sm"
                value={draft.blockId}
                onChange={(e) => {
                  const b = state.blocks.find((x) => x.id === e.target.value);
                  if (b) set({ blockId: b.id, blockName: b.name });
                }}
              >
                {!blocksFor(draft.date).some((b) => b.id === draft.blockId) && <option value={draft.blockId}>{draft.blockName}</option>}
                {blocksFor(draft.date).map((b) => (
                  <option key={b.id} value={b.id}>
                    {fmtTime(b.start)} {b.name}
                  </option>
                ))}
              </select>
            </Row>
          </div>
        );
        break;
      case "complete":
        fields = (
          <div className="flex flex-col gap-1">
            <span className="label">Check off</span>
            {draft.candidates.map((c, i) => (
              <label key={`${c.type}:${c.id}`} className="flex items-center gap-2 text-[13.5px]">
                <input type="radio" name="qa-pick" checked={pick === i} onChange={() => setPick(i)} />
                <span className="font-medium">{c.title}</span>
                <span className="text-xs text-muted">{c.detail}</span>
              </label>
            ))}
          </div>
        );
        break;
    }
  }

  const kindLabel: Record<QuickPreview["kind"], string> = {
    task: "New task",
    event: "New event",
    daysOff: "Days off",
    focus: "Focus list",
    skip: "Skip one class",
    complete: "Mark done",
  };

  return (
    <div className="card p-2.5 shadow-[var(--shadow)]">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // first Enter moves to Save so the preview gets a look; second Enter saves
          if (valid) saveRef.current?.focus();
        }}
      >
        <span className="mono pl-1 text-muted" aria-hidden>
          +
        </span>
        <input
          ref={inputRef}
          className="min-w-0 flex-1 border-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted"
          placeholder={`Quick add: “${EXAMPLES[0]}”, “${EXAMPLES[3]}”`}
          aria-label="Quick add"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") reset();
          }}
        />
        <span className="hidden items-center gap-1 sm:flex">
          <span className="kbd">/</span>
          <span className="kbd">⌘K</span>
        </span>
      </form>

      {result && (
        <div
          className="mt-2 border-t border-line-soft px-1 pt-2.5 pb-1"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              reset();
              inputRef.current?.focus();
            }
          }}
        >
          {result.error && !draft ? (
            <div className="text-[13px] text-brick">{result.error}</div>
          ) : draft ? (
            <div className="flex flex-col gap-2.5">
              <div className="eyebrow">{kindLabel[draft.kind]} · check it, fix anything, then save</div>
              {fields}
              {result.notes.map((n) => (
                <div key={n} className="text-xs text-amber">
                  {n}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button ref={saveRef} type="button" className="btn sm focus:outline-2 focus:outline-offset-2 focus:outline-[var(--gold)]" disabled={!valid || saving} onClick={save}>
                  {draft.kind === "complete" ? "Check it off" : "Save"}
                </button>
                <button type="button" className="btn ghost sm" onClick={reset}>
                  Cancel
                </button>
                {draft.kind === "skip" && <span className="text-xs text-muted">{DOW[weekdayOf(draft.date)]} only. Other weeks are untouched.</span>}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

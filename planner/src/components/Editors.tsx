"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Action } from "@/lib/actions";
import { DOW, fmtDay, fmtShort, fmtTime, weekdayOf } from "@/lib/dates";
import { blocksOn, clashesOn, dayOffOn, eventsOn, skippedBlocksOn } from "@/lib/schedule";
import { DEFAULT_AREAS, type CalEvent, type RecurringBlock, type Section, type Task } from "@/lib/types";
import { usePlanner } from "./store";

const orNull = (s: string) => (s.trim() ? s.trim() : null);

function Modal({ title, wide, onClose, children }: { title: ReactNode; wide?: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="m-0 text-base font-semibold">{title}</h3>
          <button type="button" className="linkbtn" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Buttons({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>;
}

// ------------------------------------------------------------------ task

function TaskEditor({ task, defaults, onClose }: { task?: Task; defaults?: { sectionId?: string; due?: string }; onClose: () => void }) {
  const { state, mutate, showToast } = usePlanner();
  const sections = state.sections.filter((s) => !s.archived || s.id === task?.sectionId).sort((a, b) => a.order - b.order);
  const [title, setTitle] = useState(task?.title ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [due, setDue] = useState(task?.due ?? defaults?.due ?? "");
  const [dueTime, setDueTime] = useState(task?.dueTime ?? "");
  const [priority, setPriority] = useState(String(task?.priority ?? ""));
  const [sectionId, setSectionId] = useState(task?.sectionId ?? defaults?.sectionId ?? sections[0]?.id ?? "");

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !sectionId) return;
    const fields = {
      title: title.trim(),
      note: orNull(note),
      due: due || null,
      dueTime: due && dueTime ? dueTime : null,
      priority: priority ? Number(priority) : null,
      sectionId,
    };
    const ok = await mutate([task ? { type: "task.update", id: task.id, patch: fields } : { type: "task.create", data: fields }]);
    if (ok) onClose();
  };

  return (
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Title">
          <input className="field" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Note">
          <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input className="field" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Due time">
            <input className="field" type="time" value={dueTime} disabled={!due} onChange={(e) => setDueTime(e.target.value)} />
          </Field>
          <Field label="Priority">
            <select className="field" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">None</option>
              <option value="1">High</option>
              <option value="2">Medium</option>
              <option value="3">Low</option>
            </select>
          </Field>
          <Field label="Section">
            <select className="field" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {due && (
          <div className="flex flex-wrap gap-1.5">
            <span className="eyebrow self-center">Push</span>
            {[1, 2, 7].map((n) => (
              <button
                key={n}
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  const d = new Date(`${due}T12:00:00Z`);
                  d.setUTCDate(d.getUTCDate() + n);
                  setDue(d.toISOString().slice(0, 10));
                }}
              >
                +{n}d
              </button>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => setDue("")}>
              No date
            </button>
          </div>
        )}
        <Buttons>
          <button className="btn" type="submit">
            Save
          </button>
          {task && (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  const done = !task.completedAt;
                  if (await mutate([{ type: "task.complete", id: task.id, done }])) {
                    onClose();
                    if (done) showToast(`Done · ${task.title}`, [{ type: "task.complete", id: task.id, done: false }]);
                  }
                }}
              >
                {task.completedAt ? "Mark open" : "Mark done"}
              </button>
              <button
                type="button"
                className="btn danger ml-auto"
                onClick={async () => {
                  if (!confirm(`Delete “${task.title}”?`)) return;
                  if (await mutate([{ type: "task.delete", id: task.id }])) onClose();
                }}
              >
                Delete
              </button>
            </>
          )}
        </Buttons>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ event

function EventEditor({ event, date, onClose }: { event?: CalEvent; date?: string; onClose: () => void }) {
  const { state, mutate, showToast } = usePlanner();
  const [title, setTitle] = useState(event?.title ?? "");
  const [d, setD] = useState(event?.date ?? date ?? "");
  const [start, setStart] = useState(event?.start ?? "");
  const [end, setEnd] = useState(event?.end ?? "");
  const [category, setCategory] = useState(event?.category ?? "");
  const [note, setNote] = useState(event?.note ?? "");
  const categories = [...new Set([...state.events.map((e) => e.category), ...state.sections.map((s) => s.name.split("·")[0].trim()), "Exam"])].filter(Boolean);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !d) return;
    const fields = { title: title.trim(), date: d, start: start || null, end: start && end ? end : null, category: category.trim(), note: orNull(note) };
    const ok = await mutate([event ? { type: "event.update", id: event.id, patch: fields } : { type: "event.create", data: fields }]);
    if (ok) onClose();
  };

  return (
    <Modal title={event ? "Edit event" : "New event"} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Title">
          <input className="field" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Date" className="col-span-2 sm:col-span-1">
            <input className="field" type="date" value={d} onChange={(e) => setD(e.target.value)} required />
          </Field>
          <Field label="Start">
            <input className="field" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End">
            <input className="field" type="time" value={end} disabled={!start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Category">
          <input className="field" list="event-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="event-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Note">
          <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="m-0 text-xs text-muted">Leave the start empty for an all-day item. No end time means one hour.</p>
        <Buttons>
          <button className="btn" type="submit">
            Save
          </button>
          {event && (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  const done = !event.completedAt;
                  if (await mutate([{ type: "event.complete", id: event.id, done }])) {
                    onClose();
                    if (done) showToast(`Done · ${event.title}`, [{ type: "event.complete", id: event.id, done: false }]);
                  }
                }}
              >
                {event.completedAt ? "Mark open" : "Mark done"}
              </button>
              <button
                type="button"
                className="btn danger ml-auto"
                onClick={async () => {
                  if (!confirm(`Delete “${event.title}”?`)) return;
                  if (await mutate([{ type: "event.delete", id: event.id }])) onClose();
                }}
              >
                Delete
              </button>
            </>
          )}
        </Buttons>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ day

function DayEditor({ date, onClose }: { date: string; onClose: () => void }) {
  const { state, mutate, openEditor, showDone } = usePlanner();
  const off = dayOffOn(date, state.daysOff);
  const [offLabel, setOffLabel] = useState(off?.label ?? "No school");
  const [noteText, setNoteText] = useState("");
  const blocks = blocksOn(date, state);
  const skipped = skippedBlocksOn(date, state);
  const hiddenByOff = off ? state.blocks.filter((b) => b.weekday === weekdayOf(date) && !b.survivesDaysOff) : [];
  const events = eventsOn(date, state.events, showDone);
  const clashes = clashesOn(date, state);
  const notes = state.clashNotes.filter((n) => n.date === date);

  return (
    <Modal title={fmtDay(date)} onClose={onClose} wide>
      <div className="flex flex-col gap-4 text-[13.5px]">
        <section>
          <div className="label">Day off</div>
          <div className="flex flex-wrap items-center gap-2">
            <input className="field sm max-w-60 flex-1" value={offLabel} onChange={(e) => setOffLabel(e.target.value)} aria-label="Day off label" />
            {off ? (
              <>
                {offLabel.trim() !== off.label && (
                  <button className="btn sm" type="button" onClick={() => mutate([{ type: "dayOff.set", date, label: offLabel.trim() || "Day off" }])}>
                    Rename
                  </button>
                )}
                <button className="btn ghost sm" type="button" onClick={() => mutate([{ type: "dayOff.delete", date }])}>
                  Remove day off
                </button>
              </>
            ) : (
              <button className="btn sm" type="button" onClick={() => mutate([{ type: "dayOff.set", date, label: offLabel.trim() || "Day off" }])}>
                Mark as day off
              </button>
            )}
          </div>
          <p className="m-0 mt-1 text-xs text-muted">A day off hides classes and keeps weekly club meetings.</p>
        </section>

        <section>
          <div className="label">Weekly blocks</div>
          {!blocks.length && !skipped.length && !hiddenByOff.length && <div className="text-muted">None on {DOW[weekdayOf(date)]}.</div>}
          {blocks.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 border-b border-line-soft py-1.5">
              <span>
                <span className="mono mr-2 text-xs text-muted">
                  {fmtTime(b.start)}–{fmtTime(b.end)}
                </span>
                {b.name}
              </span>
              <span className="flex gap-1.5">
                <button className="btn ghost sm" type="button" onClick={() => mutate([{ type: "skip.create", date, blockId: b.id, blockName: b.name }])}>
                  Skip this day
                </button>
                <button className="btn ghost sm" type="button" onClick={() => openEditor({ kind: "block", id: b.id })}>
                  Edit
                </button>
              </span>
            </div>
          ))}
          {skipped.map(({ block, skip }) => (
            <div key={skip.id} className="flex items-center justify-between gap-2 border-b border-line-soft py-1.5 text-muted">
              <span className="line-through">
                {fmtTime(block.start)} {block.name}
              </span>
              <button className="btn ghost sm" type="button" onClick={() => mutate([{ type: "skip.delete", id: skip.id }])}>
                Restore
              </button>
            </div>
          ))}
          {hiddenByOff.map((b) => (
            <div key={b.id} className="py-1 text-xs text-muted">
              {fmtTime(b.start)} {b.name} · hidden by the day off
            </div>
          ))}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <div className="label">Events</div>
            <button className="btn ghost sm" type="button" onClick={() => openEditor({ kind: "newEvent", date })}>
              + Event
            </button>
          </div>
          {!events.length && <div className="text-muted">Nothing booked.</div>}
          {events.map((e) => (
            <button key={e.id} type="button" className="flex w-full items-center gap-2 border-b border-line-soft py-1.5 text-left" onClick={() => openEditor({ kind: "event", id: e.id })}>
              <span className="mono w-24 shrink-0 text-xs text-muted">{e.start ? `${fmtTime(e.start)}–${fmtTime(e.end ?? "")}` : "all day"}</span>
              <span className={e.completedAt ? "text-muted line-through" : ""}>{e.title}</span>
            </button>
          ))}
        </section>

        <section>
          <div className="label">Clashes</div>
          {clashes.map((c) => (
            <div key={`${c.a.key}|${c.b.key}`} className="py-1 text-brick">
              {c.text}
            </div>
          ))}
          {notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-2 py-1">
              <span className="text-brick">{n.text}</span>
              <button className="linkbtn shrink-0" type="button" onClick={() => mutate([{ type: "clashNote.delete", id: n.id }])}>
                Delete
              </button>
            </div>
          ))}
          {!clashes.length && !notes.length && <div className="text-muted">No overlaps.</div>}
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!noteText.trim()) return;
              if (await mutate([{ type: "clashNote.create", date, text: noteText.trim() }])) setNoteText("");
            }}
          >
            <input className="field sm" placeholder="Add a clash note" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <button className="btn sm" type="submit" disabled={!noteText.trim()}>
              Add
            </button>
          </form>
        </section>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ section

function SectionEditor({ section, area, onClose }: { section?: Section; area?: string; onClose: () => void }) {
  const { state, mutate } = usePlanner();
  const [name, setName] = useState(section?.name ?? "");
  const [ar, setAr] = useState(section?.area ?? area ?? DEFAULT_AREAS[0]);
  const [credits, setCredits] = useState(section?.credits != null ? String(section.credits) : "");
  const [aliases, setAliases] = useState(section?.aliases ?? "");
  const [archived, setArchived] = useState(section?.archived ?? false);
  const areas = [...new Set([...DEFAULT_AREAS, ...state.sections.map((s) => s.area)])];
  const count = section ? state.tasks.filter((t) => t.sectionId === section.id).length : 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ar.trim()) return;
    const fields = { name: name.trim(), area: ar.trim(), credits: credits ? Number(credits) : null, aliases: aliases.trim(), archived };
    const ok = await mutate([section ? { type: "section.update", id: section.id, patch: fields } : { type: "section.create", data: fields }]);
    if (ok) onClose();
  };

  return (
    <Modal title={section ? "Edit section" : "New section"} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Name">
          <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area">
            <input className="field" list="areas" value={ar} onChange={(e) => setAr(e.target.value)} required />
            <datalist id="areas">
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field label="Credits">
            <input className="field" type="number" min={0} max={30} value={credits} onChange={(e) => setCredits(e.target.value)} />
          </Field>
        </div>
        <Field label="Quick-add names (comma separated)">
          <input className="field" placeholder="e.g. physics, phys" value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>
        {section && (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="cb" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Archived (hidden from the board, kept in backups)
          </label>
        )}
        <Buttons>
          <button className="btn" type="submit">
            Save
          </button>
          {section && (
            <button
              type="button"
              className="btn danger ml-auto"
              onClick={async () => {
                if (!confirm(count ? `Delete “${section.name}” and its ${count} task(s)? Archiving keeps them instead.` : `Delete “${section.name}”?`)) return;
                if (await mutate([{ type: "section.delete", id: section.id }])) onClose();
              }}
            >
              Delete
            </button>
          )}
        </Buttons>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ block

function BlockEditor({ block, weekday, onClose }: { block?: RecurringBlock; weekday?: number; onClose: () => void }) {
  const { mutate } = usePlanner();
  const [name, setName] = useState(block?.name ?? "");
  const [kind, setKind] = useState(block?.kind ?? "");
  const [wd, setWd] = useState(block?.weekday ?? weekday ?? 1);
  const [start, setStart] = useState(block?.start ?? "");
  const [end, setEnd] = useState(block?.end ?? "");
  const [survives, setSurvives] = useState(block?.survivesDaysOff ?? false);
  const [from, setFrom] = useState(block?.activeFrom ?? "");
  const [until, setUntil] = useState(block?.activeUntil ?? "");

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !start || !end) return;
    const fields = { name: name.trim(), kind: kind.trim(), weekday: wd, start, end, survivesDaysOff: survives, activeFrom: from || null, activeUntil: until || null };
    const ok = await mutate([block ? { type: "block.update", id: block.id, patch: fields } : { type: "block.create", data: fields }]);
    if (ok) onClose();
  };

  return (
    <Modal title={block ? "Edit weekly block" : "New weekly block"} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Kind">
            <input className="field" placeholder="Lecture, Lab, Weekly…" value={kind} onChange={(e) => setKind(e.target.value)} />
          </Field>
          <Field label="Day">
            <select className="field" value={wd} onChange={(e) => setWd(Number(e.target.value))}>
              {DOW.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start">
              <input className="field" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field label="End">
              <input className="field" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </Field>
          </div>
          <Field label="Active from">
            <input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Active until">
            <input className="field" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="cb" checked={survives} onChange={(e) => setSurvives(e.target.checked)} />
          Still meets on days off (weekly club meetings)
        </label>
        <Buttons>
          <button className="btn" type="submit">
            Save
          </button>
          {block && (
            <button
              type="button"
              className="btn danger ml-auto"
              onClick={async () => {
                if (!confirm(`Delete the weekly “${block.name}” block on ${DOW[block.weekday]}?`)) return;
                if (await mutate([{ type: "block.delete", id: block.id }])) onClose();
              }}
            >
              Delete
            </button>
          )}
        </Buttons>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ schedule manager

type Tab = "blocks" | "daysOff" | "skips" | "notes" | "archived";

function ScheduleManager({ onClose }: { onClose: () => void }) {
  const { state, mutate, openEditor, today } = usePlanner();
  const [tab, setTab] = useState<Tab>("blocks");
  const [offDate, setOffDate] = useState("");
  const [offLabel, setOffLabel] = useState("No school");
  const [noteDate, setNoteDate] = useState(today);
  const [noteText, setNoteText] = useState("");
  const archived = state.sections.filter((s) => s.archived);
  const blockName = new Map(state.blocks.map((b) => [b.id, b.name]));
  const run = (a: Action) => mutate([a]);

  const tabs: [Tab, string][] = [
    ["blocks", "Weekly blocks"],
    ["daysOff", `Days off (${state.daysOff.length})`],
    ["skips", `Skips (${state.skips.length})`],
    ["notes", `Clash notes (${state.clashNotes.length})`],
    ...(archived.length ? [["archived", `Archived (${archived.length})`] as [Tab, string]] : []),
  ];

  return (
    <Modal title="Schedule" onClose={onClose} wide>
      <div className="rangetabs mb-3 flex-wrap">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="max-h-[60vh] overflow-y-auto text-[13.5px]">
        {tab === "blocks" && (
          <div>
            {DOW.map((d, wd) => {
              const list = state.blocks.filter((b) => b.weekday === wd);
              return (
                <div key={d} className="border-b border-line-soft py-2">
                  <div className="flex items-center justify-between">
                    <span className="label m-0">{d}</span>
                    <button type="button" className="linkbtn" onClick={() => openEditor({ kind: "newBlock", weekday: wd })}>
                      + Block
                    </button>
                  </div>
                  {list.map((b) => (
                    <button key={b.id} type="button" className="flex w-full items-baseline gap-2 py-1 text-left hover:text-navy" onClick={() => openEditor({ kind: "block", id: b.id })}>
                      <span className="mono w-28 shrink-0 text-xs text-muted">
                        {fmtTime(b.start)}–{fmtTime(b.end)}
                      </span>
                      <span className="min-w-0 flex-1">{b.name}</span>
                      <span className="chip tag hidden sm:inline">{b.survivesDaysOff ? "survives days off" : b.kind || "class"}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {tab === "daysOff" && (
          <div>
            <form
              className="mb-3 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (offDate && (await run({ type: "dayOff.set", date: offDate, label: offLabel.trim() || "Day off" }))) setOffDate("");
              }}
            >
              <input className="field sm w-auto" type="date" value={offDate} onChange={(e) => setOffDate(e.target.value)} aria-label="Date" required />
              <input className="field sm max-w-60 flex-1" value={offLabel} onChange={(e) => setOffLabel(e.target.value)} aria-label="Label" />
              <button className="btn sm" type="submit">
                Add day off
              </button>
            </form>
            {state.daysOff.map((d) => (
              <div key={d.date} className="flex items-center justify-between gap-2 border-b border-line-soft py-1.5">
                <span>
                  <span className="mono mr-2 text-xs text-muted">{fmtDay(d.date)}</span>
                  {d.label}
                </span>
                <button className="linkbtn" type="button" onClick={() => run({ type: "dayOff.delete", date: d.date })}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === "skips" && (
          <div>
            <p className="m-0 mb-2 text-xs text-muted">Skip a single class from its day: click the day in the week strip, then “Skip this day”.</p>
            {state.skips.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 border-b border-line-soft py-1.5">
                <span>
                  <span className="mono mr-2 text-xs text-muted">{fmtDay(s.date)}</span>
                  {s.blockName ?? blockName.get(s.blockId ?? "") ?? "Unknown block"}
                </span>
                <button className="linkbtn" type="button" onClick={() => run({ type: "skip.delete", id: s.id })}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === "notes" && (
          <div>
            <form
              className="mb-3 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (noteText.trim() && (await run({ type: "clashNote.create", date: noteDate, text: noteText.trim() }))) setNoteText("");
              }}
            >
              <input className="field sm w-auto" type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} aria-label="Date" required />
              <input className="field sm min-w-40 flex-1" placeholder="What collides?" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <button className="btn sm" type="submit">
                Add
              </button>
            </form>
            {[...state.clashNotes].reverse().map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-2 border-b border-line-soft py-1.5">
                <span>
                  <span className="mono mr-2 text-xs text-muted">{fmtShort(n.date)}</span>
                  {n.text}
                </span>
                <button className="linkbtn shrink-0" type="button" onClick={() => run({ type: "clashNote.delete", id: n.id })}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === "archived" && (
          <div>
            {archived.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 border-b border-line-soft py-1.5">
                <span>
                  {s.name} <span className="text-xs text-muted">· {s.area}</span>
                </span>
                <button className="linkbtn" type="button" onClick={() => run({ type: "section.update", id: s.id, patch: { archived: false } })}>
                  Unarchive
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ router

export function Editors() {
  const { editor, openEditor, state } = usePlanner();
  if (!editor) return null;
  const close = () => openEditor(null);
  switch (editor.kind) {
    case "task": {
      const task = state.tasks.find((t) => t.id === editor.id);
      return task ? <TaskEditor key={task.id} task={task} onClose={close} /> : null;
    }
    case "newTask":
      return <TaskEditor defaults={editor} onClose={close} />;
    case "event": {
      const ev = state.events.find((e) => e.id === editor.id);
      return ev ? <EventEditor key={ev.id} event={ev} onClose={close} /> : null;
    }
    case "newEvent":
      return <EventEditor date={editor.date} onClose={close} />;
    case "day":
      return <DayEditor key={editor.date} date={editor.date} onClose={close} />;
    case "section": {
      const s = state.sections.find((x) => x.id === editor.id);
      return s ? <SectionEditor key={s.id} section={s} onClose={close} /> : null;
    }
    case "newSection":
      return <SectionEditor area={editor.area} onClose={close} />;
    case "block": {
      const b = state.blocks.find((x) => x.id === editor.id);
      return b ? <BlockEditor key={b.id} block={b} onClose={close} /> : null;
    }
    case "newBlock":
      return <BlockEditor weekday={editor.weekday} onClose={close} />;
    case "schedule":
      return <ScheduleManager onClose={close} />;
  }
}

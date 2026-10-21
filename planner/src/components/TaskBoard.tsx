"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import type { Action } from "@/lib/actions";
import { norm } from "@/lib/match";
import { DEFAULT_AREAS, type PlannerState, type Section, type Task } from "@/lib/types";
import { TaskRow } from "./rows";
import { usePlanner } from "./store";

interface Filter {
  text: string;
  sectionId: string;
  dueOnly: boolean;
}

function matches(t: Task, f: Filter): boolean {
  if (f.dueOnly && !t.due) return false;
  if (f.sectionId && t.sectionId !== f.sectionId) return false;
  if (f.text) {
    const hay = norm(`${t.title} ${t.note ?? ""}`);
    if (!norm(f.text).split(" ").every((w) => hay.includes(w))) return false;
  }
  return true;
}

function SortableTask({ task, disabled }: { task: Task; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });
  return (
    <TaskRow
      task={task}
      rowRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dragging={isDragging}
      handle={
        disabled ? undefined : (
          <button type="button" className="grip" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Drag ${task.title}`}>
            ⋮⋮
          </button>
        )
      }
    />
  );
}

function SectionList({ section, ids, byId, dragDisabled }: { section: Section; ids: string[]; byId: Map<string, Task>; dragDisabled: boolean }) {
  const { mutate } = usePlanner();
  const { setNodeRef, isOver } = useDroppable({ id: `sec:${section.id}`, disabled: dragDisabled });
  const [draft, setDraft] = useState("");

  return (
    <div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`dropzone flat flex flex-col${isOver ? " over" : ""}`}>
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <SortableTask key={id} task={t} disabled={dragDisabled} /> : null;
          })}
        </div>
      </SortableContext>
      <form
        className="adder"
        onSubmit={async (e) => {
          e.preventDefault();
          const title = draft.trim();
          if (!title) return;
          setDraft("");
          await mutate([{ type: "task.create", data: { sectionId: section.id, title } }]);
        }}
      >
        <input className="field sm" placeholder="Add a task" aria-label={`Add a task to ${section.name}`} value={draft} onChange={(e) => setDraft(e.target.value)} />
        {draft.trim() && (
          <button className="btn sm" type="submit">
            Add
          </button>
        )}
      </form>
    </div>
  );
}

export function TaskBoard() {
  const { state, showDone, mutate, openEditor } = usePlanner();
  const [filter, setFilter] = useState<Filter>({ text: "", sectionId: "", dueOnly: false });
  const [drag, setDrag] = useState<{ activeId: string; columns: Record<string, string[]> } | null>(null);
  const filtering = !!(filter.text || filter.sectionId || filter.dueOnly);

  const sections = useMemo(() => state.sections.filter((s) => !s.archived).sort((a, b) => a.order - b.order), [state.sections]);
  const byId = useMemo(() => new Map(state.tasks.map((t) => [t.id, t])), [state.tasks]);

  // visible task ids per section, in order
  const baseColumns = useMemo(() => {
    const cols: Record<string, string[]> = {};
    for (const s of sections) cols[s.id] = [];
    for (const t of [...state.tasks].sort((a, b) => a.order - b.order)) {
      if (!cols[t.sectionId]) continue;
      if (t.completedAt && !showDone) continue;
      if (!matches(t, filter)) continue;
      cols[t.sectionId].push(t.id);
    }
    return cols;
  }, [sections, state.tasks, showDone, filter]);
  const columns = drag?.columns ?? baseColumns;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const containerOf = (id: string, cols: Record<string, string[]>) => {
    if (id.startsWith("sec:")) return id.slice(4);
    return Object.keys(cols).find((k) => cols[k].includes(id));
  };

  const onDragStart = (e: DragStartEvent) => setDrag({ activeId: String(e.active.id), columns: baseColumns });

  const onDragOver = (e: DragOverEvent) => {
    if (!drag || !e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    const from = containerOf(activeId, drag.columns);
    const to = containerOf(overId, drag.columns);
    if (!from || !to || from === to) return;
    const fromList = drag.columns[from].filter((x) => x !== activeId);
    const toList = [...drag.columns[to]];
    const idx = overId.startsWith("sec:") ? toList.length : Math.max(0, toList.indexOf(overId));
    toList.splice(idx, 0, activeId);
    setDrag({ ...drag, columns: { ...drag.columns, [from]: fromList, [to]: toList } });
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!drag) return;
    const activeId = String(e.active.id);
    const cols = { ...drag.columns };
    const to = e.over ? containerOf(String(e.over.id), cols) : undefined;
    const origin = state.tasks.find((t) => t.id === activeId)?.sectionId;
    setDrag(null);
    if (!to || !origin) return;
    const overId = String(e.over!.id);
    if (!overId.startsWith("sec:")) {
      const list = cols[to];
      const a = list.indexOf(activeId);
      const b = list.indexOf(overId);
      if (a >= 0 && b >= 0 && a !== b) {
        const next = [...list];
        next.splice(a, 1);
        next.splice(b, 0, activeId);
        cols[to] = next;
      }
    }
    const touched = new Set([origin, to]);
    const unchanged = [...touched].every((sid) => cols[sid].join() === baseColumns[sid].join());
    if (unchanged) return;

    // hidden (completed) tasks keep their place at the end of each section
    const actions: Action[] = [];
    const orderOf = new Map<string, { sectionId: string; order: number }>();
    for (const sid of touched) {
      const visible = cols[sid];
      const hidden = state.tasks
        .filter((t) => t.sectionId === sid && !visible.includes(t.id) && t.id !== activeId)
        .sort((x, y) => x.order - y.order)
        .map((t) => t.id);
      const ids = [...visible, ...hidden];
      ids.forEach((id, order) => orderOf.set(id, { sectionId: sid, order }));
      actions.push({ type: "task.reorder", sectionId: sid, ids });
    }
    const optimistic = (s: PlannerState): PlannerState => ({
      ...s,
      tasks: s.tasks.map((t) => (orderOf.has(t.id) ? { ...t, ...orderOf.get(t.id)! } : t)),
    });
    void mutate(actions, optimistic);
  };

  const areas = [...DEFAULT_AREAS, ...[...new Set(sections.map((s) => s.area))].filter((a) => !(DEFAULT_AREAS as readonly string[]).includes(a))];
  const inArea = (area: string) =>
    sections.filter((s) => s.area === area && (!filtering || columns[s.id]?.length));
  const openCount = (area: string) =>
    sections.filter((s) => s.area === area).reduce((n, s) => n + state.tasks.filter((t) => t.sectionId === s.id && !t.completedAt).length, 0);
  const matchCount = Object.values(columns).reduce((n, c) => n + c.length, 0);
  const activeTask = drag ? byId.get(drag.activeId) : undefined;

  const panel = (area: string) => (
    <div key={area}>
      <h2 className="sec">
        {area} <span className="n">{openCount(area) || ""}</span>
      </h2>
      <div className="panel">
        {inArea(area).map((s) => (
          <div key={s.id}>
            <button type="button" className="grouphd" onClick={() => openEditor({ kind: "section", id: s.id })} title="Edit section">
              {s.name}
            </button>
            <SectionList section={s} ids={columns[s.id] ?? []} byId={byId} dragDisabled={filtering} />
          </div>
        ))}
        {!filtering && (
          <button type="button" className="linkbtn mt-3 ml-1" onClick={() => openEditor({ kind: "newSection", area })}>
            + Section
          </button>
        )}
        {filtering && !inArea(area).length && <div className="empty">No matches here.</div>}
      </div>
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field max-w-xs flex-1"
            type="search"
            placeholder="Search tasks"
            aria-label="Search tasks"
            value={filter.text}
            onChange={(e) => setFilter({ ...filter, text: e.target.value })}
          />
          <select className="field w-auto max-w-[14rem]" aria-label="Filter by section" value={filter.sectionId} onChange={(e) => setFilter({ ...filter, sectionId: e.target.value })}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            <input type="checkbox" className="cb" checked={filter.dueOnly} onChange={(e) => setFilter({ ...filter, dueOnly: e.target.checked })} />
            Has due date
          </label>
          {filtering && (
            <>
              <span className="eyebrow">{matchCount} match{matchCount === 1 ? "" : "es"}</span>
              <button type="button" className="linkbtn" onClick={() => setFilter({ text: "", sectionId: "", dueOnly: false })}>
                Clear
              </button>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="sec">Coursework</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3.5">
          {inArea("Coursework").map((s) => (
            <div key={s.id} className="course">
              <div className="ch">
                <button type="button" className="code" onClick={() => openEditor({ kind: "section", id: s.id })} title="Edit section">
                  {s.name}
                </button>
                {s.credits != null && <div className="mono text-[11px] text-muted">{s.credits} cr</div>}
              </div>
              <div className="px-2.5 py-2">
                <SectionList section={s} ids={columns[s.id] ?? []} byId={byId} dragDisabled={filtering} />
              </div>
            </div>
          ))}
          {!filtering && (
            <button type="button" className="course flex min-h-24 items-center justify-center text-[13px] text-muted hover:text-ink" onClick={() => openEditor({ kind: "newSection", area: "Coursework" })}>
              + Add a course
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 items-start gap-[22px] md:grid-cols-2">{areas.filter((a) => a !== "Coursework").map(panel)}</section>

      <DragOverlay>{activeTask ? <div className="row shadow-lg"><div className="ttl">{activeTask.title}</div></div> : null}</DragOverlay>
    </DndContext>
  );
}

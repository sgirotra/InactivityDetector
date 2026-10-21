"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Action } from "@/lib/actions";
import { easternClock, type EasternClock } from "@/lib/dates";
import type { PlannerState } from "@/lib/types";

export type EditorTarget =
  | { kind: "task"; id: string }
  | { kind: "newTask"; sectionId?: string; due?: string }
  | { kind: "event"; id: string }
  | { kind: "newEvent"; date: string }
  | { kind: "day"; date: string }
  | { kind: "section"; id: string }
  | { kind: "newSection"; area: string }
  | { kind: "block"; id: string }
  | { kind: "newBlock"; weekday?: number }
  | { kind: "schedule" };

interface Toast {
  id: number;
  message: string;
  undo?: Action[];
}

interface Store {
  state: PlannerState;
  clock: EasternClock;
  today: string;
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  /** send actions; `optimistic` updates local state immediately */
  mutate: (actions: Action[], optimistic?: (s: PlannerState) => PlannerState) => Promise<boolean>;
  replaceState: (s: PlannerState) => void;
  toast: Toast | null;
  showToast: (message: string, undo?: Action[]) => void;
  dismissToast: () => void;
  editor: EditorTarget | null;
  openEditor: (t: EditorTarget | null) => void;
}

const Ctx = createContext<Store | null>(null);

export function usePlanner(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("usePlanner outside PlannerProvider");
  return s;
}

export function PlannerProvider({ initial, nowMs, children }: { initial: PlannerState; nowMs: number; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(() => new Date(nowMs));
  const [showDone, setShowDone] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  // tick the Eastern clock so the now-line, "today" and slipped items stay current
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        fetch("/api/state")
          .then((r) => (r.ok ? r.json() : null))
          .then((s) => s && setState(s))
          .catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, undo?: Action[]) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const mutate = useCallback(
    async (actions: Action[], optimistic?: (s: PlannerState) => PlannerState) => {
      const mine = ++seq.current;
      if (optimistic) setState((s) => optimistic(s));
      try {
        const res = await fetch("/api/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Save failed (${res.status})`);
        // a newer request will bring fresher state; don't clobber its optimistic update
        if (mine === seq.current) setState(body as PlannerState);
        return true;
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Save failed");
        fetch("/api/state")
          .then((r) => r.json())
          .then((s) => setState(s))
          .catch(() => undefined);
        return false;
      }
    },
    [showToast],
  );

  const clock = useMemo(() => easternClock(now), [now]);

  const value: Store = {
    state,
    clock,
    today: clock.date,
    showDone,
    setShowDone,
    mutate,
    replaceState: setState,
    toast,
    showToast,
    dismissToast,
    editor,
    openEditor: setEditor,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const stampNow = () => new Date().toISOString();

/** Local mirror of a completion so the row stays gone while the request is in flight. */
export function markDone(kind: "task" | "event" | "focus", id: string, done: boolean) {
  const at = done ? stampNow() : null;
  return (s: PlannerState): PlannerState => {
    if (kind === "task") return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, completedAt: at } : t)) };
    if (kind === "event") return { ...s, events: s.events.map((e) => (e.id === id ? { ...e, completedAt: at } : e)) };
    return {
      ...s,
      focusLists: s.focusLists.map((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, completedAt: at } : i)) })),
    };
  };
}

export function completeAction(kind: "task" | "event" | "focus", id: string, done: boolean): Action {
  if (kind === "task") return { type: "task.complete", id, done };
  if (kind === "event") return { type: "event.complete", id, done };
  return { type: "focus.completeItem", id, done };
}

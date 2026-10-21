"use client";

import { slippedItems } from "@/lib/board";
import { fmtShort } from "@/lib/dates";
import { CheckRow } from "./rows";
import { usePlanner } from "./store";

export function Slipped() {
  const { state, today, openEditor } = usePlanner();
  const items = slippedItems(state, today);
  if (!items.length) return null;
  return (
    <section className="slip">
      <h3 className="m-0 mb-1 text-base font-semibold text-brick">
        Slipped — {items.length} item{items.length > 1 ? "s" : ""}
      </h3>
      <p className="m-0 mb-3 text-[13px] text-muted">
        Dates that passed without a tick. Check them off if they happened, or open one to reschedule it.
      </p>
      <div className="flex flex-col">
        {items.map((i) => (
          <CheckRow
            key={`${i.kind}:${i.id}`}
            kind={i.kind}
            id={i.id}
            title={i.title}
            note={i.note}
            done={false}
            chips={[
              ...(i.group ? [{ cls: "chip tag", label: i.group }] : []),
              { cls: "chip due-past", label: `${fmtShort(i.date)} · ${i.daysLate}d late` },
            ]}
            onOpen={() => openEditor(i.kind === "task" ? { kind: "task", id: i.id } : { kind: "event", id: i.id })}
          />
        ))}
      </div>
    </section>
  );
}

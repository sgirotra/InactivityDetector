import { DEFAULT_ALIASES } from "../defaults";
import type { PlannerState } from "../types";
import { prisma } from "./db";

export interface ImportReport {
  created: number;
  updated: number;
  unchanged: number;
  skipped: string[];
}

const toDate = (s: string | null) => (s ? new Date(s) : null);

/**
 * Merge records into the database by id. Nothing is ever deleted.
 * - "keep": insert missing rows, leave existing rows alone (seeding; safe to rerun).
 * - "overwrite": insert missing rows and update existing ones to the imported values.
 */
export async function importState(state: PlannerState, mode: "keep" | "overwrite"): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, unchanged: 0, skipped: [] };

  await prisma.$transaction(
    async (tx) => {
      // upsert helper: count what happened without caring which model it is
      const merge = async <T>(exists: boolean, create: () => Promise<T>, update: () => Promise<T>) => {
        if (!exists) {
          await create();
          report.created++;
        } else if (mode === "overwrite") {
          await update();
          report.updated++;
        } else {
          report.unchanged++;
        }
      };

      for (const s of state.sections) {
        const data = { ...s, aliases: s.aliases || DEFAULT_ALIASES[s.id] || "" };
        const exists = !!(await tx.section.findUnique({ where: { id: s.id } }));
        await merge(exists, () => tx.section.create({ data }), () => tx.section.update({ where: { id: s.id }, data: s }));
      }

      const sectionIds = new Set((await tx.section.findMany({ select: { id: true } })).map((s) => s.id));
      for (const t of state.tasks) {
        if (!sectionIds.has(t.sectionId)) {
          report.skipped.push(`task ${t.id}: unknown section ${t.sectionId}`);
          continue;
        }
        const data = { ...t, completedAt: toDate(t.completedAt), createdAt: toDate(t.createdAt) ?? new Date() };
        const exists = !!(await tx.task.findUnique({ where: { id: t.id } }));
        await merge(exists, () => tx.task.create({ data }), () => tx.task.update({ where: { id: t.id }, data }));
      }

      for (const b of state.blocks) {
        const exists = !!(await tx.recurringBlock.findUnique({ where: { id: b.id } }));
        await merge(exists, () => tx.recurringBlock.create({ data: b }), () => tx.recurringBlock.update({ where: { id: b.id }, data: b }));
      }

      for (const e of state.events) {
        const data = { ...e, completedAt: toDate(e.completedAt) };
        const exists = !!(await tx.event.findUnique({ where: { id: e.id } }));
        await merge(exists, () => tx.event.create({ data }), () => tx.event.update({ where: { id: e.id }, data }));
      }

      for (const d of state.daysOff) {
        const exists = !!(await tx.dayOff.findUnique({ where: { date: d.date } }));
        await merge(exists, () => tx.dayOff.create({ data: d }), () => tx.dayOff.update({ where: { date: d.date }, data: d }));
      }

      for (const s of state.skips) {
        // a skip is identified by its id, or by the same block on the same date
        const exists = !!(await tx.blockSkip.findFirst({
          where: {
            OR: [
              { id: s.id },
              { date: s.date, blockId: s.blockId ?? undefined, blockName: s.blockName ?? undefined },
            ],
          },
        }));
        await merge(exists, () => tx.blockSkip.create({ data: s }), async () => undefined);
      }

      for (const l of state.focusLists) {
        const exists = !!(await tx.focusList.findUnique({ where: { date: l.date } }));
        await merge(
          exists,
          () => tx.focusList.create({ data: { date: l.date, label: l.label } }),
          () => tx.focusList.update({ where: { date: l.date }, data: { label: l.label } }),
        );
        for (const i of l.items) {
          const data = { ...i, completedAt: toDate(i.completedAt) };
          const itemExists = !!(await tx.focusItem.findUnique({ where: { id: i.id } }));
          await merge(itemExists, () => tx.focusItem.create({ data }), () => tx.focusItem.update({ where: { id: i.id }, data }));
        }
      }

      for (const c of state.clashNotes) {
        const exists = !!(await tx.clashNote.findFirst({ where: { OR: [{ id: c.id }, { date: c.date, text: c.text }] } }));
        await merge(exists, () => tx.clashNote.create({ data: c }), async () => undefined);
      }
    },
    { timeout: 60_000 },
  );

  return report;
}

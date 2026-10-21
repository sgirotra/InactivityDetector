import type { Action } from "../actions";
import { slug } from "../transfer";
import type { Tx } from "./db";

export class ActionError extends Error {}

export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
}

async function nextTaskOrder(tx: Tx, sectionId: string): Promise<number> {
  const last = await tx.task.findFirst({ where: { sectionId }, orderBy: { order: "desc" } });
  return (last?.order ?? -1) + 1;
}

async function requireSection(tx: Tx, id: string) {
  if (!(await tx.section.findUnique({ where: { id } }))) throw new ActionError(`Unknown section ${id}`);
}

function stamp(done: boolean): Date | null {
  return done ? new Date() : null;
}

export async function applyAction(tx: Tx, a: Action): Promise<void> {
  switch (a.type) {
    case "task.create": {
      const { id, ...data } = a.data;
      await requireSection(tx, data.sectionId);
      await tx.task.create({
        data: { ...data, id: id ?? newId("t"), order: await nextTaskOrder(tx, data.sectionId) },
      });
      return;
    }
    case "task.update": {
      const cur = await tx.task.findUnique({ where: { id: a.id } });
      if (!cur) throw new ActionError(`Unknown task ${a.id}`);
      const patch: typeof a.patch & { order?: number } = { ...a.patch };
      if (patch.sectionId && patch.sectionId !== cur.sectionId) {
        await requireSection(tx, patch.sectionId);
        patch.order = await nextTaskOrder(tx, patch.sectionId);
      }
      await tx.task.update({ where: { id: a.id }, data: patch });
      return;
    }
    case "task.complete":
      await tx.task.update({ where: { id: a.id }, data: { completedAt: stamp(a.done) } });
      return;
    case "task.delete":
      await tx.task.delete({ where: { id: a.id } });
      return;
    case "task.reorder": {
      await requireSection(tx, a.sectionId);
      for (const [order, id] of a.ids.entries()) {
        await tx.task.update({ where: { id }, data: { sectionId: a.sectionId, order } });
      }
      return;
    }

    case "event.create": {
      const { id, ...data } = a.data;
      await tx.event.create({ data: { ...data, category: data.category ?? "", id: id ?? newId("e") } });
      return;
    }
    case "event.update":
      await tx.event.update({ where: { id: a.id }, data: a.patch });
      return;
    case "event.complete":
      await tx.event.update({ where: { id: a.id }, data: { completedAt: stamp(a.done) } });
      return;
    case "event.delete":
      await tx.event.delete({ where: { id: a.id } });
      return;

    case "block.create":
      await tx.recurringBlock.create({
        data: { ...a.data, kind: a.data.kind ?? "", id: `blk-${a.data.weekday}-${a.data.start.replace(":", "")}-${slug(a.data.name)}-${newId("")}` },
      });
      return;
    case "block.update":
      await tx.recurringBlock.update({ where: { id: a.id }, data: a.patch });
      return;
    case "block.delete":
      await tx.blockSkip.deleteMany({ where: { blockId: a.id } });
      await tx.recurringBlock.delete({ where: { id: a.id } });
      return;

    case "section.create": {
      const { id, ...data } = a.data;
      const last = await tx.section.findFirst({ orderBy: { order: "desc" } });
      let sid = id ?? (slug(data.name) || newId("s"));
      if (await tx.section.findUnique({ where: { id: sid } })) sid = `${sid}-${newId("")}`;
      await tx.section.create({ data: { ...data, id: sid, order: (last?.order ?? -1) + 1 } });
      return;
    }
    case "section.update":
      await tx.section.update({ where: { id: a.id }, data: a.patch });
      return;
    case "section.delete":
      // tasks cascade with the section
      await tx.section.delete({ where: { id: a.id } });
      return;
    case "section.reorder":
      for (const [order, id] of a.ids.entries()) await tx.section.update({ where: { id }, data: { order } });
      return;

    case "dayOff.set":
      await tx.dayOff.upsert({ where: { date: a.date }, create: { date: a.date, label: a.label }, update: { label: a.label } });
      return;
    case "dayOff.delete":
      await tx.dayOff.deleteMany({ where: { date: a.date } });
      return;

    case "skip.create": {
      if (!a.blockId && !a.blockName) throw new ActionError("A skip needs a block");
      const exists = await tx.blockSkip.findFirst({
        where: { date: a.date, ...(a.blockId ? { blockId: a.blockId } : { blockName: a.blockName }) },
      });
      if (!exists) {
        await tx.blockSkip.create({
          data: { id: `skip-${a.date}-${slug(a.blockName ?? a.blockId ?? "")}-${newId("")}`, date: a.date, blockId: a.blockId, blockName: a.blockName },
        });
      }
      return;
    }
    case "skip.delete":
      await tx.blockSkip.delete({ where: { id: a.id } });
      return;

    case "clashNote.create":
      await tx.clashNote.create({ data: { id: newId("c"), date: a.date, text: a.text } });
      return;
    case "clashNote.update":
      await tx.clashNote.update({ where: { id: a.id }, data: { text: a.text } });
      return;
    case "clashNote.delete":
      await tx.clashNote.delete({ where: { id: a.id } });
      return;

    case "focus.addItems": {
      await tx.focusList.upsert({ where: { date: a.date }, create: { date: a.date }, update: {} });
      const last = await tx.focusItem.findFirst({ where: { listDate: a.date }, orderBy: { order: "desc" } });
      let order = (last?.order ?? -1) + 1;
      for (const it of a.items) {
        await tx.focusItem.create({
          data: { id: newId("n"), listDate: a.date, title: it.title, note: it.note ?? null, linkedTaskId: it.linkedTaskId ?? null, order: order++ },
        });
      }
      return;
    }
    case "focus.setLabel":
      await tx.focusList.upsert({ where: { date: a.date }, create: { date: a.date, label: a.label }, update: { label: a.label } });
      return;
    case "focus.updateItem":
      await tx.focusItem.update({ where: { id: a.id }, data: a.patch });
      return;
    case "focus.completeItem": {
      const item = await tx.focusItem.update({ where: { id: a.id }, data: { completedAt: stamp(a.done) } });
      // checking a focus item that points at a task checks the task too
      if (item.linkedTaskId) {
        await tx.task.updateMany({ where: { id: item.linkedTaskId }, data: { completedAt: stamp(a.done) } });
      }
      return;
    }
    case "focus.deleteItem":
      await tx.focusItem.delete({ where: { id: a.id } });
      return;
    case "focus.reorder":
      for (const [order, id] of a.ids.entries()) {
        await tx.focusItem.update({ where: { id }, data: { order, listDate: a.date } });
      }
      return;
    case "focus.rollover": {
      const open = await tx.focusItem.findMany({ where: { listDate: a.from, completedAt: null }, orderBy: { order: "asc" } });
      if (!open.length) return;
      await tx.focusList.upsert({ where: { date: a.to }, create: { date: a.to }, update: {} });
      const last = await tx.focusItem.findFirst({ where: { listDate: a.to }, orderBy: { order: "desc" } });
      let order = (last?.order ?? -1) + 1;
      for (const it of open) await tx.focusItem.update({ where: { id: it.id }, data: { listDate: a.to, order: order++ } });
      return;
    }
    case "focus.deleteList":
      await tx.focusList.deleteMany({ where: { date: a.date } });
      return;
  }
}

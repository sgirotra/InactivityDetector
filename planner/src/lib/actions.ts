import { z } from "zod";

// Every write the UI can make, as one zod-validated discriminated union. The
// client sends a batch of these to POST /api/mutate; the server applies them in
// a single transaction and returns the fresh state.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");
const id = z.string().min(1).max(100);
const title = z.string().trim().min(1).max(500);
const text = z.string().trim().max(2000);
const nullableText = text.nullable().transform((v) => (v ? v : null));
const priority = z.number().int().min(1).max(3).nullable();

const taskFields = z.object({
  title,
  note: nullableText,
  due: date.nullable(),
  dueTime: time.nullable(),
  priority,
  sectionId: id,
});

const eventFields = z.object({
  date,
  start: time.nullable(),
  end: time.nullable(),
  title,
  category: text,
  note: nullableText,
});

const blockFields = z.object({
  weekday: z.number().int().min(0).max(6),
  start: time,
  end: time,
  name: title,
  kind: text,
  survivesDaysOff: z.boolean(),
  activeFrom: date.nullable(),
  activeUntil: date.nullable(),
});

const sectionFields = z.object({
  area: title,
  name: title,
  credits: z.number().int().min(0).max(30).nullable(),
  aliases: text,
  archived: z.boolean(),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.create"), data: taskFields.partial({ note: true, due: true, dueTime: true, priority: true }).extend({ id: id.optional() }) }),
  z.object({ type: z.literal("task.update"), id, patch: taskFields.partial() }),
  z.object({ type: z.literal("task.complete"), id, done: z.boolean() }),
  z.object({ type: z.literal("task.delete"), id }),
  z.object({ type: z.literal("task.reorder"), sectionId: id, ids: z.array(id).max(1000) }),

  z.object({ type: z.literal("event.create"), data: eventFields.partial({ start: true, end: true, note: true, category: true }).extend({ id: id.optional() }) }),
  z.object({ type: z.literal("event.update"), id, patch: eventFields.partial() }),
  z.object({ type: z.literal("event.complete"), id, done: z.boolean() }),
  z.object({ type: z.literal("event.delete"), id }),

  z.object({ type: z.literal("block.create"), data: blockFields.partial({ kind: true, survivesDaysOff: true, activeFrom: true, activeUntil: true }) }),
  z.object({ type: z.literal("block.update"), id, patch: blockFields.partial() }),
  z.object({ type: z.literal("block.delete"), id }),

  z.object({ type: z.literal("section.create"), data: sectionFields.partial({ credits: true, aliases: true, archived: true }).extend({ id: id.optional() }) }),
  z.object({ type: z.literal("section.update"), id, patch: sectionFields.partial() }),
  z.object({ type: z.literal("section.delete"), id }),
  z.object({ type: z.literal("section.reorder"), ids: z.array(id).max(500) }),

  z.object({ type: z.literal("dayOff.set"), date, label: title }),
  z.object({ type: z.literal("dayOff.delete"), date }),

  z.object({ type: z.literal("skip.create"), date, blockId: id.nullable(), blockName: z.string().nullable() }),
  z.object({ type: z.literal("skip.delete"), id }),

  z.object({ type: z.literal("clashNote.create"), date, text: title }),
  z.object({ type: z.literal("clashNote.update"), id, text: title }),
  z.object({ type: z.literal("clashNote.delete"), id }),

  z.object({
    type: z.literal("focus.addItems"),
    date,
    items: z.array(z.object({ title, note: nullableText.optional(), linkedTaskId: id.nullable().optional() })).min(1).max(50),
  }),
  z.object({ type: z.literal("focus.setLabel"), date, label: nullableText }),
  z.object({ type: z.literal("focus.updateItem"), id, patch: z.object({ title, note: nullableText }).partial() }),
  z.object({ type: z.literal("focus.completeItem"), id, done: z.boolean() }),
  z.object({ type: z.literal("focus.deleteItem"), id }),
  z.object({ type: z.literal("focus.reorder"), date, ids: z.array(id).max(200) }),
  z.object({ type: z.literal("focus.rollover"), from: date, to: date }),
  z.object({ type: z.literal("focus.deleteList"), date }),
]);

export const mutateSchema = z.object({ actions: z.array(actionSchema).min(1).max(200) });

export type Action = z.infer<typeof actionSchema>;
export type ActionType = Action["type"];

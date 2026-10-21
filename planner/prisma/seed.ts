// Loads data/seed-data.json into the database. Original ids are kept, and rows
// that already exist are left untouched, so running it twice changes nothing.
//   npm run db:seed              insert anything missing
//   npm run db:seed -- --reset   wipe the database first, then seed
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/server/db";
import { importState } from "../src/lib/server/importer";
import { normalizeTransfer, transferSchema } from "../src/lib/transfer";

async function main() {
  const file = process.argv.find((a) => a.endsWith(".json")) ?? path.join(__dirname, "..", "data", "seed-data.json");
  const data = normalizeTransfer(transferSchema.parse(JSON.parse(readFileSync(file, "utf8"))));

  if (process.argv.includes("--reset")) {
    await prisma.$transaction([
      prisma.focusItem.deleteMany(),
      prisma.focusList.deleteMany(),
      prisma.task.deleteMany(),
      prisma.section.deleteMany(),
      prisma.event.deleteMany(),
      prisma.blockSkip.deleteMany(),
      prisma.recurringBlock.deleteMany(),
      prisma.dayOff.deleteMany(),
      prisma.clashNote.deleteMany(),
    ]);
    console.log("Database cleared.");
  }

  const r = await importState(data, "keep");
  console.log(`Seeded from ${path.basename(file)}: ${r.created} created, ${r.unchanged} already present.`);
  for (const s of r.skipped) console.warn(`  skipped ${s}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

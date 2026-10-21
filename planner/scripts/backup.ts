// Writes a JSON backup (same shape as data/seed-data.json) to ./backups.
//   npm run backup
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { todayET } from "../src/lib/dates";
import { prisma } from "../src/lib/server/db";
import { loadState } from "../src/lib/server/state";
import { toTransfer } from "../src/lib/transfer";

async function main() {
  const dir = path.join(__dirname, "..", "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(11, 16).replace(":", "");
  const file = path.join(dir, `planner-${todayET()}-${stamp}Z.json`);
  writeFileSync(file, JSON.stringify(toTransfer(await loadState()), null, 2));
  console.log(`Backup written to ${path.relative(process.cwd(), file)}`);
}

main().finally(() => prisma.$disconnect());

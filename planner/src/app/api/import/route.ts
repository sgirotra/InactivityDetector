import { NextResponse } from "next/server";
import { importState } from "@/lib/server/importer";
import { loadState } from "@/lib/server/state";
import { normalizeTransfer, transferSchema } from "@/lib/transfer";

export const dynamic = "force-dynamic";

// Merges a backup (or the original seed file) into the database. Matching ids are
// updated to the file's values, new ids are added, and nothing is deleted.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That file doesn't look like a planner backup.", issues: parsed.error.issues.slice(0, 10) }, { status: 400 });
  }
  const report = await importState(normalizeTransfer(parsed.data), "overwrite");
  return NextResponse.json({ report, state: await loadState() });
}

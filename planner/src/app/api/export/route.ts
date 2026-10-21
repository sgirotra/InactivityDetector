import { NextResponse } from "next/server";
import { todayET } from "@/lib/dates";
import { loadState } from "@/lib/server/state";
import { toTransfer } from "@/lib/transfer";

export const dynamic = "force-dynamic";

export async function GET() {
  const body = JSON.stringify(toTransfer(await loadState()), null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="planner-backup-${todayET()}.json"`,
    },
  });
}

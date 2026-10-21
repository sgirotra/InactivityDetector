import { NextResponse } from "next/server";
import { loadState } from "@/lib/server/state";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadState());
}

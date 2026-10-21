import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { mutateSchema } from "@/lib/actions";
import { ActionError, applyAction } from "@/lib/server/apply";
import { prisma } from "@/lib/server/db";
import { loadState } from "@/lib/server/state";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = mutateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    await prisma.$transaction(async (tx) => {
      for (const action of parsed.data.actions) await applyAction(tx, action);
    });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
    }
    throw e;
  }
  return NextResponse.json(await loadState());
}

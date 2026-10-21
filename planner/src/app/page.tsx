import { Planner } from "@/components/Planner";
import { loadState } from "@/lib/server/state";

export const dynamic = "force-dynamic";

export default async function Page() {
  const state = await loadState();
  return <Planner initial={state} nowMs={Date.now()} />;
}

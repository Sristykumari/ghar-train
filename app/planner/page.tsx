import type { Metadata } from "next";
import { Suspense } from "react";
import { PlannerView } from "@/components/planner/planner-view";
import { LoadingState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Find a faster train" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <PlannerView />
    </Suspense>
  );
}

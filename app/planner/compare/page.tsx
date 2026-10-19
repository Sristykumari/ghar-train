import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparisonView } from "@/components/planner/comparison-view";
import { LoadingState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Compare routes" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <ComparisonView />
    </Suspense>
  );
}

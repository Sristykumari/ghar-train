import type { Metadata } from "next";
import { Suspense } from "react";
import { JourneyDetail } from "@/components/planner/journey-detail";
import { LoadingState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Journey details" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <JourneyDetail />
    </Suspense>
  );
}

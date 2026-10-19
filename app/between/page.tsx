import type { Metadata } from "next";
import { Suspense } from "react";
import { BetweenView } from "@/components/between/between-view";
import { LoadingState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Trains between stations" };

export default function BetweenPage() {
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <BetweenView />
    </Suspense>
  );
}

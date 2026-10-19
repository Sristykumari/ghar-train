import { Suspense } from "react";
import { TrainRouteView } from "@/components/train/train-route-view";
import { LoadingState } from "@/components/ui/states";

async function Content({ params }: { params: PageProps<"/train/[number]/route">["params"] }) {
  const { number } = await params;
  return <TrainRouteView number={decodeURIComponent(number)} />;
}

export default function TrainRoutePage({ params }: PageProps<"/train/[number]/route">) {
  return (
    <Suspense fallback={<LoadingState label="Loading timetable" rows={6} />}>
      <Content params={params} />
    </Suspense>
  );
}

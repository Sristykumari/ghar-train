import { Suspense } from "react";
import { TrainLiveView } from "@/components/train/train-live-view";
import { LoadingState } from "@/components/ui/states";

async function Content({ params }: { params: PageProps<"/train/[number]">["params"] }) {
  const { number } = await params;
  return <TrainLiveView number={decodeURIComponent(number)} />;
}

export default function TrainPage({ params }: PageProps<"/train/[number]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading train status" rows={5} />}>
      <Content params={params} />
    </Suspense>
  );
}

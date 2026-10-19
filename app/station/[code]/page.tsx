import { Suspense } from "react";
import { StationBoardView } from "@/components/station/station-board-view";
import { LoadingState } from "@/components/ui/states";

async function Content({ params }: { params: PageProps<"/station/[code]">["params"] }) {
  const { code } = await params;
  return <StationBoardView code={decodeURIComponent(code).toUpperCase()} />;
}

export default function StationPage({ params }: PageProps<"/station/[code]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading station board" rows={6} />}>
      <Content params={params} />
    </Suspense>
  );
}

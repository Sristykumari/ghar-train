import { Suspense } from "react";
import { ApproachingView } from "@/components/station/approaching-view";
import { LoadingState } from "@/components/ui/states";

async function Content({ params }: { params: PageProps<"/station/[code]/approaching">["params"] }) {
  const { code } = await params;
  return <ApproachingView code={decodeURIComponent(code).toUpperCase()} />;
}

export default function ApproachingPage({ params }: PageProps<"/station/[code]/approaching">) {
  return (
    <Suspense fallback={<LoadingState label="Loading approaching trains" rows={4} />}>
      <Content params={params} />
    </Suspense>
  );
}

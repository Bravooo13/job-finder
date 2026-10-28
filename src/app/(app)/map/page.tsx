import { PageHeader } from "@/components/layout/PageHeader";
import { JobsMap } from "@/components/map/JobsMap";
import { getMapData } from "@/lib/map/queries";

export const metadata = { title: "Map" };
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { points, remote } = await getMapData();
  return (
    <>
      <PageHeader title="Map" description="Where your saved jobs and new finds are. Pick a city to see what's there." />
      <JobsMap points={points} remote={remote} />
    </>
  );
}

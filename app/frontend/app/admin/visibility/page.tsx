import VisibilityWorkspace from "@/components/admin/VisibilityWorkspace";
import { buildBdcVisibilityOptions } from "@/lib/bdc-visibility";
import { getOfficialRosters } from "@/lib/official-rosters";

export default async function VisibilityPage() {
  return <VisibilityWorkspace bdcOptions={buildBdcVisibilityOptions(await getOfficialRosters(2027))} />;
}

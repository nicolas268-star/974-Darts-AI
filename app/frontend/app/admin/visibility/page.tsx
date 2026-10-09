import VisibilityWorkspace from "@/components/admin/VisibilityWorkspace";
import { buildBdcVisibilityOptions } from "@/lib/bdc-visibility";

export default function VisibilityPage() {
  return <VisibilityWorkspace bdcOptions={buildBdcVisibilityOptions()} />;
}

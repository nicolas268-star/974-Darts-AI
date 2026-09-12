import { BdcRoundTemplate } from "@/components/BdcRoundTemplate";
import details from "@/lib/bdc-round-one-details.json";
import source from "@/lib/bdc-round-one.json";

export function BdcRoundOne() {
  return <BdcRoundTemplate details={details} source={source} />;
}

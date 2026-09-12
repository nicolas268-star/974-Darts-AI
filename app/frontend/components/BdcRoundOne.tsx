import { BdcRoundTemplate } from "@/components/BdcRoundTemplate";
import detailsData from "@/lib/bdc-round-one-details.json";
import source from "@/lib/bdc-round-one.json";
import { applyBdcRoundOneValidatedFinishes, type BdcRoundDetails } from "@/lib/bdc-player-profile";

const details = applyBdcRoundOneValidatedFinishes(detailsData as BdcRoundDetails);

export function BdcRoundOne() {
  return <BdcRoundTemplate details={details} source={source} />;
}

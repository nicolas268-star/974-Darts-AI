import type { Metadata } from "next";
import { UpcomingMvpSeason } from "../UpcomingMvpSeason";

export const metadata: Metadata = {
  title: "MVP 2028 | 974 Darts AI",
  description: "Future page du classement analytique MVP 2028.",
};

export default function Mvp2028Page() {
  return <UpcomingMvpSeason season="2028" />;
}

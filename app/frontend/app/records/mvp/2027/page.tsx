import type { Metadata } from "next";
import { UpcomingMvpSeason } from "../UpcomingMvpSeason";

export const metadata: Metadata = {
  title: "MVP 2027 | 974 Darts AI",
  description: "Future page du classement analytique MVP 2027.",
};

export default function Mvp2027Page() {
  return <UpcomingMvpSeason season="2027" />;
}

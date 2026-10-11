import type { Metadata } from "next";
import { MvpSeasonPage } from "../MvpSeasonPage";

export const metadata: Metadata = {
  title: "MVP 2028",
  description: "Classement analytique MVP du championnat 974 pour la saison 2028.",
};

export default function Mvp2028Page() {
  return <MvpSeasonPage season="2028" />;
}

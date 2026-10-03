import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import VisionLab from "./VisionLab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Laboratoire de vision privé | 974Darts",
  robots: { index: false, follow: false },
};

export default async function VisionLabPage() {
  // Repeat the guard at the page boundary; client navigation must not rely only on the parent layout.
  await requireAdmin();
  return <VisionLab />;
}

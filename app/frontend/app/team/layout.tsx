
import { requireRole } from "@/lib/auth/session";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["CAPTAIN", "ADMIN"]);
  return children;
}

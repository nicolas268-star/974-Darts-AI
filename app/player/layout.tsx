
import { requireRole } from "@/lib/auth/session";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["PLAYER", "CAPTAIN", "ADMIN"]);
  return children;
}

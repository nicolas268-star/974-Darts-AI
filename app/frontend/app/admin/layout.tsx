import type { ReactNode } from "react";
import AdminNavigation from "@/components/admin/AdminNavigation";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <>
      <AdminNavigation matchDayEnabled={process.env.MATCH_DAY_ENABLED === "true"} />
      {children}
    </>
  );
}

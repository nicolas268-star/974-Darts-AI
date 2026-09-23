import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";
import RankingWorkflow from "@/components/ranking/RankingWorkflow";
export default async function SportsDirectorPage() {
  const auth = await requireRole(["SPORTS_DIRECTOR"]);
  return (
    <>
      <nav
        style={{
          display: "flex",
          gap: 20,
          padding: "18px 24px",
          background: "#071426",
          color: "white",
        }}
      >
        <Link href="/">974 Darts</Link>
        <span>{auth.profile?.display_name} · Directeur sportif</span>
        <LogoutButton />
      </nav>
      <RankingWorkflow
        role="SPORTS_DIRECTOR"
        enabled={process.env.RANKING_WORKFLOW_ENABLED === "true"}
      />
    </>
  );
}

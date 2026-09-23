import RankingWorkflow from "@/components/ranking/RankingWorkflow";
export default function CommitteeRankingAdminPage() {
  return <RankingWorkflow role="ADMIN" enabled={process.env.RANKING_WORKFLOW_ENABLED === "true"} />;
}

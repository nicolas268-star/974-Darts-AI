import { redirect } from "next/navigation";

export default async function LegacyTeamPage({
  params,
}: {
  params: Promise<{ team_id: string }>;
}) {
  const { team_id } = await params;
  redirect(`/teams/${encodeURIComponent(team_id)}`);
}

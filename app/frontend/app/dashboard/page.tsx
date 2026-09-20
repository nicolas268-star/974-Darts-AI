import { redirect } from "next/navigation";

export default async function LegacyDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season } = await searchParams;
  const years = String(season ?? "").match(/20\d{2}/g);
  const selectedYear = years?.at(-1) ?? "2027";
  redirect(`/championships/${selectedYear}`);
}

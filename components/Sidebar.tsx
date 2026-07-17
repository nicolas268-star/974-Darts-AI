
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link href="/dashboard">🏠 Vue générale</Link>
      <Link href="/player">👤 Mon profil</Link>
      <Link href="/team">👥 Mon équipe</Link>
      <Link href="/admin">🛡️ Administration</Link>
      <div style={{ marginTop: "auto", paddingTop: 12 }}>
        <LogoutButton />
      </div>
    </aside>
  );
}

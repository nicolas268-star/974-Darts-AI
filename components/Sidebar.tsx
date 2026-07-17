import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
export function Sidebar(){return <aside className="sidebar"><Link href="/dashboard">Classement</Link><Link href="/teams">Équipes</Link><Link href="/players">Joueurs</Link><Link href="/player">Mon espace</Link><Link href="/admin">Administration</Link><Link href="/admin/rules">Règles</Link><LogoutButton/></aside>}

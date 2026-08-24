import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { ClockGame } from "./ClockGame";
import "../play-game-shared.css";
import "../bob27/bob27.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Tour de l’horloge",description:"Around the Clock dans 974Darts Play.",robots:{index:false,follow:false}};
export default async function ClockPage(){const auth=await requireUser();return <div className="dashboard"><Sidebar/><main className="main practice-page"><ClockGame currentDisplayName={auth.profile?.display_name??auth.user?.email??"Joueur 1"}/></main></div>;}

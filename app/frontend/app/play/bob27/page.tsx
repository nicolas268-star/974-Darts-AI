import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { Bob27Game } from "./Bob27Game";
import "../play-game-shared.css";
import "./bob27.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Bob's 27",description:"Bob's 27 dans 974Darts Play.",robots:{index:false,follow:false}};
export default async function Bob27Page(){const auth=await requireUser();return <div className="dashboard"><Sidebar/><main className="main practice-page"><Bob27Game currentDisplayName={auth.profile?.display_name??auth.user?.email??"Joueur 1"}/></main></div>;}

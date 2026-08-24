import { Sidebar } from "@/components/Sidebar";
import CalendarManager from "./CalendarManager";

export default function AdminCalendarPage() {
  return <div className="dashboard"><Sidebar /><main className="main"><CalendarManager /></main></div>;
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const excluded = ["/admin", "/login", "/auth", "/forgot-password", "/update-password"];

function deviceType() {
  if (window.innerWidth < 700) return "mobile";
  if (window.innerWidth < 1100) return "tablet";
  return "desktop";
}

export default function AudienceTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || excluded.some((prefix) => pathname.startsWith(prefix))) return;
    let session = sessionStorage.getItem("974-audience-session");
    if (!session) {
      session = crypto.randomUUID();
      sessionStorage.setItem("974-audience-session", session);
    }
    void fetch("/api/audience", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_type: "page_view", path: pathname, device: deviceType(), session }),
      keepalive: true,
    });
  }, [pathname]);
  return null;
}

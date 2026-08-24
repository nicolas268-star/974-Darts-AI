import { NextRequest } from "next/server";

import { proxyPublicationRequest } from "../_shared/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return proxyPublicationRequest(request, {
    backendPath: "/api/v1/import/execute-publication",
    requirePublicationConfirmation: true,
  });
}

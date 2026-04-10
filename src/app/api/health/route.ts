import { NextResponse } from "next/server";

/** GET /api/health — liveness for local-service / load balancers. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "dailywork", role: "web" });
}

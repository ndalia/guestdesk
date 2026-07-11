import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (secret && request.headers.get("dodo-signature") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  return NextResponse.json({
    received: true,
    note: "Payment webhook signature gate is present. Wire provider event IDs to checkoutSessions after Dodo dashboard credentials are configured.",
    eventType: body.type ?? body.event_type
  });
}

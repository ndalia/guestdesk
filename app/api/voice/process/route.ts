import { NextRequest, NextResponse } from "next/server";
import { processGuestRequest } from "../../../../lib/orchestrator";

function authorized(request: NextRequest) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  const signature = request.headers.get("x-elevenlabs-signature");
  return auth === `Bearer ${secret}` || signature === secret;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const response = await processGuestRequest({
      conversationId: String(body.conversationId),
      restaurantId: String(body.restaurantId ?? "freekeh"),
      customerId: body.customerId ? String(body.customerId) : null,
      message: String(body.message),
      knownFields: body.knownFields ?? {},
      channel: body.channel ?? "voice"
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { status: "failed", spokenResponse: "I hit a system issue and could not complete that request.", error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

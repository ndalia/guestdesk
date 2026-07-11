import { NextRequest, NextResponse } from "next/server";
import { confirmGuestAction } from "../../../../lib/orchestrator";

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
    const response = await confirmGuestAction({
      conversationId: String(body.conversationId),
      runId: String(body.runId),
      confirmationToken: String(body.confirmationToken),
      confirmed: Boolean(body.confirmed)
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { status: "failed", spokenResponse: "I could not confirm that action.", error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

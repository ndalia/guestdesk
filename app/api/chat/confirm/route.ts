import { NextResponse } from "next/server";
import { confirmGuestAction } from "../../../../lib/orchestrator";

export async function POST(request: Request) {
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
      {
        status: "failed",
        spokenResponse: "The chat manager could not confirm that action.",
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

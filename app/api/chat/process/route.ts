import { NextResponse } from "next/server";
import { processGuestRequest } from "../../../../lib/orchestrator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await processGuestRequest({
      conversationId: String(body.conversationId),
      restaurantId: String(body.restaurantId ?? "freekeh"),
      customerId: body.customerId ? String(body.customerId) : null,
      message: String(body.message),
      knownFields: body.knownFields ?? {},
      channel: "web"
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        spokenResponse: "The chat manager hit a system issue and could not complete that request.",
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

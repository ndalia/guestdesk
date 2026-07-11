export async function createReservationDepositCheckout(args: {
  reservationId: string;
  customerEmail?: string;
  amountCents: number;
  metadata: Record<string, unknown>;
}) {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const productId = process.env.DODO_PRODUCT_ID;
  const environment = process.env.DODO_ENVIRONMENT || "test";
  if (!apiKey || !productId) {
    return {
      providerSessionId: `dodo_not_configured_${args.reservationId}`,
      checkoutUrl: "",
      configured: false
    };
  }

  const baseUrl = environment === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
  const response = await fetch(`${baseUrl}/api/v1/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      product_id: productId,
      quantity: 1,
      customer: args.customerEmail ? { email: args.customerEmail } : undefined,
      metadata: args.metadata,
      payment_link: true
    })
  });
  if (!response.ok) {
    throw new Error(`Dodo checkout failed: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  return {
    providerSessionId: json.id || json.checkout_id,
    checkoutUrl: json.checkout_url || json.payment_link || json.url,
    configured: true
  };
}

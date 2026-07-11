export type LinkupSearchResult = {
  answer: string;
  sources: Array<{ title: string; url?: string; snippet?: string }>;
};

export async function searchCurrentLocalInfo(args: {
  query: string;
  location: string;
}): Promise<LinkupSearchResult> {
  const apiKey = process.env.LINKUP_API_KEY;
  const narrowQuery = `${args.query} Location: ${args.location}`;
  if (!apiKey) {
    return {
      answer:
        "For parking: I do not have Linkup configured for live garage availability yet, so I cannot verify current open spots. Freekeh is in San Francisco's Mission District; guests should plan extra arrival time and check current nearby garage or street parking before leaving.",
      sources: [{ title: "Linkup not configured", snippet: narrowQuery }]
    };
  }
  const response = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      q: narrowQuery,
      depth: "standard",
      outputType: "searchResults"
    })
  });
  if (!response.ok) {
    return {
      answer:
        "For parking: the live search failed, so I cannot verify current open spots. The rest of the request can continue, and guests should check current nearby garage or street parking before leaving.",
      sources: [{ title: "Linkup request failed", snippet: `${response.status} ${response.statusText}` }]
    };
  }
  const json = await response.json();
  const results = Array.isArray(json.results) ? json.results : [];
  return {
    answer: results
      .slice(0, 3)
      .map((item: any) => item.snippet || item.name || item.title)
      .filter(Boolean)
      .join(" "),
    sources: results.slice(0, 3).map((item: any) => ({
      title: item.name || item.title || "Linkup source",
      url: item.url,
      snippet: item.snippet
    }))
  };
}

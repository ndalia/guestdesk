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
      answer: "Live parking search is not configured yet. Add LINKUP_API_KEY to enable current local results.",
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
      answer: "I could not complete the live parking search right now, but the rest of the request can continue.",
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

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export function shouldUseWebSearch(message: string): boolean {
  return /(搜索|搜一下|查一下|联网|网上|最新|新闻|现在|刚刚|今天|本周|最近)/.test(message);
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return [];
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      topic: 'general',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.results)
    ? data.results.map((result: Record<string, unknown>) => ({
        title: String(result.title ?? ''),
        url: String(result.url ?? ''),
        content: String(result.content ?? ''),
      }))
    : [];
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return '';
  }

  return [
    '【联网搜索结果】',
    ...results.map(
      (result, index) =>
        `${index + 1}. ${result.title}\n链接：${result.url}\n摘要：${result.content}`
    ),
  ].join('\n');
}

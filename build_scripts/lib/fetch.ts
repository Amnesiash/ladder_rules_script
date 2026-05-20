function proxyCandidatesForUrl(url: string): string[] {
  if (!/^https?:\/\//iu.test(url)) return [];
  const candidates: string[] = [];
  if (/^https:\/\/raw\.githubusercontent\.com\//iu.test(url) || /^https:\/\/github\.com\//iu.test(url)) {
    candidates.push(`https://ghproxy.com/${url}`);
    candidates.push(`https://ghp.ci/${url}`);
  }
  return candidates;
}

export async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  const candidates = [url, ...proxyCandidatesForUrl(url)];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, init);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  const message = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Unable to connect. Is the computer able to access the url?${message}`);
}


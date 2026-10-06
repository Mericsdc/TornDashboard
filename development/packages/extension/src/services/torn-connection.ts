/** Shared by the worker's fixed Torn requests and its key-free connection check. */
export const TORN_API_PERMISSION = 'https://api.torn.com/*';
export const TORN_ACCESS_ERROR = 'Chrome has blocked Torn API access. Click Connect Torn API in Options and allow access to api.torn.com.';
export class TornError extends Error { constructor(message: string, readonly invalidKey = false) { super(message); } }

export async function requireTornAccess(): Promise<void> {
  if (!await chrome.permissions.contains({ origins: [TORN_API_PERMISSION] })) throw new TornError(TORN_ACCESS_ERROR);
}

/** Call directly from an Options user gesture, before awaiting worker messages. */
export async function requestTornAccess(): Promise<void> {
  if (!await chrome.permissions.request({ origins: [TORN_API_PERMISSION] })) throw new TornError(TORN_ACCESS_ERROR);
}

export async function requestTorn(path: string, key: string | undefined, request: typeof fetch = fetch): Promise<{ response: Response; text: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const signal = AbortSignal.timeout(10000);
    try {
      const response = await request(`https://api.torn.com/v2/${path}`, { headers: key ? { Authorization: `ApiKey ${key}` } : {}, credentials: 'omit', redirect: 'error', signal });
      // Reading the body shares the same deadline; a dropped stream is also a transport failure.
      const text = response.ok ? await response.text() : '';
      if (text.length > 8 * 1024 * 1024) throw new TornError('Torn response exceeded the size limit.');
      return { response, text };
    } catch (error) {
      if (error instanceof TornError) throw error;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TornError('Chrome is offline. Reconnect your network, then try Connect Torn API again.');
      const name = error instanceof Error ? error.name : '', timedOut = signal.aborted || ['TimeoutError', 'AbortError'].includes(name);
      // Retry a read once for a transient transport failure. API/HTTP errors are never retried here.
      if (attempt === 0 && (timedOut || name === 'TypeError')) continue;
      throw new TornError(timedOut
        ? 'Torn API timed out after two attempts. Try Connect Torn API again shortly.'
        : 'Chrome could not reach api.torn.com. Use Test connection in Options; check Chrome site access, VPN/proxy or a blocker for this domain.');
    }
  }
  throw new TornError('Torn API connection failed.');
}

/** No key, cookies or account identifiers are included in this diagnostic request. */
export async function testTornConnection(request: typeof fetch = fetch): Promise<void> {
  const { response, text } = await requestTorn('key/info', undefined, request);
  if (!response.ok) throw new TornError(`Torn API returned HTTP ${response.status}. Try again shortly.`);
  let body: unknown; try { body = JSON.parse(text); } catch { throw new TornError('Torn returned an unexpected response. A browser or network filter may be intercepting the API.'); }
  if (typeof body !== 'object' || body === null || !('error' in body) || typeof body.error !== 'object' || body.error === null || !('code' in body.error) || body.error.code !== 2) throw new TornError('Torn did not return the expected connection-check response. Try again shortly.');
}

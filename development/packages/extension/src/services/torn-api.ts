/** Only imported by the worker. Do not pass raw responses or keys to the page. */
export async function checkTornKey(key: string): Promise<{ connected: boolean; userId?: number }> {
  if (!key) throw new Error('Add a Torn API key in extension options first');
  const response = await fetch('https://api.torn.com/v2/user/basic', {
    headers: { Authorization: `ApiKey ${key}` }, signal: AbortSignal.timeout(10000), credentials: 'omit', redirect: 'error'
  });
  if (!response.ok) throw new Error(`Torn returned HTTP ${response.status}`);
  const json: unknown = await response.json();
  if (typeof json !== 'object' || json === null || 'error' in json) throw new Error('Torn rejected the key or endpoint access');
  const profile = 'profile' in json ? json.profile : json;
  const id = typeof profile === 'object' && profile !== null && 'id' in profile ? profile.id : undefined;
  return { connected: true, ...(typeof id === 'number' ? { userId: id } : {}) };
}

import type { Message } from './message-schema';
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
export async function send<T>(message: Message): Promise<T> {
  const reply = await chrome.runtime.sendMessage(message) as Reply<T>;
  if (!reply?.ok) throw new Error(reply?.error || 'Extension unavailable; reload Torn after updating the extension');
  return reply.data;
}

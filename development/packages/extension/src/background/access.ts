export function senderRole(sender: chrome.runtime.MessageSender, extensionId: string): 'options' | 'content' | null {
  if (sender.id !== extensionId) return null;
  if (sender.url === `chrome-extension://${extensionId}/options.html` && sender.tab?.id === undefined) return 'options';
  // Chrome options opened as a tab also includes tab.id.
  if (sender.url === `chrome-extension://${extensionId}/options.html`) return 'options';
  try {
    const url = new URL(sender.url || '');
    if (sender.tab?.id !== undefined && sender.frameId === 0 && url.protocol === 'https:' && ['www.torn.com', 'torn.com'].includes(url.hostname)) return 'content';
  } catch { return null; }
  return null;
}

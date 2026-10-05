const audio = new Audio(chrome.runtime.getURL('warning.wav'));
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id || typeof message !== 'object' || message === null || !('target' in message) || message.target !== 'offscreen' || !('type' in message) || message.type !== 'PLAY_WARNING') return false;
  audio.pause(); audio.currentTime = 0;
  void audio.play().then(() => reply({ ok: true })).catch(() => reply({ ok: false }));
  return true;
});

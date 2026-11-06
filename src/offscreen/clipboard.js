chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'copy') return false;
  const buf = document.getElementById('buf');
  buf.value = msg.text;
  window.focus();
  buf.focus();
  buf.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  if (ok) {
    sendResponse({ ok: true });
    return false;
  }
  // Fallback for builds where execCommand is refused: the async clipboard API.
  navigator.clipboard
    .writeText(msg.text)
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
});

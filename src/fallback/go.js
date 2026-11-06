// Experimental bare-word mode. Register this page as a custom search engine
// (URL: chrome-extension://<id>/fallback/go.html?q=%s) so typing "work" runs the shortcut.
export function googleUrl(q) {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export async function main(loc = location, runtime = chrome.runtime) {
  const q = new URLSearchParams(loc.search).get('q') ?? '';
  const reply = await runtime.sendMessage({ type: 'run', input: q });
  if (!reply?.handled) loc.replace(googleUrl(q));
}

if (globalThis.location?.protocol === 'chrome-extension:') main();

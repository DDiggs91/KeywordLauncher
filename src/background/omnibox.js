import { loadAll, getUsage, touchUsage } from '../lib/storage.js';
import { parseInput } from '../lib/parse.js';
import { matchShortcuts } from '../lib/match.js';
import { escapeXml } from '../lib/xml.js';
import { runShortcut } from './runner.js';

/**
 * Surface a message to the user. Notifications would need an extra permission, so this uses
 * the toolbar button's badge and tooltip instead.
 */
export async function notify(message) {
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setTitle({ title: `Keyword Launcher: ${message}` });
}

export async function clearNotice() {
  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setTitle({ title: 'Keyword Launcher' });
}

export async function handleInputChanged(text, suggest) {
  const parsed = parseInput(text);
  const [{ shortcuts }, usage] = await Promise.all([loadAll(), getUsage()]);
  const matches = matchShortcuts(shortcuts, parsed?.keyword ?? '', usage);
  suggest(
    matches.map((sc) => ({
      content: parsed?.query ? `${sc.keyword} ${parsed.query}` : sc.keyword,
      description:
        `<match>${escapeXml(sc.keyword)}</match>` +
        (parsed?.query ? ` <url>${escapeXml(parsed.query)}</url>` : '') +
        (sc.description ? ` <dim>${escapeXml(sc.description)}</dim>` : ''),
    }))
  );
}

async function openSearch(text, disposition) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  if (disposition === 'currentTab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) return chrome.tabs.update(tab.id, { url });
  }
  return chrome.tabs.create({ url, active: disposition !== 'newBackgroundTab' });
}

/** Handles Enter (currentTab), Alt+Enter (newForegroundTab) and Shift+Alt+Enter (newBackgroundTab). */
export async function handleInputEntered(text, disposition = 'currentTab') {
  await clearNotice();
  const parsed = parseInput(text);
  if (!parsed) return;
  const { shortcuts, settings } = await loadAll();
  const sc = shortcuts.find((s) => s.keyword === parsed.keyword);
  const target = disposition === 'currentTab' ? settings.defaultTarget : disposition;

  if (!sc) {
    if (settings.unknownKeyword === 'search') await openSearch(text.trim(), target);
    else await notify(`No shortcut named "${parsed.keyword}".`);
    return;
  }
  await touchUsage(sc.id);
  const result = await runShortcut(sc, { query: parsed.query, disposition: target });
  if (!result.ok) {
    const failed = result.log.find((l) => l.status === 'error');
    await notify(failed?.message ?? 'Shortcut failed.');
  }
  return result;
}

/**
 * Used by the bare-word fallback page: run a known shortcut, or report that none matched so the
 * page can send the text to a normal search instead.
 */
export async function runKnown(text, disposition = 'currentTab') {
  const parsed = parseInput(text);
  if (!parsed) return { handled: false };
  const { shortcuts } = await loadAll();
  if (!shortcuts.some((s) => s.keyword === parsed.keyword)) return { handled: false };
  const result = await handleInputEntered(text, disposition);
  return { handled: true, ok: result?.ok ?? false };
}

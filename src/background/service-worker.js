import { handleInputChanged, handleInputEntered, runKnown } from './omnibox.js';
import { runShortcut } from './runner.js';
import { initStorage } from '../lib/storage.js';

async function seedDefaults() {
  const res = await fetch(chrome.runtime.getURL('defaults/default-shortcuts.json'));
  await initStorage(await res.json());
}

// Listeners must be registered synchronously at top level so a restarted worker receives events.
chrome.omnibox.setDefaultSuggestion({ description: 'Run a shortcut, e.g. <match>work</match>' });
chrome.omnibox.onInputChanged.addListener(handleInputChanged);
chrome.omnibox.onInputEntered.addListener(handleInputEntered);
chrome.runtime.onInstalled.addListener(seedDefaults);
chrome.runtime.onStartup.addListener(seedDefaults);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// Options page "Test run": runs the (possibly unsaved) shortcut and returns the result log.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'testRun') {
    runShortcut(msg.shortcut, { query: msg.query ?? '', disposition: 'newForegroundTab' }).then(
      sendResponse
    );
    return true;
  }
  // Bare-word fallback page (experimental): run the text as if typed after "go ".
  if (msg?.type === 'run') {
    runKnown(String(msg.input ?? ''), 'currentTab').then(sendResponse);
    return true;
  }
  return false;
});

// KL_TEST_START
globalThis.__kl = {
  run: (input, disposition = 'currentTab') => handleInputEntered(input, disposition),
};
// KL_TEST_END

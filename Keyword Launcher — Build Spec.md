# Keyword Launcher — Build Spec

Nov 5, 2026 · @Daniel Diggs

## Overview

Keyword Launcher is a Manifest V3 Chrome extension: type `go work` in the address bar and it runs the steps saved under `work` (open several pages, group tabs, and so on). Shortcuts are edited on the extension's options page and synced through the Chrome profile. It installs with **Load unpacked**, so no Web Store listing is needed.

**In scope for v1**

- Omnibox keyword `go` with autocomplete from saved shortcuts
- `{query}` placeholder, e.g. `go jira 123`
- Step types: open URLs, tab group, close tabs, pin tabs, mute tabs, copy text, wait, run script (opt-in)
- Options page editor with live validation, test-run button, import/export JSON
- Sync storage with per-item size checks

**Spike, ships only if feasible:** bare-word mode (typing `work` with no keyword) via a fallback page registered as a custom search engine. See Open risks.

**Out of scope:** Web Store publishing, Firefox/Safari, sharing shortcuts between users.

Target: Chrome 120+ (user-scripts step needs 135+; it disables itself on older versions).

## Dev container and tooling

Everything runs headless inside a Linux container with Node 22 and Playwright's bundled Chromium. Branded Google Chrome no longer honors `--load-extension`, so tests use Playwright's Chromium, which does.

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | 22 LTS | Runtime, build scripts |
| npm | bundled | Package management |
| Vitest | 2.x | Unit and DOM tests, coverage (v8) |
| jsdom | 25.x | DOM environment for options-page tests |
| Playwright | 1.4x | E2E tests with the unpacked extension loaded |
| Chromium (Playwright) | bundled | Browser under test |
| ESLint + Prettier | 9.x / 3.x | Lint and formatting |
| Ajv | 8.x | JSON Schema checks for manifest, shortcuts and import files |
| archiver | 7.x | Building the release zip |
| xvfb | apt | Fallback display if headless extension loading misbehaves |

Container setup:

1. Base image `mcr.microsoft.com/devcontainers/javascript-node:22`.
2. `postCreateCommand`: `npm ci && npx playwright install --with-deps chromium`.
3. Install `xvfb` via apt in the Dockerfile; E2E script runs `xvfb-run -a` only when `HEADED=1`.
4. No ports forwarded; nothing needs network at test time.

npm scripts:

| Script | Does |
| --- | --- |
| `npm run build` | Copies `src/` to `dist/`, stamps version from `package.json` |
| `npm run lint` | ESLint + Prettier check |
| `npm run validate` | Manifest, schema, permission and size checks on `dist/` |
| `npm test` | Vitest unit + DOM tests with coverage |
| `npm run test:e2e` | Builds the test build, then runs Playwright against `dist-test/` (E18 uses the zip) |
| `npm run package` | Zips `dist/` to `release/keyword-launcher-<version>.zip` |
| `npm run ci` | lint → build → validate → test → test:e2e → package |

## File tree

75 files: 36 shipped in the extension, the rest build, config and tests.

```
keyword-launcher/
├── .devcontainer/
│   ├── devcontainer.json
│   └── Dockerfile
├── .github/workflows/ci.yml          # optional, runs npm run ci
├── package.json
├── package-lock.json
├── eslint.config.js
├── .prettierrc
├── .gitignore
├── vitest.config.js
├── playwright.config.js
├── README.md                          # install + usage
├── CHANGELOG.md
├── scripts/
│   ├── build.js
│   ├── validate.js
│   └── package.js
├── schemas/
│   ├── manifest.schema.json
│   └── export.schema.json             # shortcuts + settings file format
├── src/                               # shipped as dist/
│   ├── manifest.json
│   ├── background/
│   │   ├── service-worker.js
│   │   ├── omnibox.js
│   │   └── runner.js
│   ├── lib/
│   │   ├── parse.js
│   │   ├── template.js
│   │   ├── match.js
│   │   ├── url.js
│   │   ├── schema.js
│   │   ├── storage.js
│   │   └── xml.js
│   ├── actions/
│   │   ├── index.js
│   │   ├── openUrls.js
│   │   ├── tabGroup.js
│   │   ├── closeTabs.js
│   │   ├── pinTabs.js
│   │   ├── muteTabs.js
│   │   ├── copyText.js
│   │   ├── wait.js
│   │   └── runScript.js
│   ├── offscreen/
│   │   ├── clipboard.html
│   │   └── clipboard.js
│   ├── options/
│   │   ├── options.html
│   │   ├── options.css
│   │   ├── options.js
│   │   ├── shortcut-list.js
│   │   ├── shortcut-editor.js
│   │   ├── step-editor.js
│   │   └── import-export.js
│   ├── fallback/                      # bare-word spike
│   │   ├── go.html
│   │   └── go.js
│   ├── defaults/default-shortcuts.json
│   └── icons/ icon16.png icon32.png icon48.png icon128.png
└── test/
    ├── fakes/chrome.js
    ├── fixtures/
    │   ├── valid-export.json
    │   ├── invalid-export-duplicate.json
    │   ├── invalid-export-bad-url.json
    │   └── oversized-export.json
    ├── unit/
    │   ├── parse.test.js
    │   ├── template.test.js
    │   ├── match.test.js
    │   ├── url.test.js
    │   ├── xml.test.js
    │   ├── schema.test.js
    │   ├── storage.test.js
    │   ├── runner.test.js
    │   ├── omnibox.test.js
    │   └── actions.test.js
    ├── dom/options.test.js
    ├── validate/validate.test.js
    └── e2e/
        ├── fixtures.js
        ├── launch.spec.js
        ├── options.spec.js
        ├── import-export.spec.js
        └── packaged.spec.js
```

## What each file does

Logic lives in small pure modules under `lib/` so most behavior is unit-testable without a browser; `background/` and `actions/` are thin wrappers over `chrome.*` calls.

**Manifest and background**

| File | Responsibility |
| --- | --- |
| `manifest.json` | MV3; `omnibox.keyword: "go"`; permissions `tabs`, `tabGroups`, `storage`, `offscreen`; optional `userScripts`; options page; icons |
| `service-worker.js` | Entry point. Registers omnibox listeners, seeds defaults on first install, runs storage migrations, exposes `globalThis.__kl` test hook (`run(input, disposition)`) only when built with `KL_TEST=1` |
| `omnibox.js` | `onInputChanged` → up to 5 suggestions; `onInputEntered` → parse, look up, hand to runner; maps disposition (Enter / Alt+Enter) to tab target; unknown keyword → Google search |
| `runner.js` | Runs steps in order with a shared context (created tab ids, query); per-step 10 s timeout; stops on first error unless the step has `continueOnError`; returns a result log |

**lib/**

| File | Responsibility |
| --- | --- |
| `parse.js` | Splits input into `{keyword, query}`; trims, lowercases keyword, keeps query case |
| `template.js` | Fills `{query}` (URL-encoded) and `{query:raw}`; `{query}` with no query → empty string, or blocks the run if the shortcut sets `requiresQuery` |
| `match.js` | Ranks shortcuts for suggestions: exact, prefix, then substring; ties by most recently used |
| `url.js` | Allows `http`, `https`, `chrome://`, `file://`; rejects `javascript:` and `data:`; adds `https://` to bare domains |
| `schema.js` | Validates a shortcut and the whole export file with Ajv; returns field-level errors for the editor |
| `storage.js` | Reads and writes sync storage, one key per shortcut (`sc:<id>`) plus `index` and `settings`; size check before write; `version` field + migrations |
| `xml.js` | Escapes `& < > " '` for omnibox suggestion descriptions (Chrome parses them as XML) |

**actions/** — each exports `{type, label, fields, validate(step), run(step, ctx)}`

| File | Step |
| --- | --- |
| `index.js` | Registry; editor builds forms from each action's `fields` |
| `openUrls.js` | Open 1–20 URLs: current tab, new tabs, or new window; background or foreground |
| `tabGroup.js` | Group tabs opened earlier in this run; name + color |
| `closeTabs.js` | Close tabs whose URL matches a pattern in the current window; never closes the last tab |
| `pinTabs.js` | Pin/unpin matching tabs |
| `muteTabs.js` | Mute/unmute matching or all tabs |
| `copyText.js` | Copies templated text via the offscreen document (service workers have no clipboard) |
| `wait.js` | Pause 0–10,000 ms |
| `runScript.js` | Runs user JS in the active tab through `chrome.userScripts.execute`; hidden unless the permission is granted and the API exists |

**Other shipped files**

| File | Responsibility |
| --- | --- |
| `offscreen/clipboard.*` | Receives a message, writes text to the clipboard, replies |
| `options/options.html/.css/.js` | Page shell and wiring; light and dark themes |
| `options/shortcut-list.js` | List with search, add, duplicate, delete (with undo), reorder |
| `options/shortcut-editor.js` | Keyword, description, steps; inline errors; **Test run** button |
| `options/step-editor.js` | Renders one step's form from its action's `fields` |
| `options/import-export.js` | Download JSON; import with preview and merge or replace |
| `fallback/go.*` | Bare-word spike: reads `?q=`, runs a matching shortcut or redirects to Google |
| `defaults/default-shortcuts.json` | 2 example shortcuts seeded on first install |

**Build and config**

| File | Responsibility |
| --- | --- |
| `scripts/build.js` | Clean `dist/`, copy `src/`, inject version, strip test hook unless `KL_TEST=1` |
| `scripts/validate.js` | Release checks listed in the validation section; non-zero exit on failure |
| `scripts/package.js` | Zip `dist/`, print size and SHA-256 |
| `schemas/*.json` | Schemas used by `validate.js` and `lib/schema.js` |
| `vitest.config.js` | Node env for unit, jsdom for `test/dom`; coverage thresholds |
| `playwright.config.js` | Chromium project, 1 worker, traces on failure |
| `test/fakes/chrome.js` | In-memory fake of `tabs`, `tabGroups`, `storage.sync`, `omnibox`, `offscreen`, `runtime`, `userScripts` with call recording |

## Data model and storage

Each shortcut is stored under its own sync key so one large shortcut can't hit the 8 KB per-item limit for all of them.

```json
{
  "version": 1,
  "settings": { "unknownKeyword": "search", "defaultTarget": "currentTab" },
  "shortcuts": [
    {
      "id": "b3f1c2e0-...",
      "keyword": "work",
      "description": "Morning tabs",
      "requiresQuery": false,
      "steps": [
        { "type": "openUrls", "urls": ["https://mail.google.com", "https://calendar.google.com"], "target": "newTabs" },
        { "type": "tabGroup", "name": "Work", "color": "blue" }
      ]
    }
  ]
}
```

That object is the export file format. In sync storage it is split into keys:

| Key | Holds |
| --- | --- |
| `index` | `{version, order: [id, …]}` |
| `settings` | Settings object |
| `sc:<id>` | One shortcut |
| `usage` (local storage) | Last-used timestamps for suggestion ranking; not synced |

Rules enforced by `schema.js`:

- Keyword: 1–32 chars, `[a-z0-9_-]`, unique, case-insensitive
- Description: 0–120 chars
- Steps: 1–25 per shortcut; `openUrls` holds 1–20 URLs
- Each `sc:<id>` ≤ 8,000 bytes serialized; total ≤ 100,000 bytes (Chrome's sync limits are 8,192 and 102,400)
- Unknown step types are kept but marked disabled, so a newer export still imports

Writes go through one function that validates, checks size, then writes in a single `storage.sync.set` call; a failed write leaves the previous data intact.

## Unit tests (Vitest, Node)

64 cases across 10 files, run against `test/fakes/chrome.js`; target is ≥ 90% line and branch coverage on `lib/`, `actions/` and `background/`.

| ID | File | Case | Expected |
| --- | --- | --- | --- |
| P1 | parse | `work` | `{keyword:"work", query:""}` |
| P2 | parse | `jira 123` | `{keyword:"jira", query:"123"}` |
| P3 | parse | `  Work   foo bar ` | keyword `work`, query `foo bar` (inner spaces kept) |
| P4 | parse | empty / whitespace | `null` |
| P5 | parse | unicode `café menu` | keyword `café` lowercased, query `menu` |
| T1 | template | `{query}` with `a b&c` | `a%20b%26c` |
| T2 | template | `{query:raw}` with `a b` | `a b` |
| T3 | template | two `{query}` in one URL | both replaced |
| T4 | template | no query, `requiresQuery:false` | placeholder → empty string |
| T5 | template | no query, `requiresQuery:true` | throws `MissingQuery` |
| T6 | template | unknown token `{foo}` | left as-is |
| T7 | template | query contains `{query}` | not re-expanded |
| M1 | match | exact keyword | ranked first |
| M2 | match | prefix `wo` with `work`, `wolf`, `network` | `work`, `wolf` before `network` |
| M3 | match | tie on rank | most recently used first |
| M4 | match | 12 matches | 5 returned |
| M5 | match | case `WO` | same as `wo` |
| U1 | url | `example.com` | `https://example.com` |
| U2 | url | `javascript:alert(1)` | rejected |
| U3 | url | `data:text/html,...` | rejected |
| U4 | url | `chrome://extensions` | allowed |
| U5 | url | `http://localhost:3000/x?y=1` | allowed, unchanged |
| U6 | url | `not a url` | rejected with message |
| X1 | xml | `<b>&"'` | `&lt;b&gt;&amp;&quot;&apos;` |
| X2 | xml | plain text | unchanged |
| S1 | schema | valid shortcut | no errors |
| S2 | schema | keyword with space | error on `keyword` |
| S3 | schema | keyword 33 chars | error on `keyword` |
| S4 | schema | duplicate keyword (`Work` vs `work`) | error on second |
| S5 | schema | 0 steps | error on `steps` |
| S6 | schema | 26 steps | error on `steps` |
| S7 | schema | `openUrls` with 21 URLs | error on `steps[0].urls` |
| S8 | schema | unknown step type | kept, `disabled:true`, warning not error |
| S9 | schema | export missing `version` | error |
| S10 | schema | export `version: 99` | error "newer than this extension" |
| ST1 | storage | save then load | round-trips equal |
| ST2 | storage | shortcut > 8,000 bytes | rejected, nothing written |
| ST3 | storage | total > 100,000 bytes | rejected, nothing written |
| ST4 | storage | `sync.set` throws quota error | previous data intact, error surfaced |
| ST5 | storage | delete | removes `sc:<id>` and index entry |
| ST6 | storage | reorder | only `index` written |
| ST7 | storage | v0 data present | migrated to v1 once |
| ST8 | storage | first install, empty | defaults seeded |
| ST9 | storage | orphan `sc:` key not in index | ignored and cleaned up |
| R1 | runner | 2 steps succeed | both run in order, log has 2 ok |
| R2 | runner | step 1 throws | step 2 not run, log shows error |
| R3 | runner | step 1 throws, `continueOnError` | step 2 runs |
| R4 | runner | step hangs | times out at 10 s (fake timers) |
| R5 | runner | disabled step | skipped, logged |
| R6 | runner | context passes created tab ids | `tabGroup` receives them |
| O1 | omnibox | input `wo` | `suggest` called with escaped descriptions |
| O2 | omnibox | Enter on `work` | runner called, target `currentTab` |
| O3 | omnibox | Alt+Enter (`newForegroundTab`) | first URL in new tab |
| O4 | omnibox | unknown keyword, setting `search` | opens Google search for full text |
| O5 | omnibox | unknown keyword, setting `nothing` | no tabs opened, notification |
| A1 | actions | openUrls 3 URLs, `newTabs` | 3 `tabs.create`, in order |
| A2 | actions | openUrls `currentTab` | first URL `tabs.update`, rest `create` |
| A3 | actions | openUrls `newWindow` | 1 `windows.create` with all URLs |
| A4 | actions | tabGroup with no tabs from run | no-op, warning |
| A5 | actions | closeTabs matching all tabs | leaves 1 tab open |
| A6 | actions | pin / mute pattern | only matching tabs changed |
| A7 | actions | copyText | offscreen doc created once, message sent, text templated |
| A8 | actions | wait 20,000 ms | rejected by validate (max 10,000) |
| A9 | actions | runScript without permission | validate error "enable user scripts" |

## Options page tests (Vitest + jsdom)

14 cases in `test/dom/options.test.js`; they load `options.html` into jsdom with the chrome fake and drive it through DOM events.

| ID | Case | Expected |
| --- | --- | --- |
| D1 | Page load with 2 shortcuts | List shows 2 rows in stored order |
| D2 | Add shortcut, fill keyword and one URL, save | Storage has 3 shortcuts; list updates |
| D3 | Save with invalid keyword | Inline error on keyword field; Save stays disabled; nothing written |
| D4 | Save with duplicate keyword | Error names the existing shortcut |
| D5 | Add each step type from the menu | Correct form fields render per action's `fields` |
| D6 | Reorder steps with up/down buttons | Saved order matches |
| D7 | Delete shortcut, then Undo within 5 s | Shortcut restored, same id |
| D8 | Search box `wor` | Only matching rows visible |
| D9 | Test run button | Runner called via message; result log shown |
| D10 | Storage changed in another tab (`storage.onChanged`) | List refreshes without reload |
| D11 | Unsaved edits, navigate away | `beforeunload` prompt set |
| D12 | runScript step when permission missing | Step shows "Enable user scripts" button instead of editor |
| D13 | Keyboard only: Tab through editor | All controls reachable; labels tied to inputs |
| D14 | Dark mode (`prefers-color-scheme: dark`) | Dark theme class applied |

## End-to-end tests (Playwright + Chromium)

E2E loads the built `dist/` into a real Chromium and checks actual tabs, groups and storage. Playwright can't type into the address bar (it's browser chrome, not a page), so launch tests call the service worker's `__kl.run(input, disposition)` hook, which runs the same code path as `onInputEntered`. Real address-bar typing is covered in the manual checklist.

`test/e2e/fixtures.js` launches `chromium.launchPersistentContext` with `--disable-extensions-except=dist --load-extension=dist`, waits for the service worker, reads the extension id from its URL, and points all test URLs at a local static server (`http://127.0.0.1:<port>/page-a.html` etc.) so no network is needed.

| ID | Spec | Case | Expected |
| --- | --- | --- | --- |
| E1 | launch | Extension loads | Service worker running; no console errors; options page opens |
| E2 | launch | First install | 2 default shortcuts in `storage.sync` |
| E3 | launch | `run('work')` with 3 URLs, new tabs | 3 new tabs with those URLs, in order |
| E4 | launch | `run('work')`, `currentTab` | Current tab navigates; 2 new tabs |
| E5 | launch | `run('docs hello world')` | Tab URL contains `q=hello%20world` |
| E6 | launch | openUrls + tabGroup | One group named and colored as set, holding exactly the 3 new tabs |
| E7 | launch | closeTabs pattern | Matching tabs gone, others remain |
| E8 | launch | copyText | Clipboard holds text (read via page with clipboard permission) |
| E9 | launch | runScript, permission granted | Script sets `document.title`; title changed |
| E10 | launch | Unknown keyword | Google search URL opened (request intercepted, not sent) |
| E11 | launch | Service worker killed then `run` | Worker restarts, run succeeds (MV3 lifecycle) |
| E12 | options | Create shortcut in UI, then `run` it | Works without reload |
| E13 | options | Edit URL, save, `run` | New URL opened |
| E14 | options | Test run button | Same tabs as `run` |
| E15 | import-export | Export then import into fresh profile | Shortcuts identical |
| E16 | import-export | Import invalid fixtures | Error shown; existing data unchanged |
| E17 | import-export | Import oversized fixture | Size error; nothing written |
| E18 | packaged | Unzip `release/*.zip` to temp dir and load it | E1 passes; test hook absent; Test run button on the options page opens the default shortcut's tabs |

## Validation pipeline and release gate

A build ships only when `npm run ci` exits 0 in the dev container. The stages run in this order and stop at the first failure:

1. **Lint** — ESLint (no errors, no warnings) and Prettier check.
2. **Build** — `dist/` created; test build (`KL_TEST=1`) goes to `dist-test/` for E2E only.
3. **Validate** (`scripts/validate.js` on `dist/`):
   - `manifest.json` parses and passes `schemas/manifest.schema.json`; `manifest_version` is 3
   - Version matches `package.json` and is greater than the last `CHANGELOG.md` entry
   - Permissions are exactly the allowlist (`tabs`, `tabGroups`, `storage`, `offscreen`; optional `userScripts`); no host permissions
   - Every file the manifest references exists (icons, options page, service worker, offscreen page)
   - No remote code: no `http(s)://` in `<script src>`, no `eval`, `new Function`, or string `setTimeout`
   - Test hook string `__kl` absent from `dist/`
   - `default-shortcuts.json` passes `export.schema.json` and the storage size limits
   - Icons are PNGs at exactly 16, 32, 48 and 128 px
   - Unpacked size under 1 MB
4. **Unit + DOM tests** — all pass; coverage ≥ 90% lines and branches on `lib/`, `actions/`, `background/`.
5. **E2E** — all pass with 0 retries; 2 consecutive green runs required before tagging a release (flake check).
6. **Package** — zip built, SHA-256 printed, then E18 runs against the zip.

`test/validate/validate.test.js` tests the validator itself: it feeds fixtures with a missing icon, an extra `<all_urls>` permission, an `eval` call, a leftover `__kl` hook and a version mismatch, and expects each to fail with a specific message. A validator that passes everything is caught here.

## Manual checklist and open risks

These need your real Chrome, because the address bar and sync can't be driven from the container. Run them once per release after loading the zip with **Load unpacked**.

- [ ] Type `go`, Space: the address bar shows the extension's name and icon
- [ ] Type `go wo`: suggestions appear, matching text bolded
- [ ] `go work` + Enter opens all pages; Alt+Enter opens the first in a new tab
- [ ] `go jira 123` fills the query
- [ ] Unknown keyword falls back to search
- [ ] Edit a shortcut on the options page; it works immediately without reloading
- [ ] Shortcut appears on a second computer signed into the same profile within a few minutes
- [ ] Enable user scripts, add a runScript step, confirm it runs
- [ ] Restart Chrome; shortcuts persist and the keyword still works

**Open risks**

| Risk | Impact | Plan |
| --- | --- | --- |
| Bare-word mode may not work: Chrome may reject `chrome-extension://` URLs as a custom search engine | Keyword prefix stays required | 1-hour spike first; if blocked, drop `fallback/` and its tests |
| Headless Chromium extension loading changes between Playwright versions | E2E can't start in the container | Pin Playwright version; `HEADED=1` path runs under `xvfb-run` |
| `chrome.userScripts.execute` needs Chrome 135+ and a user toggle | runScript unavailable for some users | Feature-detect; hide step and explain in the editor |
| Sync quota (100 KB) | Very large libraries can't save | Size meter on the options page; warn at 80% |
| MV3 service worker shuts down after \~30 s idle | State lost mid-run | Runner keeps no global state; E11 covers restart |

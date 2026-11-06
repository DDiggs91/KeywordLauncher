# Keyword Launcher

A Manifest V3 Chrome extension. Type `go work` in the address bar and it runs the steps saved under
`work`: open several pages, group tabs, close or pin tabs, copy text, and more. Shortcuts are edited on the
options page and synced through your Chrome profile.

## Install

1. `npm ci && npm run build`
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, choose the `dist/` folder
   (or unzip `release/keyword-launcher-<version>.zip` and choose that folder).

Needs Chrome 120+. The optional "Run script" step needs Chrome 135+ and the extension's **Allow user scripts**
toggle (use the **Enable user scripts** button in the editor).

## Use

- `go` + Space, then a shortcut name: `go work`. Autocomplete suggests saved shortcuts.
- `go jira 123` fills `{query}` with `123` (`{query:raw}` skips URL-encoding).
- Enter runs in the current tab; Alt+Enter opens the first page in a new tab.
- Unknown keywords fall back to a Google search (configurable in settings).
- A failed run shows a `!` badge on the toolbar button; hover it for the reason.

### Step types

Open URLs · Group tabs · Close tabs · Pin tabs · Mute tabs · Copy text · Wait · Run script (opt-in)

### Bare-word mode (experimental)

`fallback/go.html` is a spike for typing `work` with no `go`. It is **not** verified: add a custom search engine
in `chrome://settings/searchEngines` with URL `chrome-extension://<extension-id>/fallback/go.html?q=%s`
and see if Chrome accepts it. If it does not, ignore it.

## Development

Everything runs in the dev container (Node 22, Playwright Chromium).

| Command            | Does                                                       |
| ------------------ | ---------------------------------------------------------- |
| `npm run build`    | Copy `src/` to `dist/`, stamp version, strip the test hook |
| `npm run lint`     | ESLint + Prettier check                                    |
| `npm run validate` | Manifest, permission, size and hygiene checks on `dist/`   |
| `npm test`         | Vitest unit + DOM tests with coverage (≥ 90% thresholds)   |
| `npm run test:e2e` | Builds `dist-test/` (with `__kl` hook), runs Playwright    |
| `npm run package`  | Zip `dist/` to `release/`, print size and SHA-256          |
| `npm run ci`       | lint → build → validate → test → test:e2e → package        |

`HEADED=1 npm run test:e2e` runs Playwright under `xvfb-run -a`. E2E uses Playwright's Chromium with
`channel: 'chromium'` (new headless), the only mode where extensions load headlessly.

Releasing: `npm run validate` requires the `package.json` version to be greater than the newest released entry
in `CHANGELOG.md`. After tagging, rename "Unreleased" to the version and bump `package.json`. Run `npm run ci`
twice in a row (flake check) before tagging.

## Manual checklist (real Chrome, once per release)

- [ ] Type `go`, Space: the address bar shows the extension's name and icon
- [ ] Type `go wo`: suggestions appear, matching text bolded
- [ ] `go work` + Enter opens all pages; Alt+Enter opens the first in a new tab
- [ ] `go jira 123` fills the query
- [ ] Unknown keyword falls back to search
- [ ] Edit a shortcut on the options page; it works immediately without reloading
- [ ] Shortcut appears on a second computer signed into the same profile within a few minutes
- [ ] Enable user scripts, add a runScript step, confirm it runs
- [ ] Restart Chrome; shortcuts persist and the keyword still works
- [ ] **Copy text** step really puts text on the clipboard (not verifiable headlessly; see CHANGELOG notes)

## Download

Grab `keyword-launcher-<version>.zip` from the [Releases page](https://github.com/DDiggs91/KeywordLauncher/releases),
unzip it, then use **Load unpacked** on the unzipped folder. Pushing a tag like `v1.0.0` (matching `package.json`)
publishes a release automatically.

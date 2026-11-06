# Changelog

Released versions are listed as `## [x.y.z]`. `npm run validate` requires the version in
`package.json` to be greater than the newest released entry here. After tagging a release,
rename "Unreleased" to its version and bump `package.json`.

## Unreleased

- First version: omnibox keyword `go`, step-based shortcuts, options page, import/export.

### Known issues

- Copy text: the offscreen document could not be shown to write the clipboard in headless Chromium, so only the
  message path is tested. If it fails in real Chrome, add `clipboardWrite` to `permissions` and to the allowlist in
  `scripts/validate.js`.
- Run script (E9) is skipped in CI: Playwright's Chromium is 131 and `chrome.userScripts.execute` needs 135+.
- Bare-word mode (`fallback/`) is unverified.

# Gridsmith release handoff

Updated 6 September 2026. This release covers the browser feed planner, its portable demo and GitHub delivery. Daylog is outside this project.

[Live demo](https://ademord.github.io/gridsmith/) · [Source](https://github.com/Ademord/gridsmith) · [v1.0.0 release](https://github.com/Ademord/gridsmith/releases/tag/v1.0.0) · [Browser checks](https://github.com/Ademord/gridsmith/actions/workflows/ci.yml) · [Done milestone](https://github.com/Ademord/gridsmith/milestone/1)

## Implemented

- Feed arrangement, multi-selection, keyboard moves, undo/redo, captions, planned dates and profile preview.
- Reviewed collage import with 16/30-photo fixtures, selectable crops, manual grid correction, original-image mode and durable import handling.
- Named drafts, native JSON backups and restoration, plus ordered ZIP exports with JPEGs, captions and dimensions/source-quality metadata.
- Four themes, narrow layouts, storage-failure notices and a 17-step guide with pause/resume, manual takeover, contextual help and explicit import/download actions.
- A standalone HTML build, pinned dependencies, browser regression tests, CI, a Pages workflow, screenshots and setup/update/recovery documentation.
- Eighteen explicitly approved, previously unposted generated sample images at 300 × 400, with metadata removed. Three abstract cards represent fictional posted references. Actual posted photos and saved personal workspaces are excluded.

## Release evidence and maintenance

The GitHub release records the final source commit and downloadable `gridsmith-demo.html`; Actions records the checks for each commit. Use those records for exact results. This handoff does not claim a passing run for an unverified future commit.

Before changes, save a private JSON layout backup. After source or sample changes, run `python tools/build.py`, `python tools/build.py --check`, `npm test` and `npm run screenshots`. Regenerate the content inventory before another release. Keep the source assets, bundled HTML, screenshots and release attachment consistent.

Browser storage is local to an origin and can be cleared or fail. Dates do not schedule publishing, and exports do not restore resolution missing from the source images. See [tomorrow's optional work](TODO.md).

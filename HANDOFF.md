# Gridsmith release handoff

Updated 6 September 2026. This release covers the browser feed planner, its portable demo and GitHub delivery. Daylog is outside this project.

[Planned Pages URL](https://ademord.github.io/gridsmith/) Ã‚Â· [Source](https://github.com/Ademord/gridsmith) Ã‚Â· [v1.0.0 release](https://github.com/Ademord/gridsmith/releases/tag/v1.0.0) Ã‚Â· [Browser checks](https://github.com/Ademord/gridsmith/actions/workflows/ci.yml) Ã‚Â· [Done milestone](https://github.com/Ademord/gridsmith/milestone/1)

## Current delivery status

Source is pushed to a private repository. GitHub Pages is blocked until the owner approves making the reviewed repository public; the current plan does not support Pages on this private repository. Local browser checks passed all 23 cases. The build uses canonical generated PNG bytes with exact pixel and hash checks to avoid platform-specific compression differences; consult Actions for the exact-commit result. The offline HTML is attached to the release and its download hash matches the tested build. Do not close Done until CI and hosted verification pass.

## Implemented

- Feed arrangement, multi-selection, keyboard moves, undo/redo, captions, planned dates and profile preview.
- Reviewed collage import with 16/30-photo fixtures, selectable crops, manual grid correction, original-image mode and durable import handling.
- Named drafts, native JSON backups and restoration, plus ordered ZIP exports with JPEGs, captions and dimensions/source-quality metadata.
- Four themes, narrow layouts, storage-failure notices and a 17-step guide with pause/resume, manual takeover, contextual help and explicit import/download actions.
- A standalone HTML build, pinned dependencies, browser regression tests, CI, a Pages workflow, screenshots and setup/update/recovery documentation.
- Eighteen explicitly approved, previously unposted generated sample images at 300 Ãƒâ€” 400, with metadata removed. Three abstract cards represent fictional posted references. Actual posted photos and saved personal workspaces are excluded.

## Release evidence and maintenance

The GitHub release records the final source commit and downloadable `gridsmith-demo.html`; Actions records the checks for each commit. Use those records for exact results. This handoff does not claim a passing run for an unverified future commit.

Before changes, save a private JSON layout backup. After source or sample changes, run `python tools/build.py`, `python tools/build.py --check`, `npm test` and `npm run screenshots`. Regenerate the content inventory before another release. Keep the source assets, bundled HTML, screenshots and release attachment consistent.

Browser storage is local to an origin and can be cleared or fail. Dates do not schedule publishing, and exports do not restore resolution missing from the source images. See [tomorrow's optional work](TODO.md).

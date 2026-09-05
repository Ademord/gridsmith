# Gridsmith

A feed planner that keeps your photos and layouts in your browser. Arrange a grid, review crops from a collage, save named drafts, and download your posts in order. Dates are planning notes; Gridsmith does not publish to Instagram.

[GitHub Pages demo (publication pending)](https://ademord.github.io/gridsmith/) | [Download the offline demo](https://github.com/Ademord/gridsmith/releases/download/v1.0.0/gridsmith-demo.html) | [Source](https://github.com/Ademord/gridsmith) | [Checks](https://github.com/Ademord/gridsmith/actions/workflows/ci.yml)

GitHub Pages publication is waiting for approval to make this reviewed repository public. The offline demo and local preview work independently of hosting.

![Gridsmith sample workspace](docs/images/workspace.png)

The demo starts with **12 planned images, six library images and three posted references**. The first 18 images are owner-approved, previously unposted generated images, published as 300 x 400 PNGs with metadata removed. The three abstract posted references are fictional. Actual posted photos and saved personal workspaces are excluded.

Select **Start tour** to explore the planner, or arrange the samples yourself. The [demo guide](DEMO-GUIDE.md) covers both paths.

## Try it locally

Open the downloaded `gridsmith-demo.html` or the checkout's `demo/index.html` in a modern browser. To serve the checkout locally with Node.js 24:

```sh
npm run serve
```

Visit the localhost address printed by the server. The app has no account, backend, analytics, or external asset dependencies. Browser storage belongs to the current origin. Use **Save layout** before changing browsers, clearing storage, or moving between a local file and a hosted site.

## What you can do

- Drag photos into order, use Alt + arrow keys, or select several posts together.
- Review detected crops before importing. Select only the photos you want, correct rows, columns and gutters, or keep the original image intact.
- Add captions and dates, keep up to ten named drafts, and undo or redo changes.
- Switch among Charcoal, Violet, Amber and Light themes; preview the profile grid.
- Save a JSON backup including imported photos. Add the backup through **Add photos** to restore it.
- Export a ZIP with numbered JPEGs, captions, dates, and an image manifest that records actual dimensions and source quality.

Posted reference cards stay at the end of the feed. ZIP exports include them and exclude the library. The included sample cards are 300 x 400 pixels; exporting does not create higher resolution originals.

See [the short demo guide](DEMO-GUIDE.md) and [storage and security notes](SECURITY.md).

**Start tour** opens a 17-step guided demo over the real planner controls. It moves one bundled sample card and fills its blank caption/date fields. The guide waits for you to confirm imports, save drafts, choose themes, or start downloads. Your clicks and edits pause the tour; End tour preserves the work already done.

## Build and verify

Use Python 3.12 and Node.js 24. From a clean checkout:

```sh
python -m venv .venv
# Activate .venv using your platform's normal command.
python -m pip install -r requirements.txt
npm ci
npx playwright install chromium
python tools/build.py --check
npm test
```

On Linux, `npx playwright install --with-deps chromium` also installs system browser dependencies. The exact Pillow and Playwright versions are pinned. `npm test` starts and stops its own loopback server and uses fresh browser contexts. It writes JSON evidence and failure screenshots under ignored `test-results/`.

The checks exercise 16- and 30-photo review, selection and cancellation, corrected crops, original bytes, import persistence and undo/redo, drafts, backup restore, ZIP contents, all themes, keyboard controls, 390/320-pixel layouts, storage failure, and the complete guided demo with manual takeover. Each case rejects browser errors and HTTP asset/service requests. They are Chromium checks, not a claim of exhaustive cross-browser or device coverage.

After editing `planner_src/`, regenerate the standalone page and fixtures:

```sh
python tools/build.py
python tools/build.py --check
npm test
npm run screenshots
```

`tools/build.py` uses the 18 approved PNGs in `assets/` and bundles the standalone `demo/index.html`. Generated reference cards and collage fixtures use canonical PNG bytes, checked against fixed hashes and exact generated pixels, to preserve the same output across platforms. It does not need the original image collection or a saved workspace. Screenshot capture uses fresh demo contexts and writes `docs/images/`.

For an existing local browser installation, set `PLAYWRIGHT_CHANNEL` (for example `msedge`) or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. A configured runtime can use `PLAYWRIGHT_MODULE`; ordinary installs need no overrides.

## Update or recover

Before updating, use **Save layout** to download a backup. In your existing checkout:

```sh
git pull --ff-only
python -m pip install -r requirements.txt
npm ci
python tools/build.py --check
```

Reload the planner at the same address. Stored photos and layouts remain in that browser. If the update fails, keep your backup and use the previous release's standalone HTML. A different file or address may have separate browser storage; restore the backup through **Add photos**. Do not clear browser storage as an update step.

If storage is blocked or full, **Unsaved changes** appears in the header and notifications include backup advice. Download the layout before reloading, free storage or allow storage for the site, then restore the backup. An unsuccessful photo import stays open so you can retry or cancel.

## Continuous integration and hosting

[Browser checks](.github/workflows/ci.yml) verifies the committed generated page **before** rebuilding and runs the real Chromium suite on Linux. The separate [Publish sample demo](.github/workflows/pages.yml) workflow is manually dispatched. It repeats those checks before uploading only `demo/` to GitHub Pages. Configure repository Pages to use GitHub Actions and, where required, add approval protection to the `github-pages` environment before dispatching it.

The source snapshot and generated assets are inventoried in [PUBLIC-CONTENTS.json](PUBLIC-CONTENTS.json).

See [the release handoff](HANDOFF.md) for the implemented scope and release entry points, and [tomorrow's follow-ups](TODO.md) for optional further work.

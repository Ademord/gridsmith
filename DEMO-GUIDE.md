# A five-minute sample demo

Open the [live demo](https://ademord.github.io/gridsmith/) or download [gridsmith-demo.html](https://github.com/Ademord/gridsmith/releases/download/v1.0.0/gridsmith-demo.html) and open it directly. For a local checkout, run `npm run serve` and use the printed localhost URL.

In a fresh browser context, the workspace begins with 12 planned images and six library images approved for this demo, plus three fictional abstract posted references. The 18 approved images are previously unposted generated images, resized to 300 × 400 with metadata removed. Actual posted photos are excluded. Your browser may restore an arrangement you previously saved at the same address.

Select **Start tour** for a 17-step walkthrough anchored to the live controls. Next step advances explicitly, Pause tour stops timed progression, and End tour keeps your current work. The tour moves a bundled sample card and fills only its blank caption/date fields. Import confirmation and downloads always wait for you. Existing text is preserved; editing a field pauses the guide. Restart tour returns the guide to its first step without resetting the layout.

![The guided demo uses the live planner controls](docs/images/guided-tour.png)

For a manual demonstration:

1. **Arrange:** click a library card to put it at the top. Focus a planned card and press Alt + Right to move it one position. Undo and redo the change.
2. **Edit:** open a planned card, enter a sample caption and date, then close the preview. Dates are notes, not scheduled publishing.
3. **Draft:** open Drafts, save “Sample launch”, change the arrangement, then load the draft to restore it.
4. **Review an import:** add `tests/fixtures/grid-4x4.png` or `grid-6x5.png`. Review 16 or 30 detected photos. Try Select none, select a few crops and view one at full preview size. Cancel once to see that nothing is added.
5. **Correct the grid:** add the fixture again, choose Adjust grid, edit rows/columns/gutter, then Apply grid. Import stays unavailable until pending grid changes are applied. Choose “Original as one photo” to keep the whole image instead.
6. **Keep the result:** confirm the selection, reload, and check the imported cards in the library. Save layout downloads a JSON backup; add that file to restore it.
7. **Export:** Export posts downloads numbered JPEGs, `manifest.json`, `captions.csv`, and a readme. Check the manifest for dimensions and source quality. Library items are excluded; posted references are included at the end.
8. **Appearance:** use More feed options → Theme to try all four themes. Try a 390- or 320-pixel viewport and the import dialog's selection and confirmation controls.

![Review of the generated 30-photo fixture](docs/images/import-review.png)

## Reproduce screenshots and checks

Follow the dependency setup in [README.md](README.md), then run:

```sh
python tools/build.py --check
npm test
npm run screenshots
```

The screenshot script uses only the approved demo samples and synthetic collage fixtures in fresh browser contexts. It writes desktop, light theme, import review and mobile images to `docs/images/`. The test run writes its own evidence to ignored `test-results/`; a screenshot alone does not establish a passing test.

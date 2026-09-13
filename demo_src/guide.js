/* Gridsmith guide: a client of the real DOM controls, not a second planner. */
(function () {
  'use strict';
  if (document.getElementById('guide-start')) return;
  var q = function (s) { return document.querySelector(s); };
  var qa = function (s) { return Array.from(document.querySelectorAll(s)); };
  var visible = function (el) { return !!(el && el.getClientRects().length && !el.closest('[hidden]')); };
  var bundled = JSON.parse(q('#bundled').textContent);
  var sampleIds = new Set(bundled.filter(function (item) { return item.sample === true && !item.locked; }).map(function (item) { return item.id; }));
  var fixture = null;
  try { fixture = JSON.parse(q('#gridsmith-guide-fixture').textContent); } catch (e) {}
  var state = { mode: 'idle', index: -1, epoch: 0, timer: null, speed: 4500, busy: false, sample: null, changed: false, note: '', snapshot: '' };
  var dock, card, shade, hint, target, pointerHeld = false, deferredPause = false;
  var hintButton = null, hintTimer = null;
  var dismissed = false;
  try { dismissed = localStorage.getItem('gridsmith.demoDismissed') === 'true'; } catch (e) {}
  function control(selector) { var el = q(selector); if (!visible(el) || el.disabled) throw Error('This control is unavailable in your current view. Keep your work and use Skip step, or return to the view and try again.'); return el; }
  function click(selector) { control(selector).click(); }
  function field(selector, value) { var el = control(selector); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
  function sample() { var el = state.sample && q('#grid .tile[data-id="' + state.sample + '"]'); if (!el || el.classList.contains('locked')) throw Error('The sample card is no longer in this feed. No photo was changed. Use Skip step to continue.'); return el; }
  function chooseSample() { var el = qa('#grid .tile:not(.locked)').find(function (node) { return sampleIds.has(node.dataset.id); }); state.sample = el ? el.dataset.id : null; return el; }
  function closePost() { if (visible(q('.lightbox.on'))) click('.lbclose'); }
  function noModal() { if (q('dialog[open]') || visible(q('.lightbox.on'))) throw Error('An editor is already open. Close it when ready, then use Next step. The guide keeps your inputs.'); }
  function guideImport() {
    var file = q('#import-review .import-file h3');
    if (!q('#import-review[open]') || !fixture || !file || file.textContent !== fixture.name || qa('#import-review .import-file').length !== 1) throw Error('This is not the guide’s sample import. Your import is preserved. Finish or cancel it, then use Skip step.');
  }
  function closeCrop() { if (q('#import-crop-view[open]')) click('#import-crop-view button'); }
  function closeGuideImport() { closeCrop(); if (q('#import-review[open]')) { guideImport(); click('#import-review .import-cancel'); } }
  async function stageGrid() {
    noModal();
    if (!fixture || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(fixture.src || '')) throw Error('The sample grid is unavailable. Use Add photos to review your own image.');
    var binary = atob(fixture.src.split(',')[1]);
    var bytes = Uint8Array.from(binary, function (c) { return c.charCodeAt(0); });
    var transfer = new DataTransfer(); transfer.items.add(new File([bytes], fixture.name, { type: 'image/png' }));
    q('#collageinput').files = transfer.files;
    q('#collageinput').dispatchEvent(new Event('change', { bubbles: true }));
  }
  var steps = [
    { title: 'Your feed and library', target: '.grid-meta', text: 'The starting demo has 21 planned cards, 6 in the Library and 3 fictional posted references. Samples are 300 × 400 pixels. Your current layout may differ; the guide keeps existing photos and captions.', action: function () { noModal(); chooseSample(); if (document.body.classList.contains('preview-mode')) click('#planview'); } },
    { title: 'Move a sample card', target: function () { return state.sample ? '#grid .tile[data-id="' + state.sample + '"]' : '#grid'; }, text: 'The guide moves one demo photo with the real Alt + Right Arrow shortcut. Drag a photo to insert or swap it. Undo remains available.', action: function () { if (qa('.tile.selected,.bitem.selected').length) throw Error('You have a selection. Clear it when ready or skip this step; the guide will not replace it.'); var node = sample(); node.focus(); node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true })); } },
    { title: 'Edit a post', target: '.lbmeta', text: 'The post editor holds its caption and planned date. Dates are planning notes; this app does not schedule Instagram posts.', action: function () { sample().click(); } },
    { title: 'Caption and planned date', target: '.lbmeta', text: 'The guide fills only blank fields on this demo photo. Existing captions and dates are preserved. Edits save through the normal editor.', action: function () { var node = sample(); if (!visible(q('.lightbox.on')) || !q('.lightbox.on img').alt.endsWith(node.dataset.id)) throw Error('A different post is open. Its fields were preserved. Use Skip step or reopen the sample card.'); if (!q('.lbcaption').value) field('.lbcaption', 'Sample post: morning in town.'); if (!q('.lbdate').value) field('.lbdate', '2026-09-12'); }, manual: true },
    { title: 'Preview the profile grid', target: '#grid .tile', text: 'Preview shows the 3:4 profile grid. Return to Arrange to move photos and change the working column count.', action: function () { closePost(); click('#feedpreview'); } },
    { title: 'Select several photos', target: '#selectposts', text: 'Select shows the selection controls. Choose photos to move them together. This guide leaves any existing selection in place.', action: function () { click('#planview'); if (q('#selectposts').getAttribute('aria-pressed') !== 'true') click('#selectposts'); }, manual: true },
    { title: 'Use the photo library', target: '.library-heading', text: 'The Library holds photos outside the feed. Search captions or file names. Click a library photo to add it to the top, or drag it into place.', action: function () { if (q('#selectposts').getAttribute('aria-pressed') === 'true' && !qa('.tile.selected,.bitem.selected').length) click('#selectposts'); if (q('#library-collapse').getAttribute('aria-expanded') === 'false') click('#library-collapse'); } },
    { title: 'Review a sample grid import', target: '#import-review .import-file-head', text: 'This generated 4 × 4 image goes through the actual collage importer. No photo is added to the Library until you confirm the import.', action: stageGrid, ready: '#import-review .import-tile' },
    { title: 'Choose which crops to keep', target: '#import-review .import-selection', text: 'Each crop has a checkbox. Select all and Select none update the actual pending selection. Try deselecting a crop; your click pauses the guide.', action: function () { guideImport(); }, manual: true },
    { title: 'Inspect a crop', target: '#import-crop-view .import-crop-image', text: 'View crop opens a larger preview with pixel dimensions. Closing it returns to the same pending selection.', action: function () { guideImport(); click('#import-review .import-view-crop'); } },
    { title: 'Adjust the grid', target: '#import-review .import-grid-fields', text: 'Manual grid sets rows, columns and the gap in source pixels. The guide applies 4 × 4 with a 3-pixel gutter to this sample only.', action: function () { closeCrop(); guideImport(); click('#import-review .import-adjust-grid'); field('#import-review .import-rows', String(fixture.rows)); field('#import-review .import-columns', String(fixture.columns)); field('#import-review .import-gutter', String(fixture.gutter)); click('#import-review .import-apply-grid'); }, manual: true },
    { title: 'Confirm the import yourself', target: '#import-review .import-actions', text: 'Use the actual Import button to add the selected crops, or Cancel to keep the Library unchanged. The guide never confirms an import. Next step cancels this sample review if it is still open.', action: function () { guideImport(); }, manual: true },
    { title: 'Save a draft', target: '#draft-name', text: 'Name the current layout and select Save draft. Drafts retain the order, captions and dates. Saving here stays in this browser; no download starts.', action: function () { closeGuideImport(); noModal(); click('#drafts-toggle'); }, manual: true },
    { title: 'Try all four themes', target: '#planner-theme', text: 'Choose Charcoal, Violet, Amber or Light. Theme is a separate browser preference; it does not change the photos or draft contents.', action: function () { var draft = q('#draft-panel[open], #draft-dialog[open]'); if (draft) draft.querySelector('.panel-close').click(); else qa('dialog[open]').forEach(function (d) { if (d.querySelector('#draft-name')) d.querySelector('.panel-close').click(); }); noModal(); q('.more-menu').open = true; }, manual: true },
    { title: 'Save a portable layout', target: '#savelayout', text: 'Save layout downloads a backup with your arrangement, captions and imported photos. Select it yourself when ready. The guide does not start downloads.', action: function () { q('.more-menu').open = false; }, manual: true },
    { title: 'Export posts in feed order', target: '#exportposts', text: 'Export posts downloads a ZIP in feed order, with captions and actual dimensions. Demo samples export at 300 × 400, without enlargement; the three posted references are fictional. Select the real button when ready.', action: function () {}, manual: true },
    { title: 'Keep working', target: '#grid', text: 'The tour is complete. Photos, captions, drafts and confirmed imports remain in place. Restart tour resets only the guide; it never uses Reset layout.', action: function () { noModal(); } },
  ];
  function selector(step) { return typeof step.target === 'function' ? step.target() : step.target; }
  function fingerprint() {
    return JSON.stringify({ ids: qa('#grid .tile,#railitems .bitem').map(function (n) { return n.dataset.id; }),
      modals: qa('dialog[open],.lightbox.on').map(function (n) { return n.id || n.className; }),
      inputs: qa('dialog[open] input,dialog[open] select,.lightbox.on input,.lightbox.on textarea,#library-search').map(function (n) { return [n.type, n.value, n.checked]; }),
      selected: qa('.tile.selected,.bitem.selected').map(function (n) { return n.dataset.id; }),
      theme: document.documentElement.dataset.theme, preview: document.body.classList.contains('preview-mode') });
  }
  function stopTimer() { clearTimeout(state.timer); state.timer = null; }
  function active() { return state.mode !== 'idle'; }
  function topSurface() { var dialogs = qa('dialog[open]'); return dialogs[dialogs.length - 1] || q('.lightbox.on') || document.body; }
  function mount() {
    var parent = topSurface();
    if (hint && hint.matches(':popover-open') && (hint.closest('dialog,.lightbox') || document.body) !== parent) closeHint();
    qa('.guide-host').forEach(function (host) { if (host !== parent) { host.classList.remove('guide-host', 'guide-constrained'); host.style.removeProperty('--guide-clearance'); } });
    if (parent !== document.body) parent.classList.add('guide-host');
    if (card.parentElement !== parent) { if (card.matches(':popover-open')) card.hidePopover(); if (shade.matches(':popover-open')) shade.hidePopover(); parent.append(shade, card); }
    card.inert = false; shade.inert = false;
    if (!shade.matches(':popover-open')) shade.showPopover();
    if (!card.matches(':popover-open')) card.showPopover();
  }
  function place() {
    if (!active() || state.index < 0 || pointerHeld) return;
    mount();
    if (target) target.classList.remove('guide-target');
    target = q(selector(steps[state.index]));
    var anchor = visible(target) ? target : topSurface();
    if (target) target.classList.add('guide-target');
    var r = anchor.getBoundingClientRect(), w = innerWidth, h = innerHeight;
    var surface = topSurface(), constrained = surface !== document.body && (w <= 600 || h <= 600);
    card.dataset.compact = String(constrained && h <= 600);
    q('#guide-details').hidden = !(constrained && h <= 600);
    surface.classList.toggle('guide-constrained', constrained);
    var width = Math.min(354, w - 24); card.style.width = width + 'px';
    var height = card.getBoundingClientRect().height, x = w - width - 14, y = h - height - 14;
    if (constrained) { x = (w - width) / 2; y = 12; surface.style.setProperty('--guide-clearance', (height + 26) + 'px'); }
    else if (r.right + width + 26 < w) { x = r.right + 13; y = r.top; }
    else if (r.left - width - 26 > 0) { x = r.left - width - 13; y = r.top; }
    else if (r.bottom + height + 26 < h) { x = r.left; y = r.bottom + 13; }
    else if (r.top - height - 26 > 0) { x = r.left; y = r.top - height - 13; }
    card.style.left = Math.max(12, Math.min(x, w - width - 12)) + 'px';
    card.style.top = Math.max(12, Math.min(y, h - height - 12)) + 'px';
    r = anchor.getBoundingClientRect();
    var l = Math.max(0, r.left - 5), t = Math.max(0, r.top - 5), b = Math.min(h, r.bottom + 5), right = Math.min(w, r.right + 5);
    shade.innerHTML = '<svg width="' + w + '" height="' + h + '" aria-hidden="true"><path fill-rule="evenodd" d="M0 0H' + w + 'V' + h + 'H0Z M' + l + ' ' + t + 'H' + right + 'V' + b + 'H' + l + 'Z"/></svg>';
    shade.dataset.paused = String(state.mode === 'paused');
  }
  function render() {
    if (state.index < 0) return;
    card.dataset.step = String(state.index + 1); card.dataset.status = state.mode;
    q('#guide-state').textContent = ({ running: 'Playing', paused: 'Paused', waiting: 'Your turn', complete: 'Tour complete' })[state.mode];
    q('#guide-title').textContent = steps[state.index].title;
    q('#guide-description').textContent = steps[state.index].text;
    q('#guide-count').textContent = (state.index + 1) + ' / ' + steps.length;
    q('#guide-progress').value = state.index + 1;
    q('#guide-note').textContent = state.note; q('#guide-note').hidden = !state.note;
    q('#guide-pause').textContent = state.mode === 'paused' ? 'Resume tour' : 'Pause tour';
    q('#guide-pause').hidden = state.mode === 'waiting' || state.mode === 'complete';
    q('#guide-next').textContent = state.index === steps.length - 1 ? 'Finish tour' : 'Next step';
    q('#guide-next').hidden = state.mode === 'complete';
    q('#guide-next').disabled = state.busy; q('#guide-restart').disabled = state.busy;
    q('#guide-end').textContent = state.mode === 'complete' ? 'Close tour' : 'End tour';
    q('#guide-instruction').textContent = state.mode === 'running' ? 'Your click or key pauses the tour.' : state.mode === 'waiting' ? 'Use the real controls, then choose Next step.' : state.mode === 'paused' ? 'Your inputs stay in place. Next step continues explicitly.' : 'Restart changes only the guide position.';
    dock.hidden = true; mount(); place();
  }
  function schedule() { stopTimer(); if (state.mode === 'running') state.timer = setTimeout(function () { advance(); }, state.speed); }
  function pause(note, keepSnapshot) { if (state.mode !== 'running' && state.mode !== 'waiting') return; stopTimer(); state.epoch++; state.busy = false; state.mode = 'paused'; if (!keepSnapshot) state.snapshot = fingerprint(); state.note = note || ''; if (pointerHeld) { deferredPause = true; card.dataset.status = 'paused'; } else render(); }
  async function waitFor(s, epoch) { for (var i = 0; i < 200; i++) { if (epoch !== state.epoch) return false; if (visible(q(s))) return true; await new Promise(function (resolve) { setTimeout(resolve, 35); }); } throw Error('The next view did not appear. Your work is preserved. Use Skip step or try Next step again.'); }
  async function advance(skip) {
    stopTimer(); closeHint(); if (state.busy) return;
    if (state.index === steps.length - 1) { state.mode = 'complete'; state.note = ''; render(); return; }
    var next = state.index + 1;
    if (skip) next = Math.min(next + 1, steps.length - 1);
    var step = steps[next], epoch = ++state.epoch;
    state.busy = true; state.note = '';
    try {
      if (step.action) await step.action();
      if (!(await waitFor(step.ready || selector(step), epoch)) || epoch !== state.epoch) return;
      state.index = next; state.busy = false; state.mode = step.manual ? 'waiting' : 'running';
      state.snapshot = fingerprint(); render();
      q(selector(step)).scrollIntoView({ block: 'center', behavior: 'instant' }); place(); schedule();
      q('#guide-next').focus({ preventScroll: true });
    } catch (error) { if (epoch !== state.epoch) return; state.busy = false; state.mode = 'paused'; state.note = error.message; if (state.index < 0) state.index = 0; render(); }
  }
  function end() {
    stopTimer(); state.epoch++; state.busy = false; state.mode = 'idle'; deferredPause = false;
    qa('.guide-host').forEach(function (host) { host.classList.remove('guide-host', 'guide-constrained'); host.style.removeProperty('--guide-clearance'); });
    if (target) target.classList.remove('guide-target');
    if (card.matches(':popover-open')) card.hidePopover(); if (shade.matches(':popover-open')) shade.hidePopover(); dock.hidden = dismissed;
    var surface = topSurface(); var focus = surface === document.body ? q(dismissed ? '#helpbutton' : '#guide-start') : surface.querySelector('button:not(:disabled),input');
    if (focus) focus.focus({ preventScroll: true });
  }
  function start() {
    stopTimer(); state.epoch++; state.busy = false; state.index = -1; state.mode = 'running'; state.note = ''; chooseSample();
    advance();
  }
  function closeHint() { clearTimeout(hintTimer); if (hint.matches(':popover-open')) hint.hidePopover(); }
  function currentHint() { return hintButton && visible(hintButton) && (hintButton.closest('dialog,.lightbox') || document.body) === topSurface(); }
  function scheduleHintClose() { clearTimeout(hintTimer); hintTimer = setTimeout(function () { if (!hint.matches(':hover') && !(hintButton && (hintButton.matches(':hover') || document.activeElement === hintButton))) closeHint(); }, 180); }
  function showHint(button) {
    closeHint(); hintButton = button; var surface = button.closest('dialog,.lightbox') || document.body; surface.appendChild(hint); hint.inert = false;
    hint.textContent = button.dataset.guideHelp; hint.showPopover();
    var r = button.getBoundingClientRect(); hint.style.left = Math.max(10, Math.min(r.left, innerWidth - 292)) + 'px';
    hint.style.top = Math.max(10, Math.min(r.bottom + 7, innerHeight - hint.getBoundingClientRect().height - 10)) + 'px';
  }
  function addHelp(anchor, text) {
    var el = q(anchor); if (!el || el.dataset.guideHelpAttached || el.parentElement.querySelector('.guide-help')) return;
    el.dataset.guideHelpAttached = 'true';
    var button = document.createElement('button'); button.type = 'button'; button.className = 'guide-help'; button.textContent = 'i'; button.dataset.guideHelp = text;
    button.setAttribute('aria-label', 'Help: ' + text.split('.')[0]); button.setAttribute('aria-describedby', 'guide-hint');
    var wrappingLabel = el.matches('input,textarea') && el.closest('label');
    if (wrappingLabel) {
      // Keep the live field in place: reparenting it during typing drops focus.
      button.classList.add('guide-field-help'); wrappingLabel.insertAdjacentElement('afterend', button);
    } else el.insertAdjacentElement('afterend', button);
    var openBeforePointer = false;
    button.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') showHint(button); });
    button.addEventListener('pointerdown', function () { openBeforePointer = hintButton === button && hint.matches(':popover-open'); });
    button.addEventListener('focus', function () { showHint(button); });
    button.addEventListener('blur', scheduleHintClose);
    button.addEventListener('pointerleave', scheduleHintClose);
    button.addEventListener('click', function (e) { e.stopPropagation(); if (openBeforePointer || (e.detail === 0 && hintButton === button && hint.matches(':popover-open'))) closeHint(); else showHint(button); openBeforePointer = false; });
  }
  function helpAll() {
    addHelp('.grid-meta #grid-context', 'Arrange photos by dragging, or focus one and use Alt + arrow keys. Posted cards stay at the end. The demo’s three posted references are fictional; bundled samples export at 300 × 400 pixels.');
    addHelp('.library-heading h2', 'Library photos are outside the feed. Click to add one at the top or drag it into position.');
    addHelp('#import-review-title', 'Review crops before importing. Selection, full crop previews and Manual grid change only the pending import.');
    addHelp('.lbcaption', 'Captions save as you type. Planned dates are notes and do not schedule Instagram posts.');
    addHelp('#draft-name', 'Save draft keeps the current arrangement, captions and dates in this browser. Save layout downloads a portable backup.');
    addHelp('#planner-theme-label', 'Charcoal, Violet, Amber and Light change the interface only. Theme stays separate from layout backups.');
  }
  function setup() {
    dock = document.createElement('section'); dock.className = 'guide-dock'; dock.setAttribute('aria-label', 'Demo options');
    dock.innerHTML = '<div class="guide-dock-copy"><strong>Try the demo samples</strong><span id="guide-start-info">Review a grid or take the tour. Find both in Help anytime.</span><span id="guide-manual-status" role="status" hidden></span></div><div class="guide-dock-actions"><button id="guide-try-import" type="button" aria-describedby="guide-start-info">Try a grid import</button><button data-add-samples type="button" hidden>Add 9 sample photos</button><button id="guide-start" type="button" class="btn-primary" aria-describedby="guide-start-info">Start tour</button></div><button id="guide-dismiss" type="button" aria-label="Dismiss demo invitation" title="Find the demo in Help">×</button>';
    dock.hidden = dismissed;
    shade = document.createElement('div'); shade.className = 'guide-shade'; shade.setAttribute('popover', 'manual'); shade.setAttribute('aria-hidden', 'true');
    card = document.createElement('section'); card.id = 'guide-card'; card.className = 'guide-card'; card.setAttribute('popover', 'manual'); card.setAttribute('aria-label', 'Gridsmith guided demo');
    card.innerHTML = '<div class="guide-header"><span id="guide-state"></span><span id="guide-count"></span></div><progress id="guide-progress" max="' + steps.length + '" aria-label="Tour progress"></progress><h2 id="guide-title"></h2><p id="guide-description" aria-live="polite"></p><p id="guide-note" role="status" hidden></p><div class="guide-controls"><button id="guide-next" class="btn-primary">Next step</button><button id="guide-pause">Pause tour</button><button id="guide-end">End tour</button></div><div class="guide-options"><label>Speed <select id="guide-speed" aria-label="Tour speed"><option value="2000">Fast · 2s</option><option value="4500" selected>Normal · 4.5s</option><option value="8000">Slow · 8s</option></select></label><button id="guide-skip">Skip step</button><button id="guide-restart">Restart tour</button></div><p id="guide-instruction"></p>';
    hint = document.createElement('div'); hint.id = 'guide-hint'; hint.className = 'guide-hint'; hint.setAttribute('role', 'tooltip'); hint.setAttribute('popover', 'manual');
    hint.addEventListener('pointerenter', function () { clearTimeout(hintTimer); });
    hint.addEventListener('pointerleave', scheduleHintClose);
    q('.main .top').insertAdjacentElement('afterend', dock);
    document.body.append(shade, card, hint);
    var help = document.createElement('div'); help.className = 'guide-help-entry help-row';
    help.innerHTML = '<strong>Demo samples</strong><p>Try a grid import or explore the planner with a guided tour. Your existing work stays in place.</p><div class="guide-dock-actions"><button id="guide-help-import" type="button">Try a grid import</button><button data-add-samples type="button" hidden>Add 9 sample photos</button><button id="guide-help-start" type="button" class="btn-primary">Start tour</button></div><p id="guide-help-status" role="status" hidden></p>';
    q('#help-dialog .panel-body').prepend(help);
    function refreshSamples() {
      // Library filtering retains its nodes, including photos hidden by search.
      var current = new Set(qa('#grid .tile,#railitems .bitem').map(function (node) { return node.dataset.id; }));
      var missing = Array.from(sampleIds).filter(function (id) { return /^sample_(2[2-9]|30)$/.test(id) && !current.has(id); }).length;
      qa('[data-add-samples]').forEach(function (button) {
        button.hidden = !missing;
        var label = 'Add ' + missing + ' sample photo' + (missing === 1 ? '' : 's');
        if (button.textContent !== label) button.textContent = label;
      });
    }
    qa('[data-add-samples]').forEach(function (button) {
      button.onclick = function () {
        if (active()) end();
        if (q('#help-dialog[open]')) { q('#help-dialog').close(); q('#helpbutton').focus({ preventScroll: true }); }
        document.dispatchEvent(new Event('gridsmith:add-samples'));
      };
    });
    refreshSamples();
    var details = document.createElement('button'); details.id = 'guide-details'; details.textContent = 'Details'; details.hidden = true; details.setAttribute('aria-describedby', 'guide-hint');
    q('.guide-options').appendChild(details);
    details.onclick = function () { if (hintButton === details && hint.matches(':popover-open')) closeHint(); else { details.dataset.guideHelp = steps[state.index].text; showHint(details); } };
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    q('#guide-start').onclick = start; q('#guide-next').onclick = function () { advance(); }; q('#guide-skip').onclick = function () { advance(true); }; q('#guide-end').onclick = end; q('#guide-restart').onclick = start;
    q('#guide-dismiss').onclick = function () {
      dismissed = true; dock.hidden = true;
      try { localStorage.setItem('gridsmith.demoDismissed', 'true'); } catch (e) {}
      q('#grid').focus({ preventScroll: true });
    };
    q('#guide-help-start').onclick = function () { q('#help-dialog').close(); start(); };
    async function manualImport(fromHelp) {
      if (fromHelp) { if (active()) end(); q('#help-dialog').close(); q('#helpbutton').focus({ preventScroll: true }); }
      if (active()) return;
      closeHint();
      var status = q(fromHelp ? '#guide-help-status' : '#guide-manual-status'); status.hidden = true; status.textContent = '';
      try { await stageGrid(); }
      catch (error) { status.textContent = error.message; status.hidden = false; if (fromHelp) q('#helpbutton').click(); }
    }
    q('#guide-try-import').onclick = function () { manualImport(false); };
    q('#guide-help-import').onclick = function () { manualImport(true); };
    q('#guide-pause').onclick = function () {
      if (state.mode !== 'paused') return pause();
      if (state.snapshot !== fingerprint()) { state.note = 'Your view or inputs changed. They are preserved. Use Next step to continue explicitly, Skip step, or End tour.'; render(); return; }
      state.note = ''; state.mode = steps[state.index].manual ? 'waiting' : 'running'; render(); schedule();
    };
    q('#guide-speed').onchange = function (e) { state.speed = Number(e.target.value); schedule(); };
    function manual(e) { if (!e.isTrusted || e.target.closest('.guide-card,.guide-dock,.guide-help,.guide-hint')) return; if (e.type === 'keydown' && ['Tab','Shift','Control','Alt','Meta'].includes(e.key)) return; if (e.type === 'pointerdown') pointerHeld = true; pause('You took over. Your changes stay in place.', true); }
    document.addEventListener('pointerdown', manual, true); document.addEventListener('input', manual, true);
    function releasePointer() { setTimeout(function () { pointerHeld = false; if (deferredPause && active()) { deferredPause = false; render(); } }, 0); }
    document.addEventListener('pointerup', releasePointer, true); document.addEventListener('pointercancel', releasePointer, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && hint.matches(':popover-open')) { var consumeEscape = currentHint(); closeHint(); if (consumeEscape) { e.preventDefault(); e.stopImmediatePropagation(); return; } }
      if (e.key === 'Escape' && active()) { e.preventDefault(); e.stopImmediatePropagation(); end(); return; }
      if (e.key === 'Tab' && active() && topSurface() !== document.body) {
        var surface = topSurface();
        var controls = Array.from(surface.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')).filter(function (el) { return visible(el) && !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]'); });
        if (controls.length) { var index = controls.indexOf(document.activeElement); e.preventDefault(); e.stopImmediatePropagation(); controls[(index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length].focus({ preventScroll: false }); return; }
      }
      manual(e);
    }, true);
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause('Tour paused while the page was in the background.'); });
    var pending = false;
    function reposition() { refreshSamples(); if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; if (hint.matches(':popover-open') && !currentHint()) closeHint(); if (active()) place(); helpAll(); }); }
    document.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition);
    document.addEventListener('close', reposition, true); document.addEventListener('toggle', reposition, true);
    new ResizeObserver(reposition).observe(card);
    new MutationObserver(function (changes) { if (changes.some(function (c) { return !c.target.closest('.guide-card,.guide-shade,.guide-hint'); })) reposition(); }).observe(document.body, { childList: true, subtree: true });
    helpAll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();

(function(){
  var bundled = JSON.parse(document.getElementById('bundled').textContent);
  var byId = Object.create(null), lockedIds = [], defaultOrder = [];
  bundled.forEach(function(b){
    byId[b.id] = b.src;
    if (b.locked) lockedIds.push(b.id); else defaultOrder.push(b.id);
  });
  var LS = 'gridsmith.v3';
  var state = { order: defaultOrder.slice(), backlog: [], cols: 3, railw: 0, railh: false, meta: {}, drafts: [] };
  var savedInit = null;
  try { savedInit = JSON.parse(document.getElementById('savedstate').textContent); } catch(e){}
  if (savedInit && Array.isArray(savedInit.added))
    savedInit.added.forEach(function(r){ if (validAdded(r)) byId[r.id] = r.src; });
  try {
    var raw = localStorage.getItem(LS) || localStorage.getItem('gridsmith.v2') || localStorage.getItem('gridsmith.v1');
    var s = raw ? JSON.parse(raw) : savedInit;
    if (s && Array.isArray(s.order)) state = {
      order: cleanIds(s.order),
      backlog: cleanIds(s.backlog || s.hidden).filter(function(id){ return s.order.indexOf(id) < 0; }),
      cols: [3,4,5].indexOf(s.cols) >= 0 ? s.cols : 3,
      railw: (typeof s.railw === 'number' && s.railw >= 84) ? s.railw : 0,
      railh: !!s.railh,
      meta: sanitizeMeta(s.meta), drafts: sanitizeDrafts(s.drafts) };
  } catch(e){}
  function sweepOrphans(){
    Object.keys(byId).forEach(function(id){
      if (!isUser(id)) return;
      if (state.order.indexOf(id) < 0 && state.backlog.indexOf(id) < 0) state.backlog.push(id);
    });
  }
  var db = null;
  function idb(){ return new Promise(function(res){
    var settled=false,timer;
    function finish(value){if(settled){if(value)value.close();return;}settled=true;clearTimeout(timer);res(value);}
    timer=setTimeout(function(){finish(null);},8000);
    try { var r = indexedDB.open('gridsmith', 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore('added', {keyPath:'id'}); };
      r.onsuccess = function(){ finish(r.result); };
      r.onerror = r.onblocked = function(){ finish(null); };
    } catch(e){ finish(null); } }); }
  function saveNotice(ok){
    var note = document.querySelector('.local-note');
    if (!note) return;
    note.textContent = ok ? 'Stored in this browser' : 'Unsaved changes · Save layout';
    note.classList.toggle('storage-warning', !ok);
    note.setAttribute('role', 'status');
  }
  function save(){
    try { localStorage.setItem(LS, JSON.stringify(state)); save.failed = false; saveNotice(true); return true; }
    catch(e){
      var firstFailure = !save.failed;
      save.failed = true; saveNotice(false);
      if (firstFailure) toast('Browser storage is full or blocked. Use Save layout to keep a backup.');
      return false;
    }
  }
  function toast(m){ if(save.failed && !/storage/i.test(m))m += ' Browser storage is unavailable. Use Save layout to keep a backup.'; var t = document.getElementById('toast'); t.textContent = m; t.classList.add('on');
    clearTimeout(toast._h); toast._h = setTimeout(function(){ t.classList.remove('on'); }, 2600); }
  function isUser(id){ return typeof id === 'string' && id.charAt(0) === 'u'; }
  function cleanIds(raw){
    var seen = Object.create(null);
    return (Array.isArray(raw) ? raw : []).filter(function(id){
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].indexOf(id) >= 0 || lockedIds.indexOf(id) >= 0 || seen[id]) return false;
      seen[id] = true; return true;
    });
  }
  function validAdded(r){
    return r && isUser(r.id) && /^[A-Za-z0-9_-]+$/.test(r.id) && typeof r.src === 'string' && /^data:image\/(jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/.test(r.src);
  }

  // ---- F8 captions + planned dates. state.meta = { id: {c, d} }, additive in both
  // buildSaved() and the localStorage/import loaders - an id absent from meta simply
  // has no caption/date. sanitizeMeta guards untrusted input (an old save, a dropped
  // third-party layout file) so a malformed meta blob can't wedge state: only plain
  // string c/d survive, and an entry with neither is dropped rather than kept as dead
  // weight (this is also what keeps meta from growing unbounded across many edits).
  function sanitizeMeta(raw){
    var out = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)){
      Object.keys(raw).forEach(function(id){
        var v = raw[id];
        if (!v || typeof v !== 'object') return;
        if (!/^[A-Za-z0-9_-]+$/.test(id) || id === '__proto__') return;
        var c = typeof v.c === 'string' ? v.c.slice(0, 2200) : '';
        var d = typeof v.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.d) ? v.d : '';
        if (c || d) out[id] = { c: c, d: d };
      });
    }
    return out;
  }
  function hasMeta(id){ var m = state.meta[id]; return !!(m && (m.c || m.d)); }
  function syncMeta(node, id){
    if (hasMeta(id)) node.dataset.hasmeta = ''; else delete node.dataset.hasmeta;
    syncTileLabel(node, id);
  }

  // ---- undo/redo (content mutations only - view prefs like cols/railw/railh are excluded) ----
  var UNDO_MAX = 20;
  var undoStack = [], redoStack = [];
  function snapshot(){
    var added = {};
    Object.keys(byId).forEach(function(id){ if (isUser(id)) added[id] = byId[id]; });
    return { order: state.order.slice(), backlog: state.backlog.slice(), added: added,
      meta: sanitizeMeta(state.meta), drafts: sanitizeDrafts(state.drafts) };
  }
  function pushUndo(){
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack = [];
    updateUndoUI();
  }
  function applySnapshot(snap){
    dismissSplitChip(); // undo/redo can invalidate the ids/merge a live split chip refers to
    lbMetaUndoId = null;
    Object.keys(byId).forEach(function(id){
      if (isUser(id) && !(id in snap.added)){
        delete byId[id];
        if (db) { try { db.transaction('added','readwrite').objectStore('added').delete(id); } catch(e){} }
      }
    });
    Object.keys(snap.added).forEach(function(id){
      if (byId[id] !== snap.added[id]){
        byId[id] = snap.added[id];
        if (db) { try { db.transaction('added','readwrite').objectStore('added').put({id: id, src: snap.added[id]}); } catch(e){} }
      }
    });
    state.order = snap.order.slice();
    state.backlog = snap.backlog.slice();
    state.meta = sanitizeMeta(snap.meta);
    state.drafts = sanitizeDrafts(snap.drafts);
    save(); render();
  }
  function updateUndoUI(){
    document.getElementById('undo').disabled = !undoStack.length;
    var redo = document.getElementById('redo'); if (redo) redo.disabled = !redoStack.length;
  }
  function doUndo(){
    if (!undoStack.length) return;
    var cur = snapshot();
    var prev = undoStack.pop();
    redoStack.push(cur);
    if (redoStack.length > UNDO_MAX) redoStack.shift();
    applySnapshot(prev);
    updateUndoUI();
    toast('Undone');
  }
  function doRedo(){
    if (!redoStack.length) return;
    var cur = snapshot();
    var next = redoStack.pop();
    undoStack.push(cur);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    applySnapshot(next);
    updateUndoUI();
    toast('Redone');
  }

  // File exports use native browser downloads, never host publication services.
  function getDls(){ return Promise.resolve(null); }
  function toBlob(uri){
    var bin = atob(uri.split(',')[1]);
    var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], {type: 'image/jpeg'});
  }
  // attemptSave retries a rate_limited rejection with a short backoff instead of dropping
  // the save - the F5 batch path below sequences saves one at a time so true concurrency
  // never happens, but this is a backstop in case the capability also rate-limits by time.
  function attemptSave(d, id, blob, attemptsLeft){
    return d.save({filename: id + '.jpg', data: blob}).catch(function(e){
      if (e && e.code === 'rate_limited' && attemptsLeft > 0)
        return new Promise(function(res){ setTimeout(res, 350); })
          .then(function(){ return attemptSave(d, id, blob, attemptsLeft - 1); });
      throw e;
    });
  }
  // quiet=true (F5 batch save, see doSaveSelection): suppress the per-image toast and
  // rethrow any failure instead of swallowing it, so the batch sequencer can stop and
  // report what actually happened instead of a blanket success toast. Returns a promise.
  function saveImage(id, quiet){
    var blob = toBlob(byId[id]);
    var note = isUser(id) ? 'Saved' : 'Saved (preview size - full resolution is in the zip)';
    return getDls().then(function(d){
      if (d) return attemptSave(d, id, blob, 8).then(function(){ if (!quiet) toast(note); });
      try { var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = id + '.jpg';
        document.body.appendChild(a); a.click(); a.remove();
        if (!quiet) toast(note);
      } catch(e){ if (!quiet) toast('Saving is not available here'); throw e; }
    }).catch(function(e){
      if (quiet) throw e;
      if (e && e.code === 'declined') return;
      if (e && e.code === 'rate_limited'){ toast('One save at a time - try again in a moment'); return; }
      toast('Saving is not available here');
    });
  }

  var grid = document.getElementById('grid');
  var railitems = document.getElementById('railitems');
  var dragId = null;
  var selection = {}; // F5 multi-select: id -> true. Not persisted (view/session state only).
  // ---- incremental DOM (F3): tile/bitem nodes are created once and reused across
  // renders - render() moves/creates/removes only the nodes whose membership or
  // order actually changed, instead of wiping and rebuilding the whole grid/rail
  // (and re-attaching every listener) on every single mutation.
  var tileNodes = {}, bitemNodes = {};
  var endzoneEl = document.createElement('div'); endzoneEl.className = 'endzone'; endzoneEl.textContent = 'drop here';
  endzoneEl.addEventListener('dragover', function(ev){ if (dragId){ ev.preventDefault(); endzoneEl.classList.add('over'); } });
  endzoneEl.addEventListener('dragleave', function(){ endzoneEl.classList.remove('over'); });
  endzoneEl.addEventListener('drop', function(ev){ if (!dragId) return; ev.preventDefault(); ev.stopPropagation();
    orderAppendEnd(dragId); });
  var railEmptyEl = document.createElement('div'); railEmptyEl.className = 'railempty';
  railEmptyEl.textContent = 'Drop images here or hit \u2715 on a tile';
  function takeOut(id){
    state.order = state.order.filter(function(i){ return i !== id; });
    state.backlog = state.backlog.filter(function(i){ return i !== id; });
  }
  function toBacklog(id){
    var focused = document.activeElement && document.activeElement.closest('.tile');
    var restoreFocus = focused && focused.dataset.id === id;
    pushUndo(); takeOut(id); state.backlog.unshift(id); save(); render();
    if (restoreFocus){ var next = !state.railh ? bitemNodes[id] : grid.querySelector('.tile'); if (next) next.focus({preventScroll:true}); }
  }
  function moveBy(id, step){
    var sequence = state.order.indexOf(id) >= 0 ? state.order : state.backlog;
    var from = sequence.indexOf(id), to = from + step;
    if (from < 0 || to < 0 || to >= sequence.length || lockedIds.indexOf(id) >= 0) return;
    pushUndo(); sequence.splice(from, 1); sequence.splice(to, 0, id); save(); render();
    toast('Moved to position ' + (to + 1));
  }
  function deleteForever(id){
    pushUndo();
    takeOut(id);
    if (isUser(id)){ delete byId[id]; delete state.meta[id];
      if (db) { try { db.transaction('added','readwrite').objectStore('added').delete(id); } catch(e){} } }
    save(); render(); toast(isUser(id) ? 'Deleted' : 'Removed (Reset layout brings it back)');
  }
  function swapWith(src, dst){
    if (dragGroupFor(src)){ moveBefore(src, dst); return; } // swap disabled for multi (F5) - falls back to insert
    var bi = state.backlog.indexOf(src);
    if (bi >= 0){
      var j = state.order.indexOf(dst); if (j < 0) return;
      pushUndo();
      state.backlog[bi] = dst; state.order[j] = src;
    } else {
      var i = state.order.indexOf(src), j2 = state.order.indexOf(dst);
      if (i < 0 || j2 < 0) return;
      pushUndo();
      state.order[i] = dst; state.order[j2] = src;
    }
    save(); render(); toast('Swapped');
  }
  function moveBefore(src, dst){
    var group = dragGroupFor(src);
    if (group){
      group = group.filter(function(id){ return id !== dst; });
      if (!group.length) return;
      pushUndo();
      group.forEach(takeOut);
      var at = state.order.indexOf(dst); if (at < 0) at = state.order.length;
      Array.prototype.splice.apply(state.order, [at, 0].concat(group));
      save(); render();
      return;
    }
    if (src === dst) return;
    var i = state.order.indexOf(src), j = state.order.indexOf(dst);
    if (i >= 0 && j === i + 1) return; // no-op: src already sits directly before dst
    pushUndo();
    takeOut(src);
    state.order.splice(state.order.indexOf(dst), 0, src);
    save(); render();
  }
  // shared by native HTML5 drop handlers and touch-drag commit (below) - one source of truth
  function railInsertAt(src, dst){
    var group = dragGroupFor(src);
    if (group){
      group = group.filter(function(id){ return id !== dst; });
      if (!group.length) return;
      pushUndo();
      group.forEach(takeOut);
      var at = state.backlog.indexOf(dst); if (at < 0) at = state.backlog.length;
      Array.prototype.splice.apply(state.backlog, [at, 0].concat(group));
      save(); render(); toast('Staged in Library');
      return;
    }
    var bi = state.backlog.indexOf(src), bj = state.backlog.indexOf(dst);
    if (bi >= 0 && bj === bi + 1) return; // no-op: src already sits directly before dst
    pushUndo(); takeOut(src); state.backlog.splice(state.backlog.indexOf(dst), 0, src);
    save(); render(); toast('Staged in Library');
  }
  function railAppendBottom(src){
    var group = dragGroupFor(src);
    if (group){
      pushUndo(); group.forEach(takeOut); state.backlog = state.backlog.concat(group);
      save(); render(); toast('Moved to Library (bottom)');
      return;
    }
    if (state.backlog.length && state.backlog[state.backlog.length - 1] === src) return;
    pushUndo(); takeOut(src); state.backlog.push(src);
    save(); render(); toast('Moved to Library (bottom)');
  }
  function orderAppendEnd(src){
    var group = dragGroupFor(src);
    if (group){
      pushUndo(); group.forEach(takeOut); state.order = state.order.concat(group);
      save(); render();
      return;
    }
    if (state.order.length && state.order[state.order.length - 1] === src) return;
    pushUndo(); takeOut(src); state.order.push(src); save(); render();
  }
  // ---- multi-select (F5). Click toggles selection (amber outline + check).
  // Dragging a SELECTED tile/bitem moves the WHOLE selection together: dragGroupFor(src)
  // is consulted by swapWith/moveBefore/railInsertAt/railAppendBottom/orderAppendEnd
  // above (and the trash-drop handlers below) so both the mouse D&D path and the F2
  // touch-drag commit (which already funnels into these same functions) get grouped
  // moves for free, with zero special-casing per input method. Swap is disabled for
  // multi per spec - swapWith itself falls back to an insert. Selection is session-only,
  // never written to state/localStorage.
  function groupSeq(ids){
    var seq = state.order.concat(state.backlog);
    return ids.filter(function(id){ return seq.indexOf(id) >= 0; })
               .sort(function(a, b){ return seq.indexOf(a) - seq.indexOf(b); });
  }
  function dragGroupFor(src){
    if (!selection[src]) return null;
    var group = groupSeq(Object.keys(selection));
    return group.length > 1 ? group : null;
  }
  function selCount(){ return Object.keys(selection).length; }
  function pruneSelection(){
    var changed = false;
    Object.keys(selection).forEach(function(id){
      if (state.order.indexOf(id) < 0 && state.backlog.indexOf(id) < 0){ delete selection[id]; changed = true; }
    });
    if (changed) updateSelectChip();
  }
  function toggleSelect(id){
    if (selection[id]) delete selection[id]; else selection[id] = true;
    var node = tileNodes[id] || bitemNodes[id];
    if (node){ node.classList.toggle('selected', !!selection[id]); syncTileLabel(node, id); }
    updateSelectChip();
  }
  function clearSelection(){
    Object.keys(selection).forEach(function(id){
      var node = tileNodes[id] || bitemNodes[id];
      if (node){ node.classList.remove('selected'); var b = node.querySelector('.select, .bsel'); if (b) b.setAttribute('aria-pressed', 'false'); }
    });
    selection = {};
    updateSelectChip();
  }
  function deleteGroupForever(ids){
    pushUndo();
    ids.forEach(function(id){
      takeOut(id);
      if (isUser(id)){ delete byId[id]; delete state.meta[id];
        if (db) { try { db.transaction('added','readwrite').objectStore('added').delete(id); } catch(e){} } }
    });
    clearSelection();
    save(); render(); toast('Deleted ' + ids.length);
  }
  var selectChipEl = null;
  function ensureSelectChip(){
    if (selectChipEl) return selectChipEl;
    var el = document.createElement('div'); el.className = 'selectchip'; el.setAttribute('role', 'toolbar'); el.setAttribute('aria-label', 'Selected posts');
    var label = document.createElement('span'); label.id = 'selectchiplabel';
    var stageBtn = document.createElement('button'); stageBtn.type = 'button'; stageBtn.textContent = 'Move to library'; stageBtn.dataset.stageSelection = '';
    var delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.textContent = 'Delete';
    var saveBtn = document.createElement('button'); saveBtn.type = 'button'; saveBtn.textContent = 'Save';
    var clearBtn = document.createElement('button'); clearBtn.type = 'button'; clearBtn.textContent = 'Clear';
    stageBtn.addEventListener('click', doStageSelection);
    delBtn.addEventListener('click', doDeleteSelection);
    saveBtn.addEventListener('click', doSaveSelection);
    clearBtn.addEventListener('click', clearSelection);
    el.appendChild(label); el.appendChild(stageBtn); el.appendChild(delBtn); el.appendChild(saveBtn); el.appendChild(clearBtn);
    document.body.appendChild(el);
    selectChipEl = el;
    return el;
  }
  function updateSelectChip(){
    var n = selCount();
    if (!n){ if (selectChipEl) selectChipEl.classList.remove('on'); return; }
    var el = ensureSelectChip();
    el.querySelector('#selectchiplabel').textContent = n + ' selected';
    el.querySelector('[data-stage-selection]').textContent = Object.keys(selection).every(function(id){ return state.backlog.indexOf(id) >= 0; }) ? 'Add to grid' : 'Move to library';
    el.classList.add('on');
  }
  // Stage: sends a grid/mixed selection to the Library top (like the tile x button,
  // batched) - but a selection made ENTIRELY of backlog items is already staged, so
  // there Stage instead places the whole group on the grid top, mirroring the existing
  // single-bitem click ("place on grid top").
  function doStageSelection(){
    var ids = groupSeq(Object.keys(selection));
    if (!ids.length) return;
    var allBacklog = ids.every(function(id){ return state.backlog.indexOf(id) >= 0; });
    pushUndo();
    ids.forEach(takeOut);
    if (allBacklog) state.order = ids.concat(state.order);
    else state.backlog = ids.concat(state.backlog);
    clearSelection();
    save(); render();
    toast(allBacklog ? ('Placed ' + ids.length + ' on top') : ('Staged ' + ids.length + ' in Library'));
  }
  function doDeleteSelection(){
    var ids = groupSeq(Object.keys(selection));
    if (!ids.length) return;
    deleteGroupForever(ids);
  }
  // Saves are sequenced, not fired in parallel: the downloads capability accepts only one
  // save at a time and rejects a concurrent call with code 'rate_limited' (the same
  // contract saveImage's own single-save path already handles) - firing all N at once
  // silently drops every save after the first while still reporting a plain "Saved"
  // toast. One summary toast replaces the N per-image ones; a decline stops the batch
  // instead of continuing past it (a rate_limited rejection retries instead, via saveImage).
  function doSaveSelection(){
    var ids = groupSeq(Object.keys(selection));
    if (!ids.length) return;
    var done = 0;
    ids.reduce(function(p, id){
      return p.then(function(){ return saveImage(id, true).then(function(){ done++; }); });
    }, Promise.resolve()).then(function(){
      toast('Saved ' + done + (done === 1 ? ' image' : ' images'));
    }).catch(function(e){
      var rest = ids.length - done;
      if (e && e.code === 'declined')
        toast(done ? ('Saved ' + done + ' - cancelled (' + rest + ' left)') : 'Save cancelled');
      else
        toast(done ? ('Saved ' + done + ' - stopped (' + rest + ' left, try again)') : 'Saving is not available here');
    });
  }
  // ---- lightbox (F6): click a grid tile (planned or locked) to preview it at max
  // natural size; arrow keys or the on-screen arrows walk the grid order (planned
  // block then locked, same order the grid renders); Esc or a backdrop click closes.
  // Pure view feature - no state mutation, so it needs no undo step and nothing here
  // is persisted. Library rail items already have their own hover-zoom preview and are
  // out of scope (FEATURES.md F6 talks about "the grid order" only).
  var lightboxEl = null, lightboxImg = null, lightboxCountEl = null, lightboxId = null;
  var lightboxCapEl = null, lightboxDateEl = null, lightboxStatusEl = null, lightboxActionsEl = null;
  var lbScrollX = 0, lbScrollY = 0, lbReturnFocus = null, lbBodyStyle = null, lbInert = [], lbMetaUndoId = null;
  function labelButton(button, label){ button.setAttribute('aria-label', label); button.title = label; button.type = 'button'; }
  function ensureLightbox(){
    if (lightboxEl) return lightboxEl;
    var el = document.createElement('div'); el.className = 'lightbox';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Post preview and details');
    el.setAttribute('aria-hidden', 'true'); el.tabIndex = -1;
    var img = document.createElement('img'); img.alt = '';
    var closeb = document.createElement('button'); closeb.type = 'button'; closeb.className = 'lbclose'; closeb.textContent = '\u2715'; closeb.title = 'Close';
    var prev = document.createElement('button'); prev.type = 'button'; prev.className = 'lbarrow prev'; prev.textContent = '\u2039'; prev.title = 'Previous';
    var next = document.createElement('button'); next.type = 'button'; next.className = 'lbarrow next'; next.textContent = '\u203a'; next.title = 'Next';
    var count = document.createElement('div'); count.className = 'lbcount';
    count.setAttribute('aria-live', 'polite');
    labelButton(closeb, 'Close post preview'); labelButton(prev, 'Previous post'); labelButton(next, 'Next post');
    // F8: caption + planned date, edited ONLY here. Kept as one subordinate strip near
    // the bottom of the overlay so the lightbox still reads as a preview, not a form.
    var meta = document.createElement('div'); meta.className = 'lbmeta';
    var dateField = document.createElement('label'); dateField.className = 'lbfield'; dateField.textContent = 'Planned date';
    var dateInp = document.createElement('input'); dateInp.type = 'date'; dateInp.className = 'lbdate'; dateInp.title = 'Planned date';
    dateField.appendChild(dateInp);
    var capField = document.createElement('label'); capField.className = 'lbfield'; capField.textContent = 'Caption';
    var capInp = document.createElement('textarea'); capInp.className = 'lbcaption'; capInp.rows = 4; capInp.maxLength = 2200; capInp.placeholder = 'Write a caption...'; capInp.setAttribute('aria-label', 'Caption');
    capField.appendChild(capInp);
    var status = document.createElement('div'); status.className = 'lbstatus'; status.id = 'lbstatus';
    capInp.setAttribute('aria-describedby', 'lbstatus'); dateInp.setAttribute('aria-describedby', 'lbstatus');
    function commitMeta(){
      if (!lightboxId) return;
      var c = capInp.value, d = dateInp.value;
      var old = state.meta[lightboxId] || {};
      if ((old.c || '') === c && (old.d || '') === d) return;
      if (lbMetaUndoId !== lightboxId){ pushUndo(); lbMetaUndoId = lightboxId; }
      if (c || d) state.meta[lightboxId] = { c: c, d: d }; else delete state.meta[lightboxId];
      save();
      status.textContent = c.length + ' / 2200 characters. ' + (save.failed ? 'Use Save layout to keep a backup.' : 'Saved in this browser.') + ' Dates are notes; posts are not scheduled.';
      var node = tileNodes[lightboxId]; if (node) syncMeta(node, lightboxId); // refresh the hover dot without a full render
    }
    capInp.addEventListener('input', commitMeta);
    dateInp.addEventListener('input', commitMeta);
    // guard the keys the global window keydown handler (F1 undo/redo, F6 lightbox nav)
    // would otherwise steal from these fields: arrow keys page the lightbox, and Ctrl/Cmd
    // Z/Y would fire the GRID's undo/redo instead of the field's own native text undo.
    // Escape is deliberately left alone so it still closes the lightbox from a focused field.
    function guardFieldKeys(ev){
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.stopPropagation(); return; }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z' || ev.key === 'y' || ev.key === 'Y')) ev.stopPropagation();
    }
    capInp.addEventListener('keydown', guardFieldKeys);
    dateInp.addEventListener('keydown', guardFieldKeys);
    meta.appendChild(dateField); meta.appendChild(capField); meta.appendChild(status);
    var actions = document.createElement('div'); actions.className = 'lbactions';
    [['Earlier', -1], ['Later', 1]].forEach(function(action){
      var b = document.createElement('button'); b.type = 'button'; b.textContent = action[0]; b.dataset.move = action[1];
      labelButton(b, 'Move post ' + action[0].toLowerCase());
      b.addEventListener('click', function(){ moveBy(lightboxId, action[1]); }); actions.appendChild(b);
    });
    var stage = document.createElement('button'); stage.type = 'button'; stage.textContent = 'Move to library'; stage.dataset.stage = '';
    stage.addEventListener('click', function(){ var id = lightboxId; closeLightbox(); toBacklog(id); toast('Moved to library'); });
    var download = document.createElement('button'); download.type = 'button'; download.textContent = 'Save image';
    download.addEventListener('click', function(){ saveImage(lightboxId); });
    actions.appendChild(stage); actions.appendChild(download); meta.appendChild(actions);
    closeb.addEventListener('click', closeLightbox);
    prev.addEventListener('click', function(){ stepLightbox(-1); });
    next.addEventListener('click', function(){ stepLightbox(1); });
    el.addEventListener('click', function(ev){ if (ev.target === el) closeLightbox(); }); // backdrop click closes
    el.addEventListener('keydown', function(ev){
      if (ev.key !== 'Tab') return;
      var focusable = Array.prototype.filter.call(el.querySelectorAll('button, input, textarea, [tabindex="0"]'), function(n){ return !n.disabled && n.getClientRects().length; });
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === el)){ ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last){ ev.preventDefault(); first.focus(); }
    });
    el.appendChild(img); el.appendChild(meta); el.appendChild(closeb); el.appendChild(prev); el.appendChild(next); el.appendChild(count);
    document.body.appendChild(el);
    lightboxEl = el; lightboxImg = img; lightboxCountEl = count;
    lightboxCapEl = capInp; lightboxDateEl = dateInp;
    lightboxStatusEl = status; lightboxActionsEl = actions;
    return el;
  }
  function lightboxOrder(){ return state.order.filter(function(id){ return byId[id]; }).concat(lockedIds); }
  function openLightbox(id){
    if (!byId[id]) return;
    ensureLightbox();
    var opening = !lightboxId;
    if (opening){
      lbScrollX = window.scrollX; lbScrollY = window.scrollY; lbReturnFocus = document.activeElement;
      lbBodyStyle = document.body.getAttribute('style');
      var gutter = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.position = 'fixed'; document.body.style.top = -lbScrollY + 'px';
      document.body.style.left = -lbScrollX + 'px'; document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      if (gutter) document.body.style.paddingRight = gutter + 'px';
      lbInert = Array.prototype.map.call(document.body.children, function(node){
        var previous = node.inert;
        if (node !== lightboxEl && node.id !== 'toast') node.inert = true;
        return [node, previous];
      });
    }
    if (lightboxId !== id) lbMetaUndoId = null;
    lightboxId = id;
    lightboxImg.src = byId[id];
    lightboxImg.alt = (lockedIds.indexOf(id) >= 0 ? 'Posted photo ' : 'Planned photo ') + id;
    var m = state.meta[id] || {};
    lightboxCapEl.value = m.c || '';
    lightboxDateEl.value = m.d || '';
    lightboxStatusEl.textContent = (m.c || '').length + ' / 2200 characters. ' + (save.failed ? 'Use Save layout to keep a backup.' : 'Saved in this browser.') + ' Dates are notes; posts are not scheduled.';
    var ord = lightboxOrder(), i = ord.indexOf(id);
    lightboxCountEl.textContent = (lockedIds.indexOf(id) >= 0 ? 'Posted' : 'Planned') + (i >= 0 ? ' - ' + (i + 1) + ' / ' + ord.length : '');
    var plannedIndex = state.order.indexOf(id), locked = lockedIds.indexOf(id) >= 0;
    lightboxActionsEl.querySelector('[data-move="-1"]').disabled = plannedIndex <= 0;
    lightboxActionsEl.querySelector('[data-move="1"]').disabled = plannedIndex < 0 || plannedIndex === state.order.length - 1;
    lightboxActionsEl.querySelector('[data-stage]').hidden = locked;
    lightboxDateEl.disabled = locked;
    lightboxEl.classList.add('on');
    lightboxEl.setAttribute('aria-hidden', 'false');
    if (opening) lightboxEl.querySelector('.lbclose').focus({preventScroll:true});
  }
  function closeLightbox(){
    if (!lightboxId) return;
    lightboxId = null;
    lbMetaUndoId = null;
    if (lightboxEl){ lightboxEl.classList.remove('on'); lightboxEl.setAttribute('aria-hidden', 'true'); }
    lbInert.forEach(function(record){ record[0].inert = record[1]; }); lbInert = [];
    if (lbBodyStyle === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', lbBodyStyle);
    window.scrollTo(lbScrollX, lbScrollY);
    if (lbReturnFocus && lbReturnFocus.isConnected) lbReturnFocus.focus({preventScroll:true});
  }
  function stepLightbox(dir){
    if (!lightboxId) return;
    var ord = lightboxOrder(), i = ord.indexOf(lightboxId);
    if (!ord.length) return;
    i = i < 0 ? 0 : (i + dir + ord.length) % ord.length;
    openLightbox(ord[i]);
  }

  // dragstart delegated once at the document level (F3): tile() and the bitem
  // builder just set draggable=true - no per-node listener to attach or reattach.
  // dragend stays a direct per-node listener (attached once, at node creation, so it
  // still isn't re-attached on every render): a drop that removes its OWN source node
  // (trash-delete, or a grid<->rail move) leaves that node with no parent by the time
  // dragend fires, and a detached node has no ancestor chain left to bubble through -
  // delegating dragend to document would silently miss cleanup in exactly those cases.
  document.addEventListener('dragstart', function(ev){
    var d = ev.target.closest('.tile:not(.locked), .bitem');
    if (!d) return;
    dragId = d.dataset.id; d.classList.add('dragging');
    document.body.classList.add('tiledrag');
    ev.dataTransfer.setData('text/gridsmith', dragId); ev.dataTransfer.effectAllowed = 'move';
  });
  function onDragEnd(d){
    d.classList.remove('dragging');
    dragId = null;
    document.body.classList.remove('tiledrag'); clearOver();
  }

  // ---- touch drag (F2): pointer events alongside HTML5 DnD, which phones don't fire.
  // Long-press (~300ms) lifts a tile/backlog item; a ghost follows the finger; releasing
  // over a target commits through the SAME functions the mouse path uses. A quick move
  // before the long-press fires cancels it so plain swipes keep scrolling normally.
  var LONG_PRESS_MS = 300, MOVE_CANCEL_PX = 10;
  var touch = null; // { id, el, active, ghost, target, timer, scrollTimer, lastX, lastY }
  var SUPPRESS_MS = 400;
  var suppressClick = 0, suppressEl = null;
  document.addEventListener('click', function(ev){
    if (suppressClick && (Date.now() - suppressClick) < SUPPRESS_MS && suppressEl && suppressEl.contains(ev.target)){
      ev.preventDefault(); ev.stopPropagation();
    }
    suppressClick = 0; suppressEl = null;
  }, true);
  // touch-action alone cannot be un-latched mid-gesture once the browser has committed a
  // touchstart to the compositor scroller, and Chrome only takes touchmove off that fast
  // path when a non-passive touch listener exists (a passive pointermove listener is not
  // enough). This document-level listener buys back the gesture only while a drag is live;
  // outside a drag it never calls preventDefault, so plain swipes keep scrolling untouched.
  document.addEventListener('touchmove', function(ev){
    if (touch && touch.active) ev.preventDefault();
  }, { passive: false });
  function clearTouched(){ var t = document.querySelector('.touched'); if (t) t.classList.remove('touched'); }
  function toggleTouched(el){
    var was = el.classList.contains('touched');
    clearTouched();
    if (!was) el.classList.add('touched');
  }
  function ghostSize(el){
    var r = el.getBoundingClientRect();
    var w = Math.min(56, r.width || 56);
    return { w: w, h: r.width ? w * (r.height / r.width) : w * (4 / 3) };
  }
  function moveGhost(x, y){
    // lifted well clear of the finger, so the target the ghost is small enough to leave the
    // insert-line / swap-chip feedback (and the tile itself) visible under the touch point
    if (touch && touch.ghost) touch.ghost.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-135%)';
  }
  function touchTargetAt(x, y){
    var g = touch.ghost;
    if (g) g.style.display = 'none';
    var el = document.elementFromPoint(x, y);
    if (g) g.style.display = '';
    clearOver();
    if (!el) return null;
    var trashEl = document.getElementById('trash');
    var railEl = document.getElementById('rail');
    var endEl = grid.querySelector('.endzone');
    var bitemEl = el.closest('.bitem');
    var tileEl = el.closest('.tile:not(.locked)');
    if (trashEl.contains(el)){ trashEl.classList.add('over'); return { type: 'trash' }; }
    if (bitemEl){
      if (bitemEl.dataset.id === touch.id) return null; // hovering the dragged rail item itself: no-op, don't fall through to rail
      bitemEl.classList.add('bover'); return { type: 'bitem', id: bitemEl.dataset.id };
    }
    if (railEl.contains(el)){ railEl.classList.add('over'); return { type: 'rail' }; }
    if (endEl && endEl.contains(el)){ endEl.classList.add('over'); return { type: 'end' }; }
    if (tileEl && tileEl.dataset.id !== touch.id){
      var r = tileEl.getBoundingClientRect();
      var swap = !dragGroupFor(touch.id) && (x - r.left) > r.width * 0.42; // swap disabled for multi (F5)
      tileEl.classList.toggle('over', !swap);
      tileEl.classList.toggle('swapover', swap);
      if (swap && !tileEl.querySelector('.swapchip')){ var ch = document.createElement('div'); ch.className = 'swapchip'; ch.textContent = '\u21c4 swap'; tileEl.appendChild(ch); }
      return { type: 'tile', id: tileEl.dataset.id, swap: swap };
    }
    return null;
  }
  function touchAutoScroll(){
    if (!touch || !touch.active) return;
    var x = touch.lastX, y = touch.lastY;
    var h = window.innerHeight;
    var re = document.getElementById('rail').getBoundingClientRect();
    var moved = false;
    if (!state.railh && x >= re.left && x <= re.right && y >= re.top && y <= re.bottom){
      if (y < 130){ document.getElementById('rail').scrollBy(0, -16); moved = true; }
      else if (y > h - 130){ document.getElementById('rail').scrollBy(0, 16); moved = true; }
    } else {
      if (y < 90){ window.scrollBy(0, -16); moved = true; }
      else if (y > h - 90){ window.scrollBy(0, 16); moved = true; }
    }
    if (moved) touch.target = touchTargetAt(x, y);
  }
  function activateTouchDrag(x, y){
    dragId = touch.id;
    touch.active = true;
    touch.lastX = x; touch.lastY = y;
    touch.el.classList.add('dragging');
    document.body.classList.add('tiledrag');
    var sz = ghostSize(touch.el);
    var g = document.createElement('div');
    g.className = 'tghost';
    g.style.width = sz.w + 'px'; g.style.height = sz.h + 'px';
    var img = document.createElement('img'); img.src = byId[touch.id] || '';
    g.appendChild(img);
    document.body.appendChild(g);
    touch.ghost = g;
    moveGhost(x, y);
    touch.target = null; // populated by the first real pointermove, not the lift point (a no-move release must be a no-op)
    touch.scrollTimer = setInterval(touchAutoScroll, 50);
  }
  function endTouchDrag(commit){
    if (!touch) return;
    var t = touch;
    if (t.timer) clearTimeout(t.timer);
    if (t.scrollTimer) clearInterval(t.scrollTimer);
    if (t.active){
      t.el.classList.remove('dragging');
      document.body.classList.remove('tiledrag');
      clearOver();
      if (t.ghost) t.ghost.remove();
      var acted = false;
      if (commit && t.target){
        var tg = t.target;
        if (tg.type === 'trash'){ var grp = dragGroupFor(t.id); if (grp) deleteGroupForever(grp); else deleteForever(t.id); acted = true; }
        else if (tg.type === 'bitem'){ railInsertAt(t.id, tg.id); acted = true; }
        else if (tg.type === 'rail'){ railAppendBottom(t.id); acted = true; }
        else if (tg.type === 'end'){ orderAppendEnd(t.id); acted = true; }
        else if (tg.type === 'tile'){ if (tg.swap) swapWith(t.id, tg.id); else moveBefore(t.id, tg.id); acted = true; }
      }
      if (!acted) toast('Drag cancelled');
      suppressClick = Date.now(); suppressEl = t.el;
    }
    dragId = null;
    touch = null;
  }
  // pointerdown delegated once at the document level (F3): locked-tile tap-reveal and
  // the long-press drag-lift both resolve their target element from ev.target at fire
  // time, so no per-tile/per-bitem listener needs attaching or reattaching either.
  document.addEventListener('pointerdown', function(ev){
    suppressClick = 0; suppressEl = null;
    if (ev.pointerType === 'mouse') return;
    if (ev.target.closest('button, input, textarea, select')) return;
    var lockedEl = ev.target.closest('.tile.locked');
    if (lockedEl){
      var sx0 = ev.clientX, sy0 = ev.clientY;
      var up0 = function(u){
        if (Math.abs(u.clientX - sx0) < 10 && Math.abs(u.clientY - sy0) < 10) toggleTouched(lockedEl);
        window.removeEventListener('pointerup', up0);
      };
      window.addEventListener('pointerup', up0);
      return;
    }
    if (dragId) return;
    var d = ev.target.closest('.tile:not(.locked), .bitem');
    if (!d) return;
    var id = d.dataset.id;
    var startX = ev.clientX, startY = ev.clientY, pid = ev.pointerId;
    touch = { id: id, el: d, active: false, ghost: null, target: null, timer: null };
    touch.timer = setTimeout(function(){
      if (!touch || touch.id !== id || touch.el !== d) return;
      try { d.setPointerCapture(pid); } catch(e){}
      activateTouchDrag(startX, startY);
    }, LONG_PRESS_MS);
    function onMove(mv){
      if (!touch || touch.el !== d){ cleanup(); return; }
      if (!touch.active){
        if (Math.abs(mv.clientX - startX) > MOVE_CANCEL_PX || Math.abs(mv.clientY - startY) > MOVE_CANCEL_PX){
          clearTimeout(touch.timer); touch = null; cleanup(); // plain swipe: let it scroll
        }
        return;
      }
      mv.preventDefault();
      touch.lastX = mv.clientX; touch.lastY = mv.clientY;
      moveGhost(mv.clientX, mv.clientY);
      touch.target = touchTargetAt(mv.clientX, mv.clientY);
    }
    function onUp(up){
      if (touch && touch.active) up.preventDefault();
      else if (touch && touch.id === id && touch.el === d){
        // F5: once a selection is already active, mirror the rail's desktop shortcut
        // (plain click extends/shrinks it) here too - one tap toggles this tile straight
        // in, instead of costing the normal two-tap reveal-then-act sequence. The compat
        // click that follows is suppressed so it can't re-toggle the same tap.
        // A tap uses the same visible action as a click. Buttons remain directly
        // tappable; long press is reserved for dragging.
        clearTouched();
      }
      endTouchDrag(true);
      cleanup();
    }
    function onCancel(){ endTouchDrag(false); cleanup(); }
    function cleanup(){
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
  function tile(id, locked){
    var d = document.createElement('div');
    d.className = 'tile' + (locked ? ' locked' : '') + (selection[id] ? ' selected' : ''); d.dataset.id = id;
    d.tabIndex = 0; d.setAttribute('role', 'group');
    var img = document.createElement('img'); img.src = byId[id] || ''; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; d.appendChild(img);
    var dl = document.createElement('button'); dl.className = 'tbtn dl'; dl.textContent = '\u2913'; dl.title = 'Save image';
    labelButton(dl, 'Save image'); d.appendChild(dl);
    if (locked) return d; // pointerdown reveal + save click are handled by delegated listeners
    var x = document.createElement('button'); x.className = 'tbtn x'; x.textContent = '\u2715'; x.title = 'Send to Library';
    labelButton(x, 'Move to backlog'); d.appendChild(x);
    var select = document.createElement('button'); select.className = 'tbtn select'; select.textContent = '\u2713';
    labelButton(select, 'Select post'); select.setAttribute('aria-pressed', String(!!selection[id])); d.appendChild(select);
    d.draggable = true;
    d.addEventListener('dragend', function(){ onDragEnd(d); });
    return d;
  }
  // click/dragover/dragleave/drop delegated once on #grid (F3): a tile's own dl/x
  // buttons and its drag-target behaviour no longer need per-node listeners either.
  grid.addEventListener('click', function(ev){
    var btn = ev.target.closest('.tbtn');
    if (btn){
      var t = btn.closest('.tile'); if (!t) return;
      var id = t.dataset.id;
      if (btn.classList.contains('x')){ toBacklog(id); toast('Moved to Library'); }
      else if (btn.classList.contains('dl')){ saveImage(id); }
      else if (btn.classList.contains('select')){ toggleSelect(id); }
      return;
    }
    if (dragId) return; // F6: "when not dragging" - a real drag never reaches here anyway, belt and suspenders
    var tl = ev.target.closest('.tile');
    if (!tl) return;
    var tid = tl.dataset.id;
    if (tl.classList.contains('locked')){ openLightbox(tid); return; } // F6: locked tiles preview too, never selectable
    // F5 still owns a plain click once selecting is underway (or with a modifier held,
    // mirroring the rail's Ctrl-click-to-start convention below); otherwise F6's preview
    // is what a plain click on a tile now does.
    if (selCount() || ev.ctrlKey || ev.metaKey || ev.shiftKey){ toggleSelect(tid); return; }
    openLightbox(tid);
  });
  grid.addEventListener('dragover', function(ev){
    var t = ev.target.closest('.tile:not(.locked)');
    if (!t || !dragId || dragId === t.dataset.id) return;
    ev.preventDefault();
    var r = t.getBoundingClientRect();
    var swap = !dragGroupFor(dragId) && (ev.clientX - r.left) > r.width * 0.42; // swap disabled for multi (F5)
    t.classList.toggle('over', !swap);
    t.classList.toggle('swapover', swap);
    if (swap && !t.querySelector('.swapchip')){ var ch = document.createElement('div'); ch.className='swapchip'; ch.textContent='\u21c4 swap'; t.appendChild(ch); }
    if (!swap){ var c = t.querySelector('.swapchip'); if (c) c.remove(); }
  });
  grid.addEventListener('dragleave', function(ev){
    var t = ev.target.closest('.tile:not(.locked)'); if (!t) return;
    t.classList.remove('over'); t.classList.remove('swapover');
    var c = t.querySelector('.swapchip'); if (c) c.remove();
  });
  grid.addEventListener('drop', function(ev){
    var t = ev.target.closest('.tile:not(.locked)');
    if (!t || !dragId) return;
    ev.preventDefault(); ev.stopPropagation();
    if (t.classList.contains('swapover')) swapWith(dragId, t.dataset.id); else moveBefore(dragId, t.dataset.id);
  });
  function clearOver(){ document.querySelectorAll('.bover').forEach(function(n){ n.classList.remove('bover'); });
    document.querySelectorAll('.over,.swapover').forEach(function(n){ n.classList.remove('over'); n.classList.remove('swapover');
    var c = n.querySelector('.swapchip'); if (c) c.remove(); });
    document.getElementById('rail').classList.remove('over'); }
  function highlight(ids, scroll){
    if (!ids.length) return;
    var first = document.querySelector('.tile[data-id="' + ids[0] + '"], .bitem[data-id="' + ids[0] + '"]');
    if (first && scroll) first.scrollIntoView({block: 'center', behavior: 'smooth'});
    ids.forEach(function(x){
      var el = document.querySelector('.tile[data-id="' + x + '"]');
      if (el){ el.classList.add('justadded'); setTimeout(function(){ el.classList.remove('justadded'); }, 2400); }
    });
  }
  function makeBitem(id){
    var d = document.createElement('div'); d.className = 'bitem' + (selection[id] ? ' selected' : ''); d.dataset.id = id;
    d.tabIndex = 0; d.setAttribute('role', 'group');
    var img = document.createElement('img'); img.src = byId[id]; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; d.appendChild(img);
    // F5 touch fix: a plain rail click places the item on the grid top when no selection
    // is active (TESTS.md #10), so touch - which has no Ctrl-click - had no gesture that
    // could START a selection here. This mirrors the tile's reveal buttons: shown on
    // hover (desktop) or once .touched (tap-to-reveal, mobile), it toggles selection
    // directly and stops the click from also bubbling into the place-on-top handler.
    var bs = document.createElement('button'); bs.className = 'bsel'; bs.textContent = '\u2713'; bs.title = 'Select';
    labelButton(bs, 'Select backlog image'); bs.setAttribute('aria-pressed', String(!!selection[id]));
    bs.addEventListener('click', function(ev){ ev.stopPropagation(); toggleSelect(id); });
    d.appendChild(bs);
    var bx = document.createElement('button'); bx.className = 'bx'; bx.textContent = '\u2715'; bx.title = 'Delete';
    labelButton(bx, 'Delete backlog image');
    d.appendChild(bx);
    d.draggable = true;
    d.addEventListener('dragend', function(){ onDragEnd(d); });
    return d;
  }
  function syncTileLabel(node, id){
    var posted = lockedIds.indexOf(id) >= 0, inGrid = state.order.indexOf(id), inLibrary = state.backlog.indexOf(id);
    node.setAttribute('aria-label', posted ? 'Posted photo. Enter to preview.' : (inGrid >= 0 ? 'Planned post ' + (inGrid + 1) + '. Enter to preview.' : 'Library image ' + (inLibrary + 1) + '. Enter to add to grid.'));
    node.setAttribute('aria-keyshortcuts', posted ? 'Enter' : 'Enter Space Alt+ArrowLeft Alt+ArrowRight');
    node.classList.toggle('selected', !!selection[id]);
    var select = node.querySelector('.select, .bsel'); if (select) select.setAttribute('aria-pressed', String(!!selection[id]));
  }
  document.addEventListener('keydown', function(ev){
    var node = ev.target.closest('.tile, .bitem');
    if (!node || ev.target !== node || lightboxId) return;
    var id = node.dataset.id, locked = lockedIds.indexOf(id) >= 0;
    if (ev.key === 'Enter'){ ev.preventDefault(); node.click(); return; }
    if (ev.key === ' '){ ev.preventDefault(); if (locked) openLightbox(id); else toggleSelect(id); return; }
    if (!/^Arrow(Left|Right|Up|Down)$/.test(ev.key)) return;
    ev.preventDefault();
    var railNode = node.classList.contains('bitem');
    var step = (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 1) * (/Up|Down/.test(ev.key) && !railNode ? state.cols : 1);
    if (ev.altKey){ if (!locked) moveBy(id, step); node.focus(); return; }
    var nodes = (railNode ? railitems : grid).querySelectorAll(railNode ? '.bitem' : '.tile');
    var index = Array.prototype.indexOf.call(nodes, node), next = nodes[index + step]; if (next) next.focus();
  });
  // click/dragover/dragleave/drop delegated once on #railitems (F3), mirroring the grid.
  railitems.addEventListener('click', function(ev){
    var bx = ev.target.closest('.bx');
    if (bx){ var bt = bx.closest('.bitem'); if (bt) deleteForever(bt.dataset.id); return; }
    var t = ev.target.closest('.bitem'); if (!t) return;
    var id = t.dataset.id;
    // F5: once a selection is active (started in the grid, or via a modifier click
    // here), plain clicks extend/shrink it too. With no active selection and no
    // modifier, a plain click keeps its original meaning (TESTS.md #10: place on top).
    if (selCount() || ev.ctrlKey || ev.metaKey || ev.shiftKey){ toggleSelect(id); return; }
    pushUndo(); takeOut(id); state.order.unshift(id); save(); render();
    highlight([id], true); toast('Placed on top - drag it where you want');
  });
  railitems.addEventListener('dragover', function(ev){
    var t = ev.target.closest('.bitem');
    if (!t || !dragId || dragId === t.dataset.id) return;
    ev.preventDefault(); ev.stopPropagation(); t.classList.add('bover');
  });
  railitems.addEventListener('dragleave', function(ev){
    var t = ev.target.closest('.bitem'); if (!t) return;
    t.classList.remove('bover');
  });
  railitems.addEventListener('drop', function(ev){
    var t = ev.target.closest('.bitem');
    if (!t || !dragId || dragId === t.dataset.id) return;
    ev.preventDefault(); ev.stopPropagation();
    railInsertAt(dragId, t.dataset.id);
  });
  // ---- F3 measurements (methodology + results; re-measure in-browser via real drag/drop
  // event dispatch on the built page if this code changes materially) ----
  // MOVE COUNT (the "affected nodes only" claim). A prior round's cursor-based reconcileGrid
  // was NOT move-minimal: it never resynced once a moved tile sat at the cursor, so a
  // forward insert or a distant swap reseated every node between the two changed positions
  // instead of just the node(s) that actually moved. Fixed by replacing the single cursor
  // pass with a keyed diff: reconcileGrid/reconcileRail take the longest increasing
  // subsequence (function lis(), patience sort) of each surviving node's CURRENT dom index
  // against its desired new-order index - that LIS is the largest run already in the right
  // relative order, so only the nodes OUTSIDE it ever get an insertBefore. Verified on Reset
  // layout's 101-tile grid (91 planned + 10 locked) with a MutationObserver on #grid counting
  // removedNodes across real dispatched dragstart/dragover/drop/dragend, same cases the prior
  // round's critique used:
  //   forward insert, dist 70:  1 move  (was 69)      backward insert, dist 70: 1 move
  //   forward insert, dist 50:  1 move  (was 49)       swap, dist 45: 2 moves  (was 45)
  //   swap, dist 88: 2 moves (was 88)
  // A full-reversal bulk case (import restoring a 91-id order that is the exact reverse of
  // the current one - the worst case for this diff, LIS length 1) was also checked for
  // correctness (not move-count, since near-total reshuffle genuinely needs near-every node
  // repositioned): resulting dom order matched the imported order exactly, 91/91.
  // NODE IDENTITY. Capturing every tile's dom node reference before a chain of 4 real
  // drag/drops (insert, swap, insert, swap) and comparing by object identity (===, not just
  // id) after: zero recreations, zero missing, zero duplicate ids - the reused-node guarantee
  // holds regardless of the move-count fix, since only insertBefore is used, never
  // remove-then-recreate.
  // SPEED. Re-measured end-to-end (dispatchEvent(dropEvent) only, n=30) on the same 101-tile
  // grid: shipped incremental path median 2.0ms, min 1.9ms. A full-rebuild control (wipe and
  // reconstruct all 91 tile nodes from scratch, same img data-URLs, no app-state changes)
  // measured median 0.5ms, min 0.2ms - i.e. still faster than the real end-to-end drop, same
  // finding as the prior round. The move-count fix does not change this: it was never the DOM
  // step that dominated. The ~2ms floor is fixed per-drop overhead outside the DOM
  // step (pushUndo's snapshot, the state splice, localStorage save) that this feature does
  // not reduce. Honest framing: F3's payoff at this grid size is structural correctness
  // (truly move-minimal reconciliation + stable node identity + listeners attached once via
  // delegation), not measured wall-clock speed - the "speed" half of FEATURES.md F3's title
  // is not supported by evidence at 101 tiles and should not be read as a claim of one.
  // PAGE WEIGHT. Still no pre-F1 baseline: this is not a git repo and no earlier build exists
  // anywhere in the tree, so a "before F1/F2/F3 merged" page-weight delta remains
  // unreconstructable - that structural gap is unchanged from the prior round and cannot be
  // fixed by editing this file alone. What IS newly checkable, because this round's own
  // before/after is on hand: this file (planner_src/page.html) was 59,497 bytes (os.path.
  // getsize) before this round's cursor-to-LIS reconciliation rewrite, source and this note
  // both included since both changed - the net of the lis() helper plus the domOrder/oldPos/
  // seq bookkeeping the two reconcile functions now do, offset by this note being shorter
  // than the one it replaced. That net is a ~2.4KB source growth (re-run `python -c
  // "import os;print(os.path.getsize('planner_src/page.html'))"` for the exact live count -
  // typing an exact figure into this note changes the note's own byte count, so only an
  // approximate order of magnitude is stable to state here). Built planner.html moves by
  // that same delta off the prior round's 7,596,726 bytes, still comfortably under TESTS.md
  // #23's 7.7MB cap (the ~7.5MB of embedded thumbnails, untouched by F3, dominates that
  // total; re-run tools/build.py to confirm the exact current figure). If a literal pre-F1
  // before/after is required, either archive a pre-F1 build to diff against, or amend
  // FEATURES.md F3 to read "stays under the TESTS.md #23 cap" instead of "must not exceed
  // current size".
  // ---- incremental reconciliation (F3): move/create/remove only the nodes whose
  // membership or order changed, instead of wiping and rebuilding every tile/bitem.
  // A reused node (id already had a tile/bitem) still needs its <img> re-synced: byId[id]
  // can change under an id that stays in the grid (e.g. importing a layout whose `added`
  // remaps an existing id to new pixels) and the node itself is never recreated in that
  // case, so without this the tile would keep showing the old image.
  function syncImg(node, id){
    var src = byId[id] || '';
    // Compare the cached JS source before touching the DOM: reading 100 large
    // data-URL attributes on each move needlessly copied megabytes of text.
    if (node._imageSource === src) return;
    var im = node.querySelector('img');
    if (im) { im.src = src; node._imageSource = src; }
  }
  // Longest increasing subsequence over `seq` (patience sorting, O(n log n)) - returns the
  // indices INTO seq that form it. reconcileGrid/reconcileRail feed it each surviving
  // node's CURRENT dom position, in desired-order; the LIS is the largest set of nodes
  // whose relative order already matches the target, so only the nodes OUTSIDE that set
  // ever get an insertBefore. This is what makes a single insert move exactly 1 node and a
  // swap move exactly 2, instead of reseating everything from the earliest change onward.
  function lis(seq){
    var piles = [], prev = new Array(seq.length);
    for (var i = 0; i < seq.length; i++){
      var v = seq[i], lo = 0, hi = piles.length;
      while (lo < hi){ var mid = (lo + hi) >> 1; if (seq[piles[mid]] < v) lo = mid + 1; else hi = mid; }
      prev[i] = lo > 0 ? piles[lo - 1] : -1;
      piles[lo] = i;
    }
    var out = [], k = piles.length ? piles[piles.length - 1] : -1;
    while (k >= 0){ out.push(k); k = prev[k]; }
    return out.reverse();
  }
  function reconcileGrid(ids){
    var idSet = {};
    ids.forEach(function(id){ idSet[id] = true; });
    Object.keys(tileNodes).forEach(function(id){
      if (lockedIds.indexOf(id) >= 0) return;
      if (!idSet[id]){ var n = tileNodes[id]; if (n.parentNode) n.parentNode.removeChild(n); delete tileNodes[id]; }
    });
    // current dom order of the surviving planned tiles (locked tiles / endzone excluded),
    // captured before anything below moves a single node
    var domOrder = [];
    for (var c = grid.firstChild; c; c = c.nextSibling){
      if (c.classList && c.classList.contains('tile') && !c.classList.contains('locked')) domOrder.push(c.dataset.id);
    }
    var oldPos = {};
    domOrder.forEach(function(id, i){ oldPos[id] = i; });
    var seq = [], seqIdx = [];
    ids.forEach(function(id, i){
      var node = tileNodes[id];
      if (!node){ node = tile(id, false); tileNodes[id] = node; } else syncImg(node, id);
      syncMeta(node, id);
      if (id in oldPos){ seq.push(oldPos[id]); seqIdx.push(i); }
    });
    var keep = {};
    lis(seq).forEach(function(si){ keep[seqIdx[si]] = true; });
    // endzoneEl is the fixed anchor right after the planned block; this loop never moves
    // it, so once attached it stays a valid anchor across every future render untouched
    var g2 = (endzoneEl.parentNode === grid) ? endzoneEl : null;
    var anchor = g2;
    for (var i = ids.length - 1; i >= 0; i--){
      var id = ids[i], node = tileNodes[id];
      if (!keep[i]) grid.insertBefore(node, anchor);
      anchor = node;
    }
    if (!g2) grid.appendChild(endzoneEl); // first render only: nothing to anchor before yet
    // locked tiles never reorder or get removed, so a plain self-healing cursor pass here
    // can never desync the way the old single-cursor pass did for the reorderable block above
    var cursor = endzoneEl.nextSibling;
    lockedIds.forEach(function(id){
      var node = tileNodes[id];
      if (!node){ node = tile(id, true); tileNodes[id] = node; } else syncImg(node, id);
      syncMeta(node, id);
      if (node === cursor) cursor = cursor.nextSibling; else grid.insertBefore(node, cursor);
    });
  }
  function reconcileRail(ids){
    var idSet = {};
    ids.forEach(function(id){ idSet[id] = true; });
    Object.keys(bitemNodes).forEach(function(id){
      if (!idSet[id]){ var n = bitemNodes[id]; if (n.parentNode) n.parentNode.removeChild(n); delete bitemNodes[id]; }
    });
    if (railEmptyEl.parentNode) railEmptyEl.parentNode.removeChild(railEmptyEl);
    if (!ids.length){ railitems.appendChild(railEmptyEl); return; }
    var domOrder = [];
    for (var c = railitems.firstChild; c; c = c.nextSibling){
      if (c.classList && c.classList.contains('bitem')) domOrder.push(c.dataset.id);
    }
    var oldPos = {};
    domOrder.forEach(function(id, i){ oldPos[id] = i; });
    var seq = [], seqIdx = [];
    ids.forEach(function(id, i){
      var node = bitemNodes[id];
      if (!node){ node = makeBitem(id); bitemNodes[id] = node; } else syncImg(node, id);
      syncTileLabel(node, id);
      if (id in oldPos){ seq.push(oldPos[id]); seqIdx.push(i); }
    });
    var keep = {};
    lis(seq).forEach(function(si){ keep[seqIdx[si]] = true; });
    var anchor = null;
    for (var i = ids.length - 1; i >= 0; i--){
      var id = ids[i], node = bitemNodes[id];
      if (!keep[i]) railitems.insertBefore(node, anchor);
      anchor = node;
    }
  }
  function render(){
    pruneSelection(); // F5: drop selected ids that no longer live in order/backlog
    grid.style.setProperty('--cols', state.cols);
    document.querySelectorAll('#colsw button').forEach(function(b){
      b.classList.toggle('on', +b.dataset.c === state.cols); b.setAttribute('aria-pressed', String(+b.dataset.c === state.cols)); });
    var shown = state.order.filter(function(id){ return byId[id]; });
    reconcileGrid(shown);
    var blog = state.backlog.filter(function(id){ return byId[id]; });
    reconcileRail(blog);
    document.getElementById('count').textContent = shown.length + ' planned \u00b7 ' + blog.length + ' in library \u00b7 ' + lockedIds.length + ' posted';
    document.getElementById('railcount').textContent = blog.length ? (blog.length + ' photos') : '';
    // F6: a state change while the lightbox is open (e.g. undo/redo via Ctrl+Z, which
    // stays reachable through the overlay) can remove the id it is showing, or just
    // change its position in the order - close on removal, else refresh the "N / M"
    // label so it never goes stale while the preview stays up.
    if (lightboxId){
      var ord = lightboxOrder(), i = ord.indexOf(lightboxId);
      if (i < 0) closeLightbox();
      else openLightbox(lightboxId);
    }
  }
  function applyRail(){
    var w = (state.railw && state.railw >= 84) ? state.railw : 0;
    // At and below 760px an inline --railw would outrank the phone media query (which also
    // covers <=760px) and eat the grid, so let the media query govern there; the saved width
    // is untouched and still applies strictly above 760px, keeping the two ranges disjoint.
    if (w && document.documentElement.clientWidth > 760) document.documentElement.style.setProperty('--railw', w + 'px');
    else document.documentElement.style.removeProperty('--railw');
    document.body.classList.toggle('norail', !!state.railh);
    document.getElementById('railtoggle').textContent = state.railh ? 'Show library' : 'Hide library';
    document.getElementById('railtoggle').setAttribute('aria-expanded', String(!state.railh));
    document.getElementById('rail').inert = !!state.railh;
  }
  window.addEventListener('resize', applyRail);
  var rh = document.getElementById('rhandle');
  rh.tabIndex = 0; rh.setAttribute('role', 'separator'); rh.setAttribute('aria-orientation', 'vertical'); rh.setAttribute('aria-label', 'Library width');
  rh.setAttribute('aria-valuemin', '84'); rh.setAttribute('aria-valuenow', String(state.railw || 240));
  rh.addEventListener('keydown', function(ev){
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    state.railw = Math.max(84, Math.min(Math.round(document.documentElement.clientWidth * 0.5), (state.railw || rail.getBoundingClientRect().width) + (ev.key === 'ArrowLeft' ? 24 : -24)));
    rh.setAttribute('aria-valuenow', String(state.railw)); save(); applyRail();
  });
  rh.addEventListener('pointerdown', function(ev){
    ev.preventDefault();
    try { rh.setPointerCapture(ev.pointerId); } catch(e){}
    rh.classList.add('active');
    function mv(e){
      var vw = document.documentElement.clientWidth;
      var w = Math.max(84, Math.min(Math.round(vw * 0.5), vw - Math.round(e.clientX)));
      state.railw = w;
      rh.setAttribute('aria-valuenow', String(w));
      document.documentElement.style.setProperty('--railw', w + 'px');
    }
    function up(){
      rh.classList.remove('active');
      try { rh.releasePointerCapture(ev.pointerId); } catch(e){}
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      save();
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  var rail = document.getElementById('rail');
  rail.addEventListener('dragover', function(ev){
    if (dragId){ ev.preventDefault(); rail.classList.add('over'); } });
  rail.addEventListener('dragleave', function(){ rail.classList.remove('over'); });
  rail.addEventListener('drop', function(ev){
    if (!dragId) return;
    ev.preventDefault(); rail.classList.remove('over');
    railAppendBottom(dragId); });
  var trash = document.getElementById('trash');
  trash.addEventListener('dragover', function(ev){ if (dragId){ ev.preventDefault(); trash.classList.add('over'); } });
  trash.addEventListener('dragleave', function(){ trash.classList.remove('over'); });
  trash.addEventListener('drop', function(ev){
    if (!dragId) return;
    ev.preventDefault(); ev.stopPropagation(); trash.classList.remove('over');
    var group = dragGroupFor(dragId);
    if (group) deleteGroupForever(group); else deleteForever(dragId); });
  window.addEventListener('dragover', function(ev){
    if (!dragId && !document.body.classList.contains('filedrag')) return;
    var h = document.documentElement.clientHeight;
    var re = rail.getBoundingClientRect();
    if (!state.railh && ev.clientX >= re.left && ev.clientX <= re.right && ev.clientY >= re.top && ev.clientY <= re.bottom){
      if (ev.clientY < 130) rail.scrollBy(0, -16);
      else if (ev.clientY > h - 130) rail.scrollBy(0, 16);
    } else {
      if (ev.clientY < 90) window.scrollBy(0, -16);
      else if (ev.clientY > h - 90) window.scrollBy(0, 16);
    }
  });

  document.getElementById('undo').addEventListener('click', doUndo);
  var redoButton = document.getElementById('redo'); if (redoButton) redoButton.addEventListener('click', doRedo);
  window.addEventListener('keydown', function(ev){
    if (ev.defaultPrevented) return;
    var editing = ev.target.closest('input, textarea, select, [contenteditable="true"]');
    var otherDialog = ev.target.closest('[role="dialog"], dialog');
    if (otherDialog && otherDialog !== lightboxEl) return;
    if (ev.key === 'Escape'){
      if (lightboxId){ closeLightbox(); return; } // F6: Esc closes the lightbox first
      clearTouched(); clearSelection();
    }
    if (editing) return;
    if (lightboxId && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')){
      ev.preventDefault(); stepLightbox(ev.key === 'ArrowLeft' ? -1 : 1); return;
    }
    if (!(ev.ctrlKey || ev.metaKey)) return;
    var k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey){ ev.preventDefault(); doUndo(); }
    else if (k === 'y' || (k === 'z' && ev.shiftKey)){ ev.preventDefault(); doRedo(); }
  });
  document.getElementById('colsw').addEventListener('click', function(ev){
    var b = ev.target.closest('button'); if (!b) return;
    state.cols = +b.dataset.c; save(); render();
  });
  document.getElementById('blank').addEventListener('click', function(){
    pushUndo();
    var cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1440;
    var cx = cv.getContext('2d'); cx.fillStyle = '#101010'; cx.fillRect(0, 0, 1080, 1440);
    cx.strokeStyle = '#1c1c1c'; cx.lineWidth = 4; cx.strokeRect(10, 10, 1060, 1420);
    var id = 'u' + Date.now() + Math.floor(Math.random() * 1e5);
    var src = cv.toDataURL('image/jpeg', .8);
    byId[id] = src; state.order.unshift(id);
    if (db) { try { db.transaction('added','readwrite').objectStore('added').put({id: id, src: src}); } catch(e){} }
    save(); render(); highlight([id], true); toast('Blank spacer added on top');
  });
  document.getElementById('railtoggle').addEventListener('click', function(){
    state.railh = !state.railh; save(); applyRail();
  });
  function buildSaved(){
    var added = Object.keys(byId).filter(isUser).map(function(id){ return {id: id, src: byId[id]}; });
    return { order: state.order, backlog: state.backlog, cols: state.cols,
             railw: state.railw, railh: !!state.railh, added: added, meta: state.meta, drafts: sanitizeDrafts(state.drafts) };
  }
  function fallbackExport(){
    try {
      var data = JSON.stringify(buildSaved());
      var url = URL.createObjectURL(new Blob([data], {type: 'application/json'}));
      var a = document.createElement('a');
      a.href = url; a.download = 'gridsmith-layout.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
      toast('Layout downloaded. Drop the file onto the page to restore it.');
    } catch(e){ toast('Download failed. Your layout is kept in this browser.'); }
  }
  document.getElementById('savelayout').addEventListener('click', fallbackExport);
  document.getElementById('reset').addEventListener('click', function(){
    dismissSplitChip(); // a reset rebuilds state wholesale - any live split chip no longer describes it
    pushUndo();
    var keep = state.order.concat(state.backlog).filter(function(id){ return isUser(id) && byId[id]; });
    state = { order: defaultOrder.slice(), backlog: keep, cols: state.cols, railw: state.railw, railh: state.railh, meta: state.meta, drafts: state.drafts };
    save(); render(); toast('Layout reset - your own images are in the Library');
  });

  // ---- collage splitting (port of tools/split.py uniform-band algorithm) ----
  var STD_T = 12, MIN_STD = 12, SNAP = 18;
  function masks(data, W, x0, y0, x1, y1){
    var w = x1 - x0, h = y1 - y0;
    var colU = new Uint8Array(w), rowU = new Uint8Array(h);
    var colM = new Float32Array(w), rowM = new Float32Array(h);
    for (var x = 0; x < w; x++){
      var sr=0,sg=0,sb=0,qr=0,qg=0,qb=0;
      for (var y = 0; y < h; y++){
        var i = (((y0 + y) * W) + (x0 + x)) * 4;
        var r=data[i],g=data[i+1],b=data[i+2];
        sr+=r; sg+=g; sb+=b; qr+=r*r; qg+=g*g; qb+=b*b;
      }
      var st=(Math.sqrt(Math.max(0,qr/h-(sr/h)*(sr/h)))+Math.sqrt(Math.max(0,qg/h-(sg/h)*(sg/h)))+Math.sqrt(Math.max(0,qb/h-(sb/h)*(sb/h))))/3;
      colU[x] = st < STD_T ? 1 : 0;
      colM[x] = (sr + sg + sb) / (3 * h);
    }
    for (var y2 = 0; y2 < h; y2++){
      var sr2=0,sg2=0,sb2=0,qr2=0,qg2=0,qb2=0;
      for (var x2 = 0; x2 < w; x2++){
        var i2 = (((y0 + y2) * W) + (x0 + x2)) * 4;
        var r2=data[i2],g2=data[i2+1],b2=data[i2+2];
        sr2+=r2; sg2+=g2; sb2+=b2; qr2+=r2*r2; qg2+=g2*g2; qb2+=b2*b2;
      }
      var st2=(Math.sqrt(Math.max(0,qr2/w-(sr2/w)*(sr2/w)))+Math.sqrt(Math.max(0,qg2/w-(sg2/w)*(sg2/w)))+Math.sqrt(Math.max(0,qb2/w-(sb2/w)*(sb2/w))))/3;
      rowU[y2] = st2 < STD_T ? 1 : 0;
      rowM[y2] = (sr2 + sg2 + sb2) / (3 * w);
    }
    return { colU: colU, rowU: rowU, colM: colM, rowM: rowM };
  }
  function runs(mask){
    var out = [], start = -1;
    for (var i = 0; i < mask.length; i++){
      if (mask[i] && start < 0) start = i;
      else if (!mask[i] && start >= 0){ out.push([start, i - 1]); start = -1; }
    }
    if (start >= 0) out.push([start, mask.length - 1]);
    return out;
  }
  function splitRegion(data, W, x0, y0, x1, y1, depth, acc){
    var w = x1 - x0, h = y1 - y0;
    if (w < 20 || h < 20) return;
    var m = masks(data, W, x0, y0, x1, y1);
    var l = 0; while (l < w && m.colU[l]) l++;
    var r = w; while (r > l && m.colU[r - 1]) r--;
    var t = 0; while (t < h && m.rowU[t]) t++;
    var b = h; while (b > t && m.rowU[b - 1]) b--;
    if (l > 0 || t > 0 || r < w || b < h){ splitRegion(data, W, x0 + l, y0 + t, x0 + r, y0 + b, depth, acc); return; }
    if (depth > 6){ acc.push([x0, y0, x1, y1]); return; }
    var axes = [[m.colU, w, true], [m.rowU, h, false]];
    for (var a = 0; a < 2; a++){
      var u = axes[a][0], len = axes[a][1], vert = axes[a][2];
      var rs = runs(u).filter(function(rr){ return rr[0] > 0 && rr[1] < len - 1 && rr[1] - rr[0] + 1 >= 2; });
      if (rs.length){
        var found = false;
        var cuts = [[-1, -1]].concat(rs).concat([[len, len]]);
        for (var k = 0; k < cuts.length - 1; k++){
          var st = cuts[k][1] + 1, en = cuts[k + 1][0];
          if (en - st >= 20){
            found = true;
            if (vert) splitRegion(data, W, x0 + st, y0, x0 + en, y1, depth + 1, acc);
            else splitRegion(data, W, x0, y0 + st, x1, y0 + en, depth + 1, acc);
          }
        }
        if (found) return;
      }
    }
    if (depth <= 3){
      var MINSEG = 130;
      var vcuts = (w >= 2 * MINSEG) ? lineCuts(m.colM, MINSEG) : [];
      if (vcuts.length){
        var pv = 0;
        vcuts.concat([w]).forEach(function(c){
          if (c - pv >= 40) splitRegion(data, W, x0 + pv, y0, x0 + c, y1, depth + 1, acc);
          pv = Math.min(c + 3, w);
        });
        return;
      }
      var hcuts = (h >= 2 * MINSEG) ? lineCuts(m.rowM, MINSEG) : [];
      if (hcuts.length){
        var ph = 0;
        hcuts.concat([h]).forEach(function(c){
          if (c - ph >= 40) splitRegion(data, W, x0, y0 + ph, x1, y0 + c, depth + 1, acc);
          ph = Math.min(c + 3, h);
        });
        return;
      }
    }
    acc.push([x0, y0, x1, y1]);
  }
  function lineCuts(means, minSeg){
    var cand = [];
    for (var i = 3; i < means.length - 3; i++){
      var mm = means[i];
      var dark = mm < 34 && means[i-3] > mm + 20 && means[i+3] > mm + 20;
      var lite = mm > 232 && means[i-3] < mm - 20 && means[i+3] < mm - 20;
      if ((dark || lite) && (!cand.length || i - cand[cand.length-1] > 6)) cand.push(i);
    }
    var ok = [], prev = 0;
    for (var k = 0; k < cand.length; k++){
      if (cand[k] - prev >= minSeg && means.length - cand[k] >= minSeg){ ok.push(cand[k]); prev = cand[k]; }
    }
    return ok;
  }
  // ---- split-edge snap (F4, port of tools/apply_boxes.py snap_edge): within +-SNAP
  // px of a detected box edge, find the exact pixel where a uniform (background/
  // gutter) band meets non-uniform (content) and pull the edge there, so split posts
  // don't carry a few pixels of gutter sliver. Sampled over the CENTRAL half of the
  // opposite span (not the full edge length) to avoid corner artifacts, matching the
  // ported algorithm; picks the transition closest to the original edge.
  function colStd(data, W, x, y0, y1){
    var h = y1 - y0; if (h <= 0) return 0;
    var sr=0,sg=0,sb=0,qr=0,qg=0,qb=0;
    for (var y = y0; y < y1; y++){
      var i = ((y * W) + x) * 4;
      var r=data[i],g=data[i+1],b=data[i+2];
      sr+=r; sg+=g; sb+=b; qr+=r*r; qg+=g*g; qb+=b*b;
    }
    return (Math.sqrt(Math.max(0,qr/h-(sr/h)*(sr/h)))+Math.sqrt(Math.max(0,qg/h-(sg/h)*(sg/h)))+Math.sqrt(Math.max(0,qb/h-(sb/h)*(sb/h))))/3;
  }
  function rowStd(data, W, y, x0, x1){
    var w = x1 - x0; if (w <= 0) return 0;
    var sr=0,sg=0,sb=0,qr=0,qg=0,qb=0;
    for (var x = x0; x < x1; x++){
      var i = ((y * W) + x) * 4;
      var r=data[i],g=data[i+1],b=data[i+2];
      sr+=r; sg+=g; sb+=b; qr+=r*r; qg+=g*g; qb+=b*b;
    }
    return (Math.sqrt(Math.max(0,qr/w-(sr/w)*(sr/w)))+Math.sqrt(Math.max(0,qg/w-(sg/w)*(sg/w)))+Math.sqrt(Math.max(0,qb/w-(sb/w)*(sb/w))))/3;
  }
  function snapEdge(data, W, H, pos, lo, hi, spanA, spanB, vertical, inward){
    var lim = vertical ? W : H;
    lo = Math.max(lo, 0); hi = Math.min(hi, lim - 1);
    var best = null, bestDist = Infinity;
    for (var p = lo; p <= hi; p++){
      var u = vertical ? (colStd(data, W, p, spanA, spanB) < STD_T) : (rowStd(data, W, p, spanA, spanB) < STD_T);
      var q = p + inward;
      if (q < 0 || q >= lim) continue;
      var u2 = vertical ? (colStd(data, W, q, spanA, spanB) < STD_T) : (rowStd(data, W, q, spanA, spanB) < STD_T);
      if (u && !u2){
        var cand = p + (inward > 0 ? 1 : 0);
        var d = Math.abs(cand - pos);
        if (d < bestDist){ bestDist = d; best = cand; }
      }
    }
    return best !== null ? best : pos;
  }
  function snapBox(data, W, H, bx){
    var ox0 = bx[0], oy0 = bx[1], ox1 = bx[2], oy1 = bx[3];
    var my0 = oy0 + Math.floor((oy1 - oy0) / 4), my1 = oy1 - Math.floor((oy1 - oy0) / 4);
    var mx0 = ox0 + Math.floor((ox1 - ox0) / 4), mx1 = ox1 - Math.floor((ox1 - ox0) / 4);
    var x0 = ox0, y0 = oy0, x1 = ox1, y1 = oy1;
    if (x0 > 2) x0 = snapEdge(data, W, H, x0, x0 - SNAP, x0 + SNAP, my0, my1, true, +1);
    if (x1 < W - 2) x1 = snapEdge(data, W, H, x1, x1 - SNAP, x1 + SNAP, my0, my1, true, -1);
    if (y0 > 2) y0 = snapEdge(data, W, H, y0, y0 - SNAP, y0 + SNAP, mx0, mx1, false, +1);
    if (y1 < H - 2) y1 = snapEdge(data, W, H, y1, y1 - SNAP, y1 + SNAP, mx0, mx1, false, -1);
    x0 = Math.max(0, Math.min(x0, W - 2)); x1 = Math.max(x0 + 1, Math.min(x1, W));
    y0 = Math.max(0, Math.min(y0, H - 2)); y1 = Math.max(y0 + 1, Math.min(y1, H));
    return [x0, y0, x1, y1];
  }
  function regionStd(data, W, x0, y0, x1, y1){
    var s=0,q=0,n=0;
    for (var y = y0; y < y1; y += 4){
      for (var x = x0; x < x1; x += 4){
        var i = ((y * W) + x) * 4;
        var v = (data[i] + data[i+1] + data[i+2]) / 3;
        s += v; q += v * v; n++;
      }
    }
    return n ? Math.sqrt(Math.max(0, q/n - (s/n)*(s/n))) : 0;
  }
  function detectRegions(img, forceCollage){
    var maxW = 2400;
    var sc = Math.min(1, maxW / img.width);
    var W = Math.round(img.width * sc), H = Math.round(img.height * sc);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, W, H);
    // A finished 3:4 canvas is one post. Avoid mistaking shadows or buildings
    // for collage seams. Import collage explicitly overrides this safeguard.
    if (!forceCollage && Math.abs(W / H - .75) < .004) return {canvas:cv, boxes:[[0,0,W,H]]};
    var data;
    try { data = cx.getImageData(0, 0, W, H).data; } catch(e){ return { canvas: cv, boxes: [[0, 0, W, H]] }; }
    var acc = [];
    splitRegion(data, W, 0, 0, W, H, 0, acc);
    var minDim = Math.max(140, Math.round(0.2 * Math.min(W, H)));
    var keep = acc.filter(function(bx){
      var w = bx[2] - bx[0], h = bx[3] - bx[1];
      if (w < minDim || h < minDim) return false;
      return regionStd(data, W, bx[0], bx[1], bx[2], bx[3]) >= MIN_STD;
    });
    keep.sort(function(p, q){ return (Math.floor(p[1] / 200) - Math.floor(q[1] / 200)) || (p[0] - q[0]); });
    if (!keep.length) keep = [[0, 0, W, H]];
    keep = keep.map(function(bx){ return snapBox(data, W, H, bx); });
    return { canvas: cv, boxes: keep };
  }
  function regionToPost(cv, bx){
    var w = bx[2] - bx[0], h = bx[3] - bx[1];
    var out = document.createElement('canvas'); out.width = 1080; out.height = 1440;
    var cx = out.getContext('2d');
    var s = Math.max(out.width / w, out.height / h);
    var dw = w * s, dh = h * s;
    cx.drawImage(cv, bx[0], bx[1], w, h, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
    return out.toDataURL('image/jpeg', .85);
  }
  var storageWarned = false;
  function addToBacklog(srcs, skipUndo, quiet){
    if (!skipUndo) pushUndo();
    if (state.railh){ state.railh = false; save(); applyRail(); }
    var ids = [];
    for (var i = srcs.length - 1; i >= 0; i--){
      var id = 'u' + Date.now() + Math.floor(Math.random() * 1e5);
      byId[id] = srcs[i]; state.backlog.unshift(id); ids.unshift(id);
      if (db) { try { db.transaction('added','readwrite').objectStore('added').put({id: id, src: srcs[i]}); } catch(e){} }
    }
    save(); render();
    if (!db && !storageWarned){ storageWarned = true;
      toast('Added to Library for this visit only - this browser blocks image storage'); return ids; }
    // quiet: a split chip is about to announce this multi-region drop instead - skip the
    // toast so the two notifications don't stack (single-image adds still always toast).
    if (srcs.length > 1){ if (!quiet) toast('Split into ' + srcs.length + ' posts - in the Library'); }
    else toast('Added to the Library - drag it into the grid');
    return ids;
  }

  // ---- split confirm chip (F4): after a multi-region drop the split already
  // happened (Keep is the default outcome, matching TESTS.md #15-17 immediacy) - this
  // is just a non-blocking offer to collapse it back down. Auto-dismisses (= Keep)
  // after ~8s. Only one chip lives at a time; a later multi-region drop replaces it.
  // The chip describes a whole DROP GESTURE, not one file: splitChipGroups holds one
  // {ids, mergedSrc} entry per multi-region file the gesture produced (see the window
  // 'drop' handler below), so N in the label and what Merge collapses always match.
  var splitChipEl = null, splitChipTimer = null, splitChipGroups = null;
  function ensureSplitChip(){
    if (splitChipEl) return splitChipEl;
    var el = document.createElement('div'); el.className = 'splitchip';
    var label = document.createElement('span'); label.id = 'splitchiplabel';
    var keepBtn = document.createElement('button'); keepBtn.type = 'button'; keepBtn.textContent = 'Keep';
    var mergeBtn = document.createElement('button'); mergeBtn.type = 'button'; mergeBtn.textContent = 'Merge';
    keepBtn.addEventListener('click', function(){ dismissSplitChip(); });
    mergeBtn.addEventListener('click', doMergeSplit);
    el.appendChild(label); el.appendChild(keepBtn); el.appendChild(mergeBtn);
    document.body.appendChild(el);
    splitChipEl = el;
    return el;
  }
  function showSplitChip(groups){
    dismissSplitChip();
    if (!groups.length) return;
    var el = ensureSplitChip();
    var total = 0;
    groups.forEach(function(g){ total += g.ids.length; });
    el.querySelector('#splitchiplabel').textContent = 'Split into ' + total + ' posts';
    splitChipGroups = groups;
    el.classList.add('on');
    document.body.classList.add('splitpending'); // F5: bumps a live selectchip up a row, see CSS
    splitChipTimer = setTimeout(dismissSplitChip, 8000);
  }
  function dismissSplitChip(){
    if (splitChipTimer){ clearTimeout(splitChipTimer); splitChipTimer = null; }
    if (splitChipEl) splitChipEl.classList.remove('on');
    splitChipGroups = null;
    document.body.classList.remove('splitpending');
  }
  function doMergeSplit(){
    // re-validate against current state: applySnapshot/reset/import already dismiss the
    // chip outright, but this filter is the backstop against any id the chip still names
    // having been individually deleted since it was shown.
    var groups = (splitChipGroups || []).map(function(g){
      return { ids: g.ids.filter(function(id){ return byId[id]; }), mergedSrc: g.mergedSrc };
    }).filter(function(g){ return g.ids.length; });
    dismissSplitChip();
    if (!groups.length){ toast('That split is no longer here'); return; }
    pushUndo();
    var mergedIds = [];
    groups.forEach(function(g){
      g.ids.forEach(function(id){
        takeOut(id);
        delete byId[id];
        delete state.meta[id];
        if (db) { try { db.transaction('added','readwrite').objectStore('added').delete(id); } catch(e){} }
      });
      var mid = 'u' + Date.now() + Math.floor(Math.random() * 1e5);
      byId[mid] = g.mergedSrc; state.backlog.unshift(mid); mergedIds.unshift(mid);
      if (db) { try { db.transaction('added','readwrite').objectStore('added').put({id: mid, src: g.mergedSrc}); } catch(e){} }
    });
    save(); render(); highlight(mergedIds, true);
    toast(mergedIds.length > 1 ? ('Merged into ' + mergedIds.length + ' posts') : 'Merged into one post');
  }

  // add images by file drop
  var dragDepth = 0;
  window.addEventListener('dragenter', function(ev){
    if (dragId) return;
    if (ev.dataTransfer && Array.prototype.some.call(ev.dataTransfer.types, function(t){ return t === 'Files'; })){
      dragDepth++; document.body.classList.add('filedrag'); } });
  window.addEventListener('dragleave', function(){ if (--dragDepth <= 0){ dragDepth = 0; document.body.classList.remove('filedrag'); } });
  window.addEventListener('dragover', function(ev){ if (document.body.classList.contains('filedrag')) ev.preventDefault(); });
  window.addEventListener('drop', function(ev){
    dragDepth = 0; document.body.classList.remove('filedrag');
    if (!ev.dataTransfer || !ev.dataTransfer.files || !ev.dataTransfer.files.length) return;
    ev.preventDefault();
    processFiles(ev.dataTransfer.files);
  });
  function readFile(file, asText){
    return new Promise(function(resolve, reject){
      var reader = new FileReader(); reader.onload = function(){ resolve(reader.result); };
      reader.onerror = function(){ reject(new Error('Could not read ' + file.name)); };
      if (asText) reader.readAsText(file); else reader.readAsDataURL(file);
    });
  }
  function importLayout(j){
    if (!j || !Array.isArray(j.order) || (j.backlog && !Array.isArray(j.backlog)) || (j.added && !Array.isArray(j.added))) throw new Error('Choose a Gridsmith layout JSON file.');
    var added = (j.added || []);
    if (added.some(function(r){ return !validAdded(r); })) throw new Error('This layout contains an invalid image. Nothing was changed.');
    var draftState = sanitizeDrafts(j.drafts), metadata = sanitizeMeta(j.meta);
    dismissSplitChip(); pushUndo();
    added.forEach(function(r){ byId[r.id] = r.src;
      if (db) { try { db.transaction('added','readwrite').objectStore('added').put({id:r.id, src:r.src}); } catch(e){} }
    });
    var seen = Object.create(null);
    function available(id){ if (!byId[id] || seen[id]) return false; seen[id] = true; return true; }
    state = { order: cleanIds(j.order).filter(available), backlog: cleanIds(j.backlog || j.hidden).filter(available),
      cols: [3,4,5].indexOf(j.cols) >= 0 ? j.cols : 3,
      railw: typeof j.railw === 'number' && j.railw >= 84 ? j.railw : 0, railh: !!j.railh,
      meta: metadata, drafts: draftState };
    sweepOrphans(); clearSelection(); save(); applyRail(); render(); toast('Layout restored');
  }
  var importBusy = false;
  function processFiles(fileList, forceCollage){
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.resolve();
    if (importBusy){ toast('Images are still being added. Try again when they finish.'); return Promise.resolve(); }
    var layouts = files.filter(function(f){ return f.type === 'application/json' || /\.json$/i.test(f.name); });
    if (layouts.length && files.length > 1){ toast('Choose a layout file on its own, or add image files.'); return Promise.resolve(); }
    importBusy = true;
    var button = document.getElementById('addimages'); if (button) button.disabled = true;
    var task;
    if (layouts.length){
      task = readFile(layouts[0], true).then(function(raw){
        var json; try { json = JSON.parse(raw); } catch(e){ throw new Error('That file is not valid JSON. Nothing was changed.'); }
        importLayout(json);
      });
    } else {
      toast('Adding ' + files.length + (files.length === 1 ? ' image...' : ' images...'));
      var results = [], failures = [];
      task = files.reduce(function(promise, file){
        return promise.then(function(){
          if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) throw new Error(file.name + ': unsupported file type');
          if (file.size > 30 * 1024 * 1024) throw new Error(file.name + ': larger than 30 MB');
          return readFile(file, false).then(function(src){ return new Promise(function(resolve, reject){
            var img = new Image();
            img.onload = function(){
              try {
                if (img.naturalWidth * img.naturalHeight > 40000000) throw new Error(file.name + ': image is too large');
                var det = detectRegions(img, forceCollage);
                results.push({ srcs: det.boxes.map(function(box){ return regionToPost(det.canvas, box); }),
                  mergedSrc: det.boxes.length > 1 ? regionToPost(det.canvas, [0, 0, det.canvas.width, det.canvas.height]) : null });
                resolve();
              } catch(e){ reject(e); }
            };
            img.onerror = function(){ reject(new Error(file.name + ': image could not be opened')); }; img.src = src;
          }); });
        }).catch(function(error){ failures.push(error.message); });
      }, Promise.resolve()).then(function(){
        var srcs = []; results.forEach(function(result){ srcs = srcs.concat(result.srcs); });
        if (srcs.length){
          var ids = addToBacklog(srcs, false, true), groups = [], offset = 0;
          results.forEach(function(result){
            if (result.mergedSrc) groups.push({ids:ids.slice(offset, offset + result.srcs.length), mergedSrc:result.mergedSrc});
            offset += result.srcs.length;
          });
          if (groups.length) showSplitChip(groups);
        }
        if (failures.length) toast((srcs.length ? 'Added ' + srcs.length + '. ' : '') + failures[0] + (failures.length > 1 ? ' (' + failures.length + ' files skipped)' : ''));
        else toast('Added ' + srcs.length + (srcs.length === 1 ? ' post to library' : ' posts to library'));
      });
    }
    return task.catch(function(error){ toast(error.message || 'Could not import that file.'); }).then(function(){
      importBusy = false; if (button) button.disabled = false;
    });
  }
  var fileInput = document.getElementById('fileinput'), addImagesButton = document.getElementById('addimages');
  if (fileInput && addImagesButton){
    addImagesButton.addEventListener('click', function(){ fileInput.click(); });
    fileInput.addEventListener('change', function(){ processFiles(fileInput.files); fileInput.value = ''; });
  }
  var imageStorageReady = idb().then(function(d){
    db = d;
    if (!db) { render(); return; }
    return new Promise(function(resolve){
      try {
        var tx=db.transaction('added'),req=tx.objectStore('added').getAll(),rows=[];
        req.onsuccess=function(){rows=req.result||[];};
        tx.oncomplete=function(){rows.forEach(function(r){if(validAdded(r))byId[r.id]=r.src;});sweepOrphans();render();resolve();};
        tx.onabort=function(){db=null;render();resolve();};
      }catch(e){db=null;render();resolve();}
    });
  });
  applyRail();
  render();
  updateUndoUI();
})();

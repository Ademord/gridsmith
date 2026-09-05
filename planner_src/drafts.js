  // Named drafts store IDs and text only. Accept the original name-keyed format on import.
  // Keep IDs whose uploads have not finished restoring from IndexedDB; load filters them later.
  function sanitizeDrafts(raw){
    var own = Object.prototype.hasOwnProperty;
    function value(obj, key){ return obj && own.call(obj, key) ? obj[key] : undefined; }
    function safeId(id){ return typeof id === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(id) && ['__proto__','constructor','prototype'].indexOf(id) < 0; }
    var rows = [];
    if (Array.isArray(raw)) rows = raw.slice(0, 100).map(function(row){ return {row:row}; });
    else if (raw && typeof raw === 'object') rows = Object.keys(raw).slice(0,100).map(function(name){ return {row:value(raw,name),name:name}; });
    var result = [], names = Object.create(null), keys = Object.create(null);
    rows.forEach(function(entry){
      if (result.length >= 10) return;
      var row = entry.row;
      if (!row || typeof row !== 'object' || Array.isArray(row) || !Array.isArray(value(row,'order'))) return;
      var name = entry.name === undefined ? value(row,'name') : entry.name;
      if (typeof name !== 'string') return;
      name = name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80);
      if (!name || names[name.toLowerCase()]) return;
      var seen = Object.create(null);
      function ids(list){ return (Array.isArray(list) ? list.slice(0,5000) : []).filter(function(id){
        if (!safeId(id) || seen[id]) return false; seen[id] = true; return true;
      }); }
      var order = ids(value(row,'order')), backlog = ids(value(row,'backlog'));
      var id = value(row,'id');
      if (!safeId(id) || keys[id]) id = 'draft-import-' + result.length;
      while (keys[id]) id += '-1';
      var meta = Object.create(null), rawMeta = value(row,'meta');
      if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) Object.keys(rawMeta).slice(0,5000).forEach(function(mid){
        if (!safeId(mid)) return;
        var m = value(rawMeta,mid);
        if (!m || typeof m !== 'object' || Array.isArray(m)) return;
        var caption = value(m,'c'), date = value(m,'d');
        var c = typeof caption === 'string' ? caption.slice(0,10000) : '';
        var d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
        if (c || d) meta[mid] = {c:c,d:d};
      });
      var time = value(row,'createdAt');
      var cleaned = {id:id,name:name,createdAt:typeof time === 'number' && isFinite(time) && time > 0 ? time : 0,
        order:order,backlog:backlog};
      if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) cleaned.meta = meta;
      result.push(cleaned);
      names[name.toLowerCase()] = true; keys[id] = true;
    });
    return result;
  }

  function plannerPanel(tag, title, trigger){
    if (!document.getElementById('planner-panel-styles')){
      var style = document.createElement('style'); style.id = 'planner-panel-styles';
      style.textContent = '.panel-dialog{width:min(560px,calc(100vw - 28px));max-height:calc(100dvh - 40px);margin:auto;padding:0;background:var(--rail,#151515);color:var(--ink,#f5f5f5);border:1px solid var(--line,#333);border-radius:16px;overflow:auto;box-shadow:0 24px 90px #0006}.panel-dialog::backdrop{background:#0007;backdrop-filter:blur(3px)}.panel-dialog .panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px 14px;border-bottom:1px solid var(--line)}.panel-dialog h2{font-size:20px;line-height:1.3;letter-spacing:-.025em}.panel-dialog .panel-close{min-width:40px;min-height:40px;font-size:22px;padding:0}.panel-dialog .panel-body{padding:20px 22px}.panel-dialog .field-label{display:block;font-weight:600;margin-bottom:8px}.panel-dialog .draft-form{display:flex;gap:8px}.panel-dialog .draft-form input{flex:1;min-width:0;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:inherit}.panel-dialog .draft-form button{white-space:nowrap}.panel-dialog button{min-height:40px}.panel-dialog .draft-list,.panel-dialog .check-list{list-style:none;padding:0;margin:18px 0 0}.panel-dialog .draft-row,.panel-dialog .check-row{display:flex;align-items:center;gap:14px;border-top:1px solid var(--line);padding:14px 0}.panel-dialog .draft-info{min-width:0;flex:1}.panel-dialog .draft-name{display:block;overflow-wrap:anywhere;font-size:14px;font-weight:600}.panel-dialog .draft-detail,.panel-dialog .check-note,.panel-dialog .draft-message{font-size:12px;line-height:1.5;color:var(--mut)}.panel-dialog .draft-actions{display:flex;gap:6px;flex-shrink:0}.panel-dialog .draft-message{min-height:20px;margin-top:10px}.panel-dialog .draft-message[data-error]{color:var(--danger,#d55952)}.panel-dialog .draft-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}.panel-dialog .check-row{align-items:stretch}.panel-dialog .check-finding{flex:1;min-width:0;border:0;padding:0;text-align:left;display:flex;gap:12px;align-items:center}.panel-dialog .check-finding:hover .check-title{text-decoration:underline}.panel-dialog .check-title{display:block;font-size:14px;font-weight:600}.panel-dialog .check-tiles{display:flex;flex-shrink:0}.panel-dialog .check-tiles img{width:32px;height:43px;object-fit:cover;border-radius:4px;border:2px solid var(--rail);margin-left:-7px}.panel-dialog .check-tiles img:first-child{margin-left:0}.panel-dialog .check-dismiss{font-size:18px;min-width:32px;align-self:center;padding:0;border:0}.panel-dialog .check-empty{padding:24px 0;font-size:14px}.panel-dialog .check-summary{font-size:14px;font-weight:600;margin-bottom:6px}.panel-dialog .check-actions{display:flex;gap:10px;align-items:center;margin-top:14px}@media(max-width:480px){.panel-dialog .panel-head{padding:16px}.panel-dialog .panel-body{padding:16px}.panel-dialog .draft-row{gap:8px}.panel-dialog .draft-actions button{padding:7px 9px}.panel-dialog .check-tiles img{width:28px;height:38px}}';
      document.head.appendChild(style);
    }
    var dialog = document.createElement('dialog'); dialog.className = 'panel-dialog ' + tag + '-dialog';
    dialog.id = tag + '-dialog'; dialog.setAttribute('aria-labelledby',tag + '-heading');
    var head = document.createElement('div'); head.className = 'panel-head';
    var h = document.createElement('h2'); h.id = tag + '-heading'; h.textContent = title;
    var close = document.createElement('button'); close.className = 'panel-close'; close.type = 'button'; close.textContent = '\u00d7'; close.setAttribute('aria-label','Close ' + title.toLowerCase());
    head.append(h,close); dialog.appendChild(head);
    var body = document.createElement('div'); body.className = 'panel-body'; dialog.appendChild(body);
    close.addEventListener('click',function(){dialog.close();});
    dialog.addEventListener('click',function(ev){ if (ev.target !== dialog) return; var r = dialog.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) dialog.close(); });
    dialog.addEventListener('keydown',function(ev){ ev.stopPropagation(); });
    dialog.addEventListener('close',function(){ var target = dialog._plannerReturnTarget; dialog._plannerReturnTarget = null; if (target) target.focus({preventScroll:true}); });
    document.body.appendChild(dialog);
    return {dialog:dialog,body:body,close:close};
  }

  var draftsPanel = null, deletedDraft = null;
  function openDrafts(){
    if (!draftsPanel) draftsPanel = plannerPanel('draft','Drafts',document.getElementById('drafts-toggle'));
    drawDrafts(); openPanelModal(draftsPanel.dialog);
    draftsPanel.body.querySelector('input').focus();
  }
  function drawDrafts(message, error){
    var body = draftsPanel.body; body.replaceChildren();
    state.drafts = sanitizeDrafts(state.drafts);
    var label = document.createElement('label'); label.className = 'field-label'; label.htmlFor = 'draft-name'; label.textContent = 'Save current layout';
    var form = document.createElement('form'); form.className = 'draft-form';
    var input = document.createElement('input'); input.id = 'draft-name'; input.name = 'draft-name'; input.maxLength = 80; input.placeholder = 'Name this draft'; input.autocomplete = 'off'; input.setAttribute('aria-describedby','draft-message');
    var submit = document.createElement('button'); submit.className = 'btn-primary'; submit.type = 'submit'; submit.textContent = 'Save draft';
    form.append(input,submit); body.append(label,form);
    var status = document.createElement('p'); status.className = 'draft-message'; status.id = 'draft-message'; status.setAttribute('role','status'); status.textContent = message || 'Keep up to 10 layouts, with captions and dates.';
    if (error) status.dataset.error = ''; body.appendChild(status);
    if (state.drafts.length >= 10){ submit.disabled = true; status.textContent = '10 drafts saved. Delete one to save another.'; }
    form.addEventListener('submit',function(ev){
      ev.preventDefault(); var name = input.value.replace(/[\u0000-\u001f\u007f]/g,'').trim();
      function invalid(text){ status.textContent = text; status.dataset.error = ''; input.setAttribute('aria-invalid','true'); input.focus(); }
      if (!name){ invalid('Give this draft a name.'); return; }
      if (state.drafts.some(function(d){return d.name.toLowerCase() === name.toLowerCase();})){ invalid('That name is already used. Choose another.'); return; }
      if (state.drafts.length >= 10){ invalid('Delete a draft first. You can keep up to 10.'); return; }
      if (typeof pushUndo === 'function') pushUndo();
      state.drafts = sanitizeDrafts(state.drafts.concat([{id:'draft-' + Date.now() + '-' + Math.floor(Math.random()*100000),name:name,createdAt:Date.now(),order:state.order.slice(),backlog:state.backlog.slice(),meta:state.meta}]));
      save(); drawDrafts('Saved \u201c' + name + '\u201d.'); draftsPanel.body.querySelector('input').focus();
    });
    var list = document.createElement('ul'); list.className = 'draft-list'; list.setAttribute('aria-label','Saved drafts');
    if (!state.drafts.length){ var empty = document.createElement('li'); empty.className = 'check-empty'; empty.textContent = 'Your saved layouts will appear here.'; list.appendChild(empty); }
    state.drafts.forEach(function(draft){
      var row = document.createElement('li'); row.className = 'draft-row';
      var info = document.createElement('div'); info.className = 'draft-info';
      var name = document.createElement('span'); name.className = 'draft-name'; name.textContent = draft.name;
      var detail = document.createElement('span'); detail.className = 'draft-detail';
      detail.textContent = draft.order.length + ' planned \u00b7 ' + draft.backlog.length + ' in library';
      info.append(name,detail);
      var actions = document.createElement('div'); actions.className = 'draft-actions';
      var load = document.createElement('button'); load.type = 'button'; load.textContent = 'Load'; load.setAttribute('aria-label','Load ' + draft.name);
      load.addEventListener('click',function(){ loadDraft(draft.id); });
      var remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.setAttribute('aria-label','Delete ' + draft.name);
      remove.addEventListener('click',function(){
        pushUndo(); deletedDraft = draft;
        state.drafts = state.drafts.filter(function(d){return d.id !== draft.id;}); save();
        drawDrafts('Deleted \u201c' + draft.name + '\u201d.');
        var undo = draftsPanel.body.querySelector('[data-undo-draft]'); if (undo) undo.focus();
      });
      actions.append(load,remove); row.append(info,actions); list.appendChild(row);
    }); body.appendChild(list);
    if (deletedDraft){
      var footer = document.createElement('div'); footer.className = 'draft-footer';
      var undo = document.createElement('button'); undo.type = 'button'; undo.textContent = 'Undo delete'; undo.dataset.undoDraft = '';
      undo.disabled = state.drafts.length >= 10 || state.drafts.some(function(d){return d.id === deletedDraft.id || d.name.toLowerCase() === deletedDraft.name.toLowerCase();});
      undo.addEventListener('click',function(){
        if (undo.disabled) return; pushUndo(); state.drafts.push(deletedDraft); deletedDraft = null; save(); drawDrafts('Draft restored.'); draftsPanel.body.querySelector('input').focus();
      }); footer.appendChild(undo); body.appendChild(footer);
    }
  }
  function loadDraft(id){
    var draft = sanitizeDrafts(state.drafts).find(function(d){return d.id === id;});
    if (!draft) return;
    var seen = Object.create(null), skipped = 0;
    function available(id){
      if (!Object.prototype.hasOwnProperty.call(byId,id) || lockedIds.indexOf(id) >= 0 || seen[id]){ skipped++; return false; }
      seen[id] = true; return true;
    }
    var order = draft.order.filter(available), backlog = draft.backlog.filter(available);
    var extra = state.order.concat(state.backlog,Object.keys(byId).filter(isUser)).filter(function(mid){
      if (!Object.prototype.hasOwnProperty.call(byId,mid) || lockedIds.indexOf(mid) >= 0 || seen[mid]) return false;
      seen[mid] = true; return true;
    });
    pushUndo();
    if (typeof dismissSplitChip === 'function') dismissSplitChip();
    var meta = sanitizeMeta(state.meta);
    if (draft.meta) draft.order.concat(draft.backlog).forEach(function(mid){
      if (lockedIds.indexOf(mid) >= 0 || !Object.prototype.hasOwnProperty.call(byId,mid)) return;
      delete meta[mid]; if (Object.prototype.hasOwnProperty.call(draft.meta,mid)) meta[mid] = {c:draft.meta[mid].c,d:draft.meta[mid].d};
    });
    state.order = order; state.backlog = backlog.concat(extra); state.meta = meta;
    if (typeof clearSelection === 'function') clearSelection();
    save(); render(); if (draftsPanel) draftsPanel.dialog.close();
    toast('Loaded \u201c' + draft.name + '\u201d' + (skipped ? ' \u00b7 ' + skipped + ' unavailable post' + (skipped === 1 ? '' : 's') + ' skipped' : ''));
  }
  var draftsTrigger = document.getElementById('drafts-toggle');
  if (draftsTrigger){ draftsTrigger.setAttribute('aria-haspopup','dialog'); draftsTrigger.addEventListener('click',openDrafts); }

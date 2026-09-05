  // Confirmed imports persist as one image transaction. Keep the staged review,
  // application state, and undo stack intact until both stores accept the batch.
  var importStorageCommit = null, importStorageSerial = 0;
  function importStorageError(detail){
    return new Error(detail + ' Nothing was imported. Try again, choose fewer photos, or cancel.');
  }
  function importStorageCancelled(){
    var error = new Error('Import cancelled. Nothing was imported.'); error.name = 'AbortError'; return error;
  }
  function commitImportedPhotos(sources, isActive){
    if (importStorageCommit) return Promise.reject(importStorageError('Another import is still being saved.'));
    if (!Array.isArray(sources) || !sources.length) return Promise.resolve([]);
    var rows = [], ids = [], seen = Object.create(null);
    sources.forEach(function(src){
      var id;
      do { id = 'u' + Date.now().toString(36) + '-' + (++importStorageSerial).toString(36) + '-' + Math.random().toString(36).slice(2,10); }
      while (byId[id] || seen[id]);
      seen[id] = true; ids.push(id); rows.push({id:id,src:src});
    });
    if (!rows.every(validAdded)) return Promise.reject(importStorageError('One of these photos could not be saved.'));
    function alive(){ return typeof isActive !== 'function' || isActive(); }
    var ready = typeof imageStorageReady !== 'undefined' ? imageStorageReady : Promise.resolve(null);
    var work = Promise.resolve(ready).then(function(){
      if (!alive()) throw importStorageCancelled();
      if (importStorageCommit) throw importStorageError('Another import is still being saved.');
      // Waiting for initial restoration has no durable side effects. Acquire the
      // write lock only after readiness so cancelling that wait releases the UI.
      importStorageCommit = work;
      if (!db) throw importStorageError('This browser blocks photo storage. Enable browser storage before retrying.');
      var beforeRaw, next = Object.assign({},state,{backlog:ids.concat(state.backlog),railh:false});
      try { beforeRaw = localStorage.getItem(LS); }
      catch(e){ throw importStorageError('This browser blocks layout storage. Enable browser storage before retrying.'); }
      return new Promise(function(resolve,reject){
        var tx, wroteLayout = false, failure = null, timer = null;
        function stopTimer(){ if (timer !== null) { clearInterval(timer); timer = null; } }
        function restoreLayout(){
          if (!wroteLayout) return true;
          try {
            if (beforeRaw === null) localStorage.removeItem(LS); else localStorage.setItem(LS,beforeRaw);
            wroteLayout = false; return true;
          } catch(e){ return false; }
        }
        function rejectBatch(){
          stopTimer();
          if (!restoreLayout()) { reject(new Error('The photos were not imported, but the browser blocked restoring the layout backup. Use Save layout to keep your current layout before reloading.')); return; }
          reject(failure || importStorageError('Photo storage is full or unavailable.'));
        }
        function abort(error){
          failure = error;
          try { tx.abort(); } catch(e){} // oncomplete handles cancellation after the commit point.
        }
        try {
          tx = db.transaction('added','readwrite');
          tx.onabort = rejectBatch;
          // A failed request aborts the whole transaction; do not preventDefault.
          tx.onerror = function(){ failure = failure || importStorageError('Photo storage is full or unavailable.'); };
          tx.oncomplete = function(){
            stopTimer();
            if (!alive()) {
              // Cancel can arrive after the database committed but before its
              // completion event. Remove that batch before releasing the lock.
              failure = importStorageCancelled();
              try {
                var cleanup = db.transaction('added','readwrite'), store = cleanup.objectStore('added');
                cleanup.oncomplete = rejectBatch;
                cleanup.onabort = function(){ restoreLayout(); reject(new Error('The browser could not finish cancelling this import. Reload to recover the saved photos, or use Save layout before leaving.')); };
                ids.forEach(function(id){ store.delete(id); });
              } catch(e){ restoreLayout(); reject(new Error('The browser could not finish cancelling this import. Reload to recover the saved photos, or use Save layout before leaving.')); }
              return;
            }
            pushUndo();
            rows.forEach(function(row){ byId[row.id] = row.src; });
            state.backlog = next.backlog; state.railh = false;
            save.failed = false; if (typeof saveNotice === 'function') saveNotice(true); applyRail(); render(); resolve(ids);
          };
          var store = tx.objectStore('added');
          rows.forEach(function(row,index){
            var request = store.add(row);
            request.onsuccess = function(){
              if (!alive()) { abort(importStorageCancelled()); return; }
              if (index !== rows.length - 1) return;
              // localStorage is synchronous. If it rejects, abort all image
              // writes while this transaction is still active. If the image
              // commit subsequently aborts, put the previous layout back.
              try { localStorage.setItem(LS,JSON.stringify(next)); wroteLayout = true; }
              catch(e){ abort(importStorageError('Layout storage is full or blocked. Free browser storage before retrying.')); }
            };
          });
          timer = setInterval(function(){ if (!alive()) abort(importStorageCancelled()); },20);
        } catch(e){
          failure = importStorageError('Photo storage is full or unavailable.');
          if (tx) abort(failure); else rejectBatch();
        }
      });
    });
    return work.then(function(result){ if(importStorageCommit===work)importStorageCommit = null; return result; },function(error){ if(importStorageCommit===work)importStorageCommit = null; throw error; });
  }

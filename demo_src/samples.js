  // Runs inside the planner closure so adding samples uses the normal history.
  var extraSampleIds = bundled.filter(function (photo) {
    return photo.sample === true && !photo.locked && /^sample_(2[2-9]|30)$/.test(photo.id);
  }).map(function (photo) { return photo.id; });
  function missingExtraSamples() {
    return extraSampleIds.filter(function (id) {
      return state.order.indexOf(id) < 0 && state.backlog.indexOf(id) < 0;
    });
  }
  var addingSamples = false;
  document.addEventListener('gridsmith:add-samples', async function () {
    if (addingSamples) return;
    addingSamples = true;
    try {
      await imageStorageReady;
      if (snapshotBusy || document.querySelector('dialog[open],.lightbox.on')) {
        toast('Finish the open action, then add the samples.'); return;
      }
      var missing = missingExtraSamples();
      if (!missing.length) return;
      var next = Object.assign({}, state, { order: state.order.concat(missing) });
      try { localStorage.setItem(LS, JSON.stringify(next)); }
      catch (error) { toast('The samples could not be saved. Free browser storage and try again.'); return; }
      pushUndo(); state = next; save.failed = false; saveNotice(true); render();
      document.getElementById('grid').focus({ preventScroll: true });
      toast('Added ' + missing.length + ' sample photos. Undo is available.');
    } finally { addingSamples = false; }
  });

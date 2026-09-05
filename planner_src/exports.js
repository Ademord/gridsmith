  // Ordered delivery uses the same image resolver as each tile's Download action.
  // Original JPEG bytes stay intact. A standalone saved HTML can still export its
  // embedded images, and records exactly when a full-size source was unavailable.
  var exportSources = {};
  bundled.forEach(function(entry){ exportSources[entry.id] = entry; });

  function exportImageSize(blob){
    if (window.createImageBitmap) return createImageBitmap(blob).then(function(im){
      var size = {width:im.width, height:im.height}; im.close(); return size;
    });
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function(){ URL.revokeObjectURL(url); resolve({width:im.naturalWidth,height:im.naturalHeight}); };
      im.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('Image could not be read')); };
      im.src = url;
    });
  }
  function exportFetch(url){
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function(){ controller.abort(); }, 6000) : null;
    return fetch(url, controller ? {signal:controller.signal} : {}).then(function(response){
      if (!response.ok) throw new Error('Image source is unavailable');
      return response.blob();
    }).finally(function(){ if (timer) clearTimeout(timer); });
  }
  async function exportJPEG(blob){
    var bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return blob;
    var url = URL.createObjectURL(blob);
    try {
      var im = await new Promise(function(resolve, reject){
        var img = new Image(); img.onload = function(){resolve(img);}; img.onerror = reject; img.src = url;
      });
      var cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      var cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(im,0,0);
      return await new Promise(function(resolve, reject){cv.toBlob(function(result){result ? resolve(result) : reject(new Error('Image conversion failed'));},'image/jpeg',.95);});
    } finally { URL.revokeObjectURL(url); }
  }
  async function exportAsset(id, source){
    var entry = exportSources[id], blob, quality;
    if (entry && entry.original){
      try {
        blob = await exportFetch(new URL(entry.original, document.baseURI).href);
        var originalSize = await exportImageSize(blob);
        // Decode first so an HTML fallback from a static host cannot enter the ZIP.
        blob = await exportJPEG(blob);
        return {blob:blob, quality:'original-file', width:originalSize.width, height:originalSize.height};
      } catch(e){ quality = 'preview-fallback'; }
    }
    if (!source) throw new Error('Image ' + id + ' is missing');
    blob = await exportJPEG(await exportFetch(source));
    var size = await exportImageSize(blob);
    quality = quality || (entry && entry.locked ? 'screenshot-preview' : entry ? 'embedded-preview' : 'saved-image');
    return {blob:blob, quality:quality, width:size.width, height:size.height};
  }
  async function exportDownload(blob, filename){
    var d = await getDls();
    if (d) {
      for (var retry = 0; ; retry++) {
        try { await d.save({filename:filename,data:blob}); return; }
        catch(e) {
          if (!e || e.code !== 'rate_limited' || retry >= 8) throw e;
          await new Promise(function(resolve){ setTimeout(resolve,350); });
        }
      }
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  }
  saveImage = async function(id, quiet){
    try {
      var asset = await exportAsset(id, byId[id]);
      await exportDownload(asset.blob, exportSafeId(id) + '.jpg');
      if (!quiet) toast(asset.quality.indexOf('preview') >= 0 ? 'Downloaded preview · ' + asset.width + ' × ' + asset.height : 'Downloaded · ' + asset.width + ' × ' + asset.height);
    } catch(e){ if (!quiet) toast('Download failed. Try again.'); if (quiet) throw e; }
  };

  function exportSafeId(id){ return String(id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,100) || 'image'; }
  var exportCRCtable = new Uint32Array(256);
  for (var ei = 0; ei < 256; ei++) {
    var ec = ei;
    for (var ek = 0; ek < 8; ek++) ec = (ec & 1) ? (0xedb88320 ^ (ec >>> 1)) : (ec >>> 1);
    exportCRCtable[ei] = ec >>> 0;
  }
  function exportCRC(bytes){
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = exportCRCtable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  // ZIP's stored mode avoids recompressing JPEGs and works entirely offline.
  async function exportZip(files){
    if (files.length > 65535) throw new Error('Too many files for one ZIP');
    var local = [], central = [], offset = 0, centralSize = 0, encoder = new TextEncoder();
    var now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((Math.max(1980,now.getFullYear()) - 1980) << 9) | ((now.getMonth()+1) << 5) | now.getDate();
    for (var i = 0; i < files.length; i++) {
      var file = files[i], name = encoder.encode(file.name), bytes = new Uint8Array(await file.blob.arrayBuffer()), crc = exportCRC(bytes);
      if (offset + bytes.length + name.length + 30 >= 0xffffffff) throw new Error('This grid is too large for one ZIP');
      var head = new Uint8Array(30 + name.length), view = new DataView(head.buffer);
      view.setUint32(0,0x04034b50,true); view.setUint16(4,20,true); view.setUint16(6,0x800,true);
      view.setUint16(10,dosTime,true); view.setUint16(12,dosDate,true); view.setUint32(14,crc,true);
      view.setUint32(18,bytes.length,true); view.setUint32(22,bytes.length,true); view.setUint16(26,name.length,true); head.set(name,30);
      local.push(head,bytes);
      var directory = new Uint8Array(46+name.length), dv = new DataView(directory.buffer);
      dv.setUint32(0,0x02014b50,true); dv.setUint16(4,20,true); dv.setUint16(6,20,true); dv.setUint16(8,0x800,true);
      dv.setUint16(12,dosTime,true); dv.setUint16(14,dosDate,true); dv.setUint32(16,crc,true);
      dv.setUint32(20,bytes.length,true); dv.setUint32(24,bytes.length,true); dv.setUint16(28,name.length,true); dv.setUint32(42,offset,true); directory.set(name,46);
      central.push(directory); centralSize += directory.length; offset += head.length + bytes.length;
    }
    var end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true); ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
    ev.setUint32(12,centralSize,true); ev.setUint32(16,offset,true);
    return new Blob(local.concat(central,[end]), {type:'application/zip'});
  }
  function exportCSV(value){
    var text = value == null ? '' : String(value);
    // Captions are untrusted spreadsheet input. JSON retains their exact text.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g,'""') + '"';
  }
  var exportBusy = false;
  async function exportPosts(){
    if (exportBusy) return;
    var button = document.getElementById('exportposts'), originalContent = button ? Array.prototype.slice.call(button.childNodes) : [];
    var ids = state.order.concat(lockedIds), sources = {}, metadata = {};
    ids.forEach(function(id){ sources[id] = byId[id]; metadata[id] = Object.assign({}, state.meta[id] || {}); });
    if (!ids.length) { toast('Add a photo to export'); return; }
    exportBusy = true;
    if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); }
    try {
      var files = [], rows = [], previews = 0;
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i], meta = metadata[id], asset = await exportAsset(id,sources[id]);
        var filename = String(i+1).padStart(3,'0') + '_' + exportSafeId(id) + '.jpg';
        files.push({name:filename,blob:asset.blob});
        if (asset.quality.indexOf('preview') >= 0) previews++;
        rows.push({position:i+1,id:id,filename:filename,status:lockedIds.indexOf(id) >= 0 ? 'posted' : 'planned',caption:meta.c || '',plannedDate:meta.d || '',width:asset.width,height:asset.height,source:asset.quality});
        if (button) button.textContent = 'Preparing ' + (i+1) + ' / ' + ids.length;
      }
      var manifest = {version:1,exportedAt:new Date().toISOString(),order:'Grid order, left to right and top to bottom; posted tiles follow planned tiles.',imageCount:rows.length,previewCount:previews,images:rows};
      files.push({name:'manifest.json',blob:new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'})});
      var columns = ['position','id','filename','status','caption','plannedDate','width','height','source'];
      var csv = [columns.map(exportCSV).join(',')].concat(rows.map(function(row){ return columns.map(function(key){return exportCSV(row[key]);}).join(','); })).join('\r\n');
      files.push({name:'captions.csv',blob:new Blob(['\ufeff' + csv],{type:'text/csv;charset=utf-8'})});
      files.push({name:'README.txt',blob:new Blob(['The numbered JPEGs follow your grid from left to right, top to bottom.\nPosted reference tiles and blank spacers are included. Backlog photos are excluded.\nFor Instagram, publishing the planned images in reverse numbered order reproduces the grid. Posted reference tiles are already posted.\n\nmanifest.json records each file\'s actual dimensions and source.\noriginal-file: the available original JPEG, with its bytes preserved.\nsaved-image: a photo or blank stored in your layout, at its saved size.\nscreenshot-preview: a reference tile taken from your feed screenshot.\npreview-fallback / embedded-preview: an embedded preview; the original was unavailable.\n\nCaptions and dates are in manifest.json and captions.csv. Spreadsheet formula-like captions have a leading apostrophe in the CSV; the JSON contains the exact caption.\n'],{type:'text/plain'})});
      if (button) button.textContent = 'Creating ZIP…';
      await exportDownload(await exportZip(files), 'gridsmith-posts-' + new Date().toISOString().slice(0,10) + '.zip');
      toast('ZIP downloaded · ' + rows.length + ' images' + (previews ? ' · ' + previews + ' preview-size' : ''));
    } catch(e){ toast('Export failed. Your grid is unchanged; try again.'); }
    finally {
      exportBusy = false;
      if (button) { button.disabled = false; button.removeAttribute('aria-busy'); button.replaceChildren.apply(button,originalContent); }
    }
  }
  var exportButton = document.getElementById('exportposts');
  if (exportButton) exportButton.addEventListener('click',exportPosts);

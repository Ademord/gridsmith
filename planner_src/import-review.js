  // Import is staged in this dialog. The application's asset store and undo history
  // are touched only once, after all selected native-resolution crops are ready.
  var importReviewJob = null, importReviewSerial = 0;
  var importReviewDialog = document.createElement('dialog');
  importReviewDialog.id = 'import-review';
  importReviewDialog.className = 'panel-dialog import-review';
  importReviewDialog.setAttribute('aria-labelledby', 'import-review-title');
  importReviewDialog.innerHTML = '<header class="import-review-head"><div><h2 id="import-review-title">Review your import</h2><p>Choose the photos to add to your Library.</p></div><button type="button" class="import-close" aria-label="Cancel import">\u00d7</button></header>' +
    '<div class="import-review-scroll"><p class="import-progress" role="status" aria-live="polite"></p><div class="import-errors" role="alert" hidden></div><div class="import-files"></div></div>' +
    '<footer class="import-review-footer"><div class="import-selection"><span id="import-selected-count" role="status" aria-live="polite">0 selected</span><button type="button" data-import-select="all">Select all</button><button type="button" data-import-select="none">Select none</button></div><div class="import-actions"><button type="button" class="import-cancel">Cancel</button><button type="button" class="btn-primary import-confirm" disabled>Import 0 photos</button></div></footer>';
  document.body.appendChild(importReviewDialog);
  var importCropDialog=document.createElement('dialog');
  importCropDialog.id='import-crop-view';importCropDialog.className='panel-dialog import-crop-view';
  importCropDialog.setAttribute('aria-labelledby','import-crop-title');
  importCropDialog.innerHTML='<div class="panel-head"><h2 id="import-crop-title">View crop</h2><button type="button" aria-label="Close crop preview">\u00d7</button></div><div class="import-crop-image"><img alt=""></div><p class="import-crop-size"></p>';
  document.body.appendChild(importCropDialog);
  importCropDialog.querySelector('button').addEventListener('click',function(){importCropDialog.close();});
  importCropDialog.addEventListener('close',function(){if(!importCropDialog.open)importCropDialog.querySelector('img').removeAttribute('src');});
  function viewImportCrop(file,candidate,index){
    var box=candidate.box;
    importCropDialog.querySelector('h2').textContent=file.mode==='original'?'Original image':'Photo '+(index+1);
    var img=importCropDialog.querySelector('img');img.alt='Crop of '+file.name;
    img.src=importCrop(file.image,box,1600);
    importCropDialog.querySelector('.import-crop-size').textContent=(box[2]-box[0])+' \u00d7 '+(box[3]-box[1])+' pixels';
    openPanelModal(importCropDialog);
  }
  function importElement(tag, className, text){
    var node = document.createElement(tag); if(className)node.className=className;
    if(text !== undefined)node.textContent=text; return node;
  }
  function importLater(){ return new Promise(function(resolve){setTimeout(resolve,0);}); }
  function importAlive(job){return importReviewJob===job&&!job.cancelled;}
  function importCandidates(file){return file.mode==='original'?file.original:file.mode==='manual'?file.manual:file.detected;}
  function importCount(job){return job.files.reduce(function(n,file){return n+importCandidates(file).filter(function(c){return c.selected;}).length;},0);}
  function updateImportSelection(job){
    if(!importAlive(job))return;
    var count=importCount(job), total=job.files.reduce(function(n,file){return n+importCandidates(file).length;},0);
    importReviewDialog.querySelector('#import-selected-count').textContent=count+' of '+total+' selected';
    var confirm=importReviewDialog.querySelector('.import-confirm');
    confirm.textContent=job.committing?'Preparing photos\u2026':'Import '+count+(count===1?' photo':' photos');
    confirm.disabled=job.loading||job.committing||!count||job.files.some(function(file){return file.mode==='manual'&&file.pendingGrid;});
    importReviewDialog.querySelectorAll('[data-import-select]').forEach(function(button){button.disabled=job.loading||job.committing||!total;});
    importReviewDialog.querySelectorAll('.import-files input,.import-files select,.import-files button').forEach(function(control){control.disabled=job.committing;});
  }
  function showImportErrors(job){
    var errors=importReviewDialog.querySelector('.import-errors');errors.replaceChildren();errors.hidden=!job.errors.length;
    if(!job.errors.length)return;
    errors.appendChild(importElement('strong','',job.files.length?'Some files could not be added':'These files could not be opened'));
    var list=importElement('ul');job.errors.forEach(function(error){list.appendChild(importElement('li','',error));});errors.appendChild(list);
  }
  function importCrop(source,box,maxSide){
    var width=Math.max(1,box[2]-box[0]),height=Math.max(1,box[3]-box[1]);
    var scale=maxSide?Math.min(1,maxSide/Math.max(width,height)):1;
    var canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    var context=canvas.getContext('2d');if(!context)throw new Error('The browser could not prepare this photo.');
    context.drawImage(source,box[0],box[1],width,height,0,0,canvas.width,canvas.height);
    var result=canvas.toDataURL(maxSide?'image/jpeg':'image/png',.88);canvas.width=canvas.height=1;
    if(result==='data:,')throw new Error('The browser could not prepare this photo.');return result;
  }
  function makeImportCandidates(file,boxes){
    return boxes.map(function(box){return {box:box,selected:true,preview:null};});
  }
  function renderImportTiles(job,file){
    var list=file.node.querySelector('.import-tiles');list.replaceChildren();
    importCandidates(file).forEach(function(candidate,index){
      var card=importElement('div','import-tile'),label=importElement('label','import-tile-choice');
      var input=document.createElement('input');input.type='checkbox';input.checked=candidate.selected;
      input.setAttribute('aria-label',(file.mode==='original'?'Original image':'Photo '+(index+1))+' from '+file.name);
      input.addEventListener('change',function(){candidate.selected=input.checked;updateImportSelection(job);});
      var image=document.createElement('img');image.alt='';image.draggable=false;
      if(!candidate.preview)candidate.preview=importCrop(file.image,candidate.box,260);
      image.src=candidate.preview;
      var dimensions=(candidate.box[2]-candidate.box[0])+' \u00d7 '+(candidate.box[3]-candidate.box[1]);
      var caption=importElement('span','import-tile-caption');caption.appendChild(importElement('span','',file.mode==='original'?'Original':'Photo '+(index+1)));caption.appendChild(importElement('small','',dimensions));
      label.appendChild(input);label.appendChild(image);label.appendChild(caption);card.appendChild(label);
      var view=importElement('button','import-view-crop');view.type='button';view.title='View crop';view.setAttribute('aria-label','View '+(file.mode==='original'?'original image':'photo '+(index+1))+' crop');
      view.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M10 7v6m-3-3h6"/></svg>';
      view.addEventListener('click',function(){viewImportCrop(file,candidate,index);});card.appendChild(view);list.appendChild(card);
    });
    updateImportSelection(job);
  }
  function importGridBoxes(file,rows,columns,gutter){
    var width=(file.width-(columns-1)*gutter)/columns,height=(file.height-(rows-1)*gutter)/rows;
    if(width<Math.min(8,file.width)||height<Math.min(8,file.height))throw new Error('The gutter is too large for this grid. Use a smaller gap or fewer rows and columns.');
    var boxes=[];
    for(var row=0;row<rows;row++)for(var column=0;column<columns;column++){
      var x=Math.round(column*(width+gutter)),y=Math.round(row*(height+gutter));
      boxes.push([x,y,Math.round(column*(width+gutter)+width),Math.round(row*(height+gutter)+height)]);
    }
    return boxes;
  }
  function drawImportGrid(file,boxes){
    var canvas=file.node.querySelector('.import-grid-preview'),scale=Math.min(1,700/file.width,500/file.height);
    canvas.width=Math.max(1,Math.round(file.width*scale));canvas.height=Math.max(1,Math.round(file.height*scale));
    var context=canvas.getContext('2d');context.drawImage(file.image,0,0,canvas.width,canvas.height);
    context.lineWidth=3;context.strokeStyle='#000';boxes.forEach(function(box){context.strokeRect(box[0]*scale,box[1]*scale,(box[2]-box[0])*scale,(box[3]-box[1])*scale);});
    context.lineWidth=1;context.strokeStyle='#fff';boxes.forEach(function(box){context.strokeRect(box[0]*scale,box[1]*scale,(box[2]-box[0])*scale,(box[3]-box[1])*scale);});
    canvas.setAttribute('aria-label',boxes.length+' photo crops previewed over the original image');
  }
  function renderImportFile(job,file){
    var section=importElement('section','import-file');file.node=section;
    var head=importElement('div','import-file-head'),title=importElement('div');
    title.appendChild(importElement('h3','',file.name));
    var summary=file.detected.length>1?file.detected.length+' photo crops suggested \u00b7 Review each crop':'No reliable photo grid detected \u00b7 Original is selected';
    title.appendChild(importElement('p','',summary));head.appendChild(title);section.appendChild(head);
    if(file.unresolvedLayout)title.appendChild(importElement('p','import-layout-note','This layout could not be separated reliably. Keep Original as one photo, or import the separate photos. Manual grid only supports evenly spaced rows and columns.'));
    else if(file.irregularLayout)title.appendChild(importElement('p','import-layout-note','This layout has unequal crops or an incomplete row. Check the edges of every crop. Choose Original as one photo if any crop is wrong.'));
    if(file.partialLastRow||file.partialLastColumn)title.appendChild(importElement('p','import-partial-note','The screenshot cuts off the '+(file.partialLastRow&&file.partialLastColumn?'bottom row and right column':file.partialLastRow?'bottom row':'right column')+'. Deselect any incomplete photos you do not want.'));
    var modeLabel=importElement('label','import-mode','Import as');
    var mode=document.createElement('select');mode.setAttribute('aria-label','Import mode for '+file.name);
    [['detected','Detected photos ('+file.detected.length+')'],['original','Original as one photo'],['manual','Manual grid']].forEach(function(item){var option=document.createElement('option');option.value=item[0];option.textContent=item[1];mode.appendChild(option);});
    mode.value=file.mode;modeLabel.appendChild(mode);
    var fileTools=importElement('div','import-file-tools'),adjust=importElement('button','import-adjust-grid','Adjust grid');adjust.type='button';
    fileTools.appendChild(modeLabel);fileTools.appendChild(adjust);section.appendChild(fileTools);
    var manual=importElement('div','import-manual');manual.hidden=true;
    manual.innerHTML='<p>Manual grid makes equal-sized crops across the whole image. It cannot follow unequal tiles or remove an outer frame. Gutter is the gap between photos, in source pixels. For other layouts, choose Original as one photo or import the separate photos.</p><div class="import-grid-fields"><label>Rows<input class="import-rows" type="number" min="1" max="12" step="1" inputmode="numeric"></label><label>Columns<input class="import-columns" type="number" min="1" max="12" step="1" inputmode="numeric"></label><label>Gutter (px)<input class="import-gutter" type="number" min="0" max="500" step="1" inputmode="numeric" value="0"></label><button type="button" class="import-apply-grid">Apply grid</button></div><p class="import-grid-error" role="alert" hidden></p><canvas class="import-grid-preview" role="img"></canvas><p class="import-grid-note">The preview and photos below show the applied grid.</p>';
    manual.querySelector('.import-rows').value=file.rows;manual.querySelector('.import-columns').value=file.columns;
    section.appendChild(manual);section.appendChild(importElement('div','import-tiles'));
    mode.addEventListener('change',function(){
      file.mode=mode.value;manual.hidden=file.mode!=='manual';
      if(file.mode==='manual'&&!file.manual.length){file.manual=makeImportCandidates(file,importGridBoxes(file,file.rows,file.columns,0));drawImportGrid(file,file.manual.map(function(c){return c.box;}));}
      renderImportTiles(job,file);
    });
    adjust.addEventListener('click',function(){mode.value='manual';mode.dispatchEvent(new Event('change'));manual.querySelector('.import-rows').focus();});
    manual.querySelectorAll('input').forEach(function(input){input.addEventListener('input',function(){file.pendingGrid=true;manual.querySelector('.import-grid-note').textContent='Press Apply grid to update the preview and photos before importing.';updateImportSelection(job);});});
    manual.querySelector('.import-apply-grid').addEventListener('click',function(){
      var error=manual.querySelector('.import-grid-error');
      try{
        var rows=Number(manual.querySelector('.import-rows').value),columns=Number(manual.querySelector('.import-columns').value),gutter=Number(manual.querySelector('.import-gutter').value);
        if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||rows>12||columns<1||columns>12)throw new Error('Enter 1 to 12 rows and columns.');
        if(!Number.isInteger(gutter)||gutter<0||gutter>500)throw new Error('Enter a gutter from 0 to 500 pixels.');
        var boxes=importGridBoxes(file,rows,columns,gutter);file.manual=makeImportCandidates(file,boxes);file.rows=rows;file.columns=columns;file.pendingGrid=false;
        drawImportGrid(file,boxes);renderImportTiles(job,file);error.hidden=true;
        manual.querySelector('.import-grid-note').textContent=rows+' rows \u00d7 '+columns+' columns applied. Select the photos below.';
      }catch(problem){file.pendingGrid=true;error.textContent=problem.message;error.hidden=false;updateImportSelection(job);}
    });
    importReviewDialog.querySelector('.import-files').appendChild(section);renderImportTiles(job,file);
  }
  function cancelImportReview(){if(importReviewDialog.open)importReviewDialog.close();}
  importReviewDialog.querySelector('.import-close').addEventListener('click',cancelImportReview);
  importReviewDialog.querySelector('.import-cancel').addEventListener('click',cancelImportReview);
  function releaseImportReview(job){
    if(!job||importReviewJob!==job)return;job.cancelled=true;importReviewJob=null;importBusy=false;
    importReviewDialog.querySelector('.import-files').replaceChildren();
    job.files.forEach(function(file){file.image.src='';file.src='';file.node=null;});job.files=[];
    if(job.opener&&job.opener.isConnected)job.opener.focus({preventScroll:true});
  }
  importReviewDialog.querySelectorAll('[data-import-select]').forEach(function(button){button.addEventListener('click',function(){
    var job=importReviewJob;if(!job||job.loading||job.committing)return;
    var checked=button.dataset.importSelect==='all';
    job.files.forEach(function(file){importCandidates(file).forEach(function(candidate){candidate.selected=checked;});file.node.querySelectorAll('.import-tile input').forEach(function(input){input.checked=checked;});});
    updateImportSelection(job);
  });});
  importReviewDialog.querySelector('.import-confirm').addEventListener('click',function(){
    var job=importReviewJob;if(!job||job.loading||job.committing||!importCount(job)||job.files.some(function(file){return file.mode==='manual'&&file.pendingGrid;}))return;
    job.committing=true;updateImportSelection(job);
    var selected=[];job.files.forEach(function(file){importCandidates(file).forEach(function(candidate){if(candidate.selected)selected.push({file:file,candidate:candidate});});});
    var sources=[];
    selected.reduce(function(chain,item){return chain.then(importLater).then(function(){
      if(!importAlive(job))return;
      var box=item.candidate.box,file=item.file;
      var whole=box[0]===0&&box[1]===0&&box[2]===file.width&&box[3]===file.height;
      sources.push(whole&&/^data:image\/(jpeg|png|webp|gif|avif);base64,/i.test(file.src)?file.src:importCrop(file.image,box));
      importReviewDialog.querySelector('.import-progress').textContent='Preparing photo '+sources.length+' of '+selected.length+'\u2026';
    });},Promise.resolve()).then(function(){
      if(!importAlive(job))return;
      // One batch, one undo snapshot. No tile or asset existed before this point.
      dismissSplitChip();
      var commit=typeof commitImportedPhotos==='function'?commitImportedPhotos(sources,function(){return importAlive(job);}):Promise.resolve(addToBacklog(sources,false,true));
      return commit.then(function(ids){
        if(!importAlive(job))return;
        importReviewDialog.close();highlight(ids,true);
        if(db)toast('Added '+ids.length+(ids.length===1?' photo':' photos')+' to the Library');
      });
    }).catch(function(error){if(!importAlive(job))return;job.committing=false;job.errors.push(error.message||'Could not prepare those photos. Try fewer photos.');showImportErrors(job);updateImportSelection(job);});
  });
  var legacyProcessFiles=processFiles;
  processFiles=function(fileList,forceCollage){
    var files=Array.prototype.slice.call(fileList||[]);if(!files.length)return Promise.resolve();
    if(importReviewJob||importBusy){toast('Finish or cancel the current import first.');return Promise.resolve();}
    if(files.some(function(file){return file.type==='application/json'||/\.json$/i.test(file.name);}))return legacyProcessFiles(files,forceCollage);
    var job={id:++importReviewSerial,files:[],errors:[],loading:true,committing:false,cancelled:false,pixels:0,opener:document.activeElement};
    importReviewJob=job;importBusy=true;
    importReviewDialog.querySelector('.import-files').replaceChildren();importReviewDialog.querySelector('.import-errors').hidden=true;
    importReviewDialog.querySelector('.import-progress').textContent='Reading '+files.length+(files.length===1?' image\u2026':' images\u2026');
    updateImportSelection(job);openPanelModal(importReviewDialog);
    if(!importReviewDialog._importCloseInstalled){
      // Native close events are queued. Clear the staged job synchronously so a
      // second picker/drop cannot be rejected after the dialog has disappeared.
      var panelClose=importReviewDialog.close.bind(importReviewDialog);
      importReviewDialog.close=function(value){var closingJob=importReviewJob;panelClose(value);releaseImportReview(closingJob);};
      importReviewDialog._importCloseInstalled=true;
    }
    var totalBytes=files.reduce(function(n,file){return n+file.size;},0);
    if(files.length>20||totalBytes>100*1024*1024){job.loading=false;job.errors.push('Choose up to 20 images and 100 MB per import.');showImportErrors(job);importReviewDialog.querySelector('.import-progress').textContent='No images imported.';updateImportSelection(job);return Promise.resolve();}
    return files.reduce(function(chain,file,index){return chain.then(importLater).then(function(){
      if(!importAlive(job))return;
      importReviewDialog.querySelector('.import-progress').textContent='Reviewing image '+(index+1)+' of '+files.length+'\u2026';
      if(!/^image\/(jpeg|png|webp|gif|avif)$/i.test(file.type)&&! /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name))throw new Error(file.name+': use a JPG, PNG, WebP, GIF or AVIF image.');
      if(file.size>30*1024*1024)throw new Error(file.name+': larger than the 30 MB image limit.');
      return readFile(file,false).then(function(src){
        if(!importAlive(job))return;
        return new Promise(function(resolve,reject){
          var img=new Image();
          img.onerror=function(){reject(new Error(file.name+': this image could not be opened.'));};
          img.onload=function(){
            if(!importAlive(job)){img.src='';resolve();return;}
            try{
              var width=img.naturalWidth,height=img.naturalHeight;
              if(!width||!height||width*height>40000000)throw new Error(file.name+': exceeds the 40 megapixel image limit.');
              if(job.pixels+width*height>120000000)throw new Error(file.name+': this batch is too large. Import this image separately.');
              var det=detectRegions(img,!!forceCollage),sourceWidth=det.canvas.width,sourceHeight=det.canvas.height;
              var boxes=(Array.isArray(det.boxes)?det.boxes:[]).slice(0,144).filter(function(box){return Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[2]>box[0]&&box[3]>box[1];}).map(function(box){return [Math.max(0,Math.min(width-1,Math.round(box[0]*width/sourceWidth))),Math.max(0,Math.min(height-1,Math.round(box[1]*height/sourceHeight))),Math.max(1,Math.min(width,Math.round(box[2]*width/sourceWidth))),Math.max(1,Math.min(height,Math.round(box[3]*height/sourceHeight)))];}).filter(function(box){return box[2]>box[0]&&box[3]>box[1];});
              if(!boxes.length)boxes=[[0,0,width,height]];
              var columns=Number(det.columns)||Math.max(1,boxes.filter(function(box){return Math.abs(box[1]-boxes[0][1])<Math.max(5,height*.015);}).length),rows=Number(det.rows)||Math.ceil(boxes.length/columns);
              var staged={name:file.name,src:src,image:img,width:width,height:height,rows:Math.max(1,Math.min(12,Math.floor(height/8),boxes.length===1?3:Math.round(rows))),columns:Math.max(1,Math.min(12,Math.floor(width/8),boxes.length===1?3:Math.round(columns))),mode:boxes.length>1?'detected':'original',manual:[]};
              staged.detected=makeImportCandidates(staged,boxes);staged.original=makeImportCandidates(staged,[[0,0,width,height]]);
              staged.partialLastRow=!!det.partialLastRow;staged.partialLastColumn=!!det.partialLastColumn;
              staged.irregularLayout=!!det.irregularLayout;staged.unresolvedLayout=!!det.unresolvedLayout;
              job.files.push(staged);job.pixels+=width*height;renderImportFile(job,staged);resolve();
            }catch(error){reject(error);}
          };img.src=src;
        });
      });
    }).catch(function(error){if(importAlive(job))job.errors.push(error.message||file.name+': could not read this file.');});},Promise.resolve()).then(function(){
      if(!importAlive(job))return;job.loading=false;showImportErrors(job);
      importReviewDialog.querySelector('.import-progress').textContent=job.files.length?'Check the crops, then import your selection.':'No images imported. Cancel and choose another image.';
      updateImportSelection(job);
    });
  };

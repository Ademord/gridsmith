  // Feed checks are local, advisory image comparisons. They make no claim about faces or subjects.
  var checkFingerprintCache = new Map(), checksPanel = null, checkRun = 0;
  function computeCheckFingerprint(image){
    var canvas = document.createElement('canvas'); canvas.width = 9; canvas.height = 8;
    var cx = canvas.getContext('2d',{willReadFrequently:true}); cx.drawImage(image,0,0,9,8);
    var data = cx.getImageData(0,0,9,8).data, grey = [], sum = 0, square = 0, hash = '';
    for (var i=0;i<data.length;i+=4){ var g = .299*data[i] + .587*data[i+1] + .114*data[i+2]; grey.push(g); sum += g; square += g*g; }
    for (var y=0;y<8;y++) for (var x=0;x<8;x++) hash += grey[y*9+x] > grey[y*9+x+1] ? '1' : '0';
    canvas.width = 24; canvas.height = 24; cx.drawImage(image,0,0,24,24); data = cx.getImageData(0,0,24,24).data;
    var bins = new Array(12).fill(0), chromatic = 0, means = [0,0,0];
    for (var p=0;p<data.length;p+=4){
      var r=data[p]/255,gc=data[p+1]/255,b=data[p+2]/255;
      means[0]+=r; means[1]+=gc; means[2]+=b;
      var hi=Math.max(r,gc,b),lo=Math.min(r,gc,b),delta=hi-lo;
      if (hi<.12 || delta<.09 || delta/hi<.20) continue;
      var hue=hi===r?((gc-b)/delta)%6:hi===gc?(b-r)/delta+2:(r-gc)/delta+4;
      hue=(hue*60+360)%360; bins[Math.floor((hue+15)%360/30)]++; chromatic++;
    }
    var best=0; bins.forEach(function(n,i){if(n>bins[best])best=i;});
    var count=data.length/4, variance=Math.max(0,square/grey.length-Math.pow(sum/grey.length,2));
    return {hash:hash,variance:variance,color:means.map(function(n){return n/count;}),hue:chromatic/count >= .18 && bins[best]/Math.max(1,chromatic) >= .32 ? best*30 : null};
  }
  function getCheckFingerprint(id){
    var src = byId[id], cached = checkFingerprintCache.get(id);
    if (cached && cached.src === src) return cached.promise;
    var promise = new Promise(function(resolve){
      var img = new Image(), settled = false;
      var timer = setTimeout(function(){finish(null);},10000);
      function finish(value){ if(settled)return; settled=true; clearTimeout(timer); resolve(value); }
      img.onload=function(){try{finish(computeCheckFingerprint(img));}catch(e){finish(null);}};
      img.onerror=function(){finish(null);}; img.src=src;
    });
    checkFingerprintCache.set(id,{src:src,promise:promise}); return promise;
  }
  function collectFeedChecks(ids,fingerprints,cols,plannedCount){
    var findings = [], duplicatePairs = Object.create(null);
    function near(a,b){
      if (!a || !b || a.variance < 70 || b.variance < 70) return false;
      var difference=0; for(var i=0;i<64;i++) if(a.hash[i]!==b.hash[i])difference++;
      var color=Math.sqrt(a.color.reduce(function(n,c,i){return n+Math.pow(c-b.color[i],2);},0));
      return difference <= 6 && color < .3;
    }
    function pair(a,b){
      if (a>=plannedCount || b>=ids.length || a===b || !near(fingerprints[a],fingerprints[b])) return;
      var key=ids[a]+'|'+ids[b]; if(duplicatePairs[key])return; duplicatePairs[key]=true;
      findings.push({key:'duplicate-'+key,type:'duplicate',title:'Similar images next to each other',detail:'Positions '+(a+1)+' and '+(b+1)+'. Try a different crop or move one.',ids:[ids[a],ids[b]]});
    }
    var cells = Object.create(null), plannedRows = Math.ceil(plannedCount/cols);
    ids.forEach(function(id,index){ var cell = index<plannedCount ? index : plannedRows*cols+index-plannedCount; cells[cell]=index; });
    for(var i=0;i<plannedCount;i++){
      if(i%cols<cols-1 && Object.prototype.hasOwnProperty.call(cells,i+1)) pair(i,cells[i+1]);
      if(Object.prototype.hasOwnProperty.call(cells,i+cols)) pair(i,cells[i+cols]);
    }
    var hueNames=['red','orange','yellow','yellow-green','green','teal','cyan','blue','blue','violet','magenta','pink'];
    for(var start=0;start<ids.length;){
      var fp=fingerprints[start], hue=fp ? fp.hue : null, end=start+1;
      if(hue!==null) while(end<ids.length){
        var next=fingerprints[end], distance=next&&next.hue!==null?Math.abs(next.hue-hue):360;
        if(Math.min(distance,360-distance)>30 || distance===360)break; end++;
      }
      if(hue!==null && end-start>=3 && start<plannedCount){
        findings.push({key:'hue-'+ids.slice(start,end).join('|'),type:'hue',title:(end-start)+' posts with similar '+hueNames[Math.round(hue/30)%12]+' tones',detail:'Positions '+(start+1)+'\u2013'+end+'. Keep the run if it feels intentional.',ids:ids.slice(start,end)});
      }
      start=end;
    }
    return findings;
  }
  function showCheckTiles(ids){
    var idSet = new Set(ids), first=null;
    document.querySelectorAll('.tile[data-id]').forEach(function(node){
      if(!idSet.has(node.dataset.id))return;
      if(!first)first=node; node.classList.add('justadded');
      setTimeout(function(){node.classList.remove('justadded');},3000);
    });
    if(first){if(!first.hasAttribute('tabindex'))first.tabIndex=-1;}
    if(checksPanel){
      checksPanel.dialog._plannerReturnTarget=first;
      checksPanel.dialog.addEventListener('close',function(){requestAnimationFrame(function(){highlight(ids,true);if(first)first.focus({preventScroll:true});});},{once:true});
      checksPanel.dialog.close();
    }
  }
  function renderCheckFindings(findings,ids,failed){
    var body=checksPanel.body; body.replaceChildren();
    var summary=document.createElement('p'); summary.className='check-summary'; summary.setAttribute('role','status');
    summary.textContent=findings.length ? findings.length+' thing'+(findings.length===1?'':'s')+' to look at' : 'No close repeats or long color runs found.';
    var note=document.createElement('p'); note.className='check-note';
    note.textContent='Checks look at neighboring images and runs of color. Your choice comes first.';
    body.append(summary,note);
    if(failed){var failure=document.createElement('p');failure.className='check-note';failure.textContent=failed+' image'+(failed===1?' could':'s could')+' not be checked.';body.appendChild(failure);}
    var list=document.createElement('ul');list.className='check-list';list.setAttribute('aria-label','Feed check findings');
    findings.forEach(function(finding){
      var row=document.createElement('li');row.className='check-row';
      var action=document.createElement('button');action.type='button';action.className='check-finding';
      action.setAttribute('aria-label',finding.title+'. '+finding.detail+' Show posts.');
      var thumbs=document.createElement('span');thumbs.className='check-tiles';thumbs.setAttribute('aria-hidden','true');
      finding.ids.slice(0,3).forEach(function(id){var img=document.createElement('img');img.src=byId[id];img.alt='';thumbs.appendChild(img);});
      var text=document.createElement('span'),title=document.createElement('span'),detail=document.createElement('span');
      title.className='check-title';title.textContent=finding.title;detail.className='check-note';detail.textContent=finding.detail;
      text.append(title,detail);action.append(thumbs,text);action.addEventListener('click',function(){showCheckTiles(finding.ids);});
      var dismiss=document.createElement('button');dismiss.type='button';dismiss.className='check-dismiss';dismiss.textContent='\u00d7';dismiss.setAttribute('aria-label','Dismiss '+finding.title);
      dismiss.addEventListener('click',function(){
        var next=row.nextElementSibling || row.previousElementSibling;row.remove();
        var count=list.children.length; summary.textContent=count?count+' thing'+(count===1?'':'s')+' to look at':'All findings dismissed.';
        if(next)next.querySelector('button').focus();else checksPanel.close.focus();
      });row.append(action,dismiss);list.appendChild(row);
    });body.appendChild(list);
    var footer=document.createElement('div');footer.className='check-actions';
    var run=document.createElement('button');run.type='button';run.textContent='Check again';run.addEventListener('click',runFeedChecks);
    var scope=document.createElement('span');scope.className='check-note';scope.textContent=(ids.length-failed)+(failed?' / '+ids.length:'')+' images checked';footer.append(run,scope);body.appendChild(footer);
  }
  function runFeedChecks(){
    if(!checksPanel)checksPanel=plannerPanel('check','Check feed',document.getElementById('checkfeed'));
    if(!checksPanel.dialog.open)openPanelModal(checksPanel.dialog);
    var token=++checkRun;
    var planned=state.order.filter(function(id){return Object.prototype.hasOwnProperty.call(byId,id);});
    // Include one posted row to inspect the join between the plan and the existing feed.
    var ids=planned.concat(lockedIds.slice(0,state.cols)).filter(function(id){return Object.prototype.hasOwnProperty.call(byId,id);});
    var body=checksPanel.body;body.replaceChildren();
    var status=document.createElement('p');status.className='check-empty';status.setAttribute('role','status');
    status.textContent=planned.length?'Checking '+ids.length+' images\u2026':'Add a few images to the plan to check your feed.';body.appendChild(status);
    checksPanel.close.focus();
    if(!planned.length)return;
    // Decode four at a time so large libraries do not create a burst of image work.
    var results=new Array(ids.length), cursor=0, complete=0;
    function worker(){
      if(cursor>=ids.length)return Promise.resolve(); var at=cursor++;
      return getCheckFingerprint(ids[at]).then(function(fp){results[at]=fp;complete++;if(token===checkRun)status.textContent='Checking images\u2026 '+complete+' / '+ids.length;return worker();});
    }
    Promise.all([worker(),worker(),worker(),worker()]).then(function(){
      if(token!==checkRun)return;
      var current=state.order.filter(function(id){return Object.prototype.hasOwnProperty.call(byId,id);});
      if(current.join('|')!==planned.join('|')){runFeedChecks();return;}
      renderCheckFindings(collectFeedChecks(ids,results,state.cols,planned.length),ids,results.filter(function(fp){return !fp;}).length);
    }).catch(function(){if(token===checkRun)status.textContent='Could not finish the check. Close this panel and try again.';});
  }
  var checksTrigger=document.getElementById('checkfeed');
  if(checksTrigger){checksTrigger.setAttribute('aria-haspopup','dialog');checksTrigger.addEventListener('click',runFeedChecks);}

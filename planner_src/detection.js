  // Collage detector: analyse a bounded raster, keep the original for all crops.
  // Boxes use [left, top, right, bottom], with exclusive right/bottom coordinates.
  // Assignment deliberately replaces app.js's older declaration inside its IIFE.
  function gridAxisProfile(data, W, H, vertical){
    var length = vertical ? W : H, across = vertical ? H : W;
    var edge = new Float32Array(length), support = new Float32Array(length);
    var uniform = new Float32Array(length), score = new Float32Array(length), flat=new Float32Array(length), histogram=new Uint16Array(512);
    var meanR=new Float32Array(length),meanG=new Float32Array(length),meanB=new Float32Array(length),background=new Float32Array(length);
    var bgR=data[0],bgG=data[1],bgB=data[2];
    var samples = Math.min(320, across), stride = vertical ? 4 : W * 4;
    function delta(a,b){ return (Math.abs(data[a]-data[b])+Math.abs(data[a+1]-data[b+1])+Math.abs(data[a+2]-data[b+2]))/3; }
    for(var x=0;x<length;x++){
      var s=0,base=0,good=0,sr=0,sg=0,sb=0,qr=0,qg=0,qb=0,mode=0,bg=0;histogram.fill(0);
      for(var j=0;j<samples;j++){
        var y=Math.min(across-1,Math.floor((j+.5)*across/samples));
        var k=vertical ? (y*W+x)*4 : (x*W+y)*4;
        var r=data[k],g=data[k+1],b=data[k+2];
        if(Math.abs(r-bgR)+Math.abs(g-bgG)+Math.abs(b-bgB)<24)bg++;
        var bin=((r>>5)<<6)|((g>>5)<<3)|(b>>5);mode=Math.max(mode,++histogram[bin]);
        sr+=r;sg+=g;sb+=b;qr+=r*r;qg+=g*g;qb+=b*b;
        if(x<8||x>=length-8)continue;
        // A two-pixel edge survives resampling and JPEG ringing better than a
        // single adjacent-pixel derivative while retaining the seam position.
        var d=Math.max(delta(k-stride,k),delta(k-stride,k+stride)*.8);
        var local=(delta(k-5*stride,k-4*stride)+delta(k+3*stride,k+4*stride)+delta(k-8*stride,k-7*stride)+delta(k+6*stride,k+7*stride))/4;
        s+=d;base+=local;if(d>7&&d>local*2.2)good++;
      }
      var st=(Math.sqrt(Math.max(0,qr/samples-Math.pow(sr/samples,2)))+Math.sqrt(Math.max(0,qg/samples-Math.pow(sg/samples,2)))+Math.sqrt(Math.max(0,qb/samples-Math.pow(sb/samples,2))))/3;
      uniform[x]=st;
      flat[x]=mode/samples;
      meanR[x]=sr/samples;meanG[x]=sg/samples;meanB[x]=sb/samples;background[x]=bg/samples;
      edge[x]=s/samples; support[x]=good/samples;
      score[x]=Math.min(1,edge[x]/24)*Math.min(1,(edge[x]/(base/samples+3))/3)*support[x];
    }
    return {length:length,edge:edge,support:support,uniform:uniform,flat:flat,score:score,meanR:meanR,meanG:meanG,meanB:meanB,background:background,data:data,W:W,H:H,vertical:vertical};
  }
  function gridSeamBand(p,pos){
    var at=pos,minimum=p.uniform[pos];
    for(var d=-3;d<=3;d++)if(p.uniform[pos+d]<minimum){minimum=p.uniform[pos+d];at=pos+d;}
    if(minimum>12)return [pos,pos];
    var threshold=Math.max(8,minimum+3),left=at,right=at+1,limit=Math.round(p.length*.09);
    function sameColor(x){return Math.abs(p.meanR[x]-p.meanR[at])+Math.abs(p.meanG[x]-p.meanG[at])+Math.abs(p.meanB[x]-p.meanB[at])<Math.max(7,minimum*1.5);}
    while(left>0&&at-left<limit&&p.uniform[left-1]<threshold&&sameColor(left-1))left--;
    while(right<p.length&&right-at<limit&&p.uniform[right]<threshold&&sameColor(right))right++;
    if(left===0||right===p.length||right-left>=limit)return [pos,pos];
    return [left,right];
  }
  function gridSeamContinuity(p,band){
    var data=p.data,W=p.W,H=p.H,vertical=p.vertical,across=vertical?H:W;
    var left=Math.max(0,band[0]-3),right=Math.min(p.length-1,band[1]+2);
    var span=Math.max(8,right-left),outerLeft=Math.max(0,left-span),outerRight=Math.min(p.length-1,right+span);
    var good=0,total=0,base=0,samples=Math.min(256,across),used=0,s1=[0,0,0],s2=[0,0,0],q1=[0,0,0],q2=[0,0,0],product=[0,0,0];
    function at(x,y){return (vertical?y*W+x:x*W+y)*4;}
    function delta(a,b){return (Math.abs(data[a]-data[b])+Math.abs(data[a+1]-data[b+1])+Math.abs(data[a+2]-data[b+2]))/3;}
    for(var j=0;j<samples;j++){
      var y=Math.min(across-1,Math.floor((j+.5)*across/samples));
      var a=at(left,y),z=at(right,y),d=delta(a,z),b=(delta(at(outerLeft,y),a)+delta(z,at(outerRight,y)))/2;
      // Perpendicular gutters contain the same background on both sides and
      // must not make independent photographs appear correlated.
      if(band[1]>band[0]&&d<5&&b<5&&delta(a,at(Math.floor((band[0]+band[1])/2),y))<5)continue;
      used++;
      for(var c=0;c<3;c++){var v1=data[a+c],v2=data[z+c];s1[c]+=v1;s2[c]+=v2;q1[c]+=v1*v1;q2[c]+=v2*v2;product[c]+=v1*v2;}
      if(d>14&&d>b*1.6)good++;total+=d;base+=b;
    }
    if(!used)return {support:0,ratio:0,correlation:0};
    var correlation=0;
    for(var c=0;c<3;c++){
      var variance1=q1[c]-s1[c]*s1[c]/used,variance2=q2[c]-s2[c]*s2[c]/used;
      correlation+=(product[c]-s1[c]*s2[c]/used)/Math.max(1,Math.sqrt(Math.max(0,variance1*variance2)));
    }
    return {support:good/used,ratio:total/(base+used*3),correlation:correlation/3};
  }
  function gridAxisCandidates(p){
    var peaks=[];
    for(var x=10;x<p.length-10;x++){
      if(p.score[x]<.16)continue;
      var best=true;
      for(var d=-3;d<=3;d++)if(d&&p.score[x+d]>p.score[x]){best=false;break;}
      if(best){
        var last=peaks[peaks.length-1];
        if(last&&x-last.pos<=5){if(p.score[x]>last.score)peaks[peaks.length-1]={pos:x,score:p.score[x],support:p.support[x],edge:p.edge[x]};}
        else peaks.push({pos:x,score:p.score[x],support:p.support[x],edge:p.edge[x]});
      }
    }
    peaks.forEach(function(peak){peak.band=gridSeamBand(p,peak.pos);peak.continuity=gridSeamContinuity(p,peak.band);});
    return peaks;
  }
  function gridAxisFits(p){
    var peaks=gridAxisCandidates(p),fits=[];
    for(var n=2;n<=Math.min(12,Math.floor(p.length/36));n++){
      var step=p.length/n,cuts=[],total=0,least=1,coverage=0,error=0,continuity=0,correlation=0,bands=[];
      for(var i=1;i<n;i++){
        var target=step*i,best=null,value=-1;
        for(var k=0;k<peaks.length;k++){
          var distance=Math.abs(peaks[k].pos-target);
          if(distance>step*.18)continue;
          var merit=peaks[k].score*(1-.25*distance/(step*.18));
          if(merit>value){best=peaks[k];value=merit;}
        }
        if(!best){cuts=[];break;}
        cuts.push(best.pos);bands.push(best.band);continuity+=best.continuity.support;correlation+=best.continuity.correlation;total+=best.score;least=Math.min(least,best.score);coverage+=best.support;error+=Math.abs(best.pos-target)/step;
      }
      if(cuts.length!==n-1)continue;
      fits.push({count:n,cuts:cuts,bands:bands,continuity:continuity/(n-1),correlation:correlation/(n-1),score:total/(n-1),least:least,support:coverage/(n-1),error:error/(n-1)});
    }
    // Screenshots can end part-way through a final row. Recover a repeated
    // sequence from its internal spacing instead of demanding equal end margins.
    var strong=peaks.filter(function(peak){return peak.score>.52;});
    // Two sides of a wide gutter describe one seam.
    strong=strong.filter(function(peak,i){return !i||peak.band[0]>strong[i-1].band[1]+3;});
    if(strong.length>=2&&strong.length<12){
      var lengths=[strong[0].band[0]],sum=0,min=1,cont=0,corr=0,sup=0;
      for(var j=1;j<strong.length;j++)lengths.push(strong[j].band[0]-strong[j-1].band[1]);
      var sorted=lengths.slice().sort(function(a,b){return a-b;}),step=sorted[Math.floor(sorted.length/2)],tail=p.length-strong[strong.length-1].band[1];
      var err=lengths.reduce(function(s,l){return s+Math.abs(l-step)/step;},0)/lengths.length;
      if(step>=36&&lengths.every(function(l){return l>step*.78&&l<step*1.22;})&&tail>step*.28&&tail<step*1.22){
        strong.forEach(function(peak){sum+=peak.score;min=Math.min(min,peak.score);cont+=peak.continuity.support;corr+=peak.continuity.correlation;sup+=peak.support;});
        fits.push({count:strong.length+1,cuts:strong.map(function(p){return p.pos;}),bands:strong.map(function(p){return p.band;}),continuity:cont/strong.length,correlation:corr/strong.length,score:sum/strong.length,least:min,support:sup/strong.length,error:err,partialLast:tail<step*.78});
      }
    }
    fits.sort(function(a,b){return (b.score+.06*Math.log(b.count)-b.error*.2)-(a.score+.06*Math.log(a.count)-a.error*.2);});
    return fits;
  }
  function gridOuterSpan(p){
    var left=0,right=p.length,limit=Math.floor(p.length*.4);
    var framedStart=p.background[0]>.98,framedEnd=p.background[p.length-1]>.98;
    while(left<limit&&(p.uniform[left]<9||p.flat[left]>.91||(framedStart&&p.background[left]>.68)))left++;
    while(right>p.length-limit&&(p.uniform[right-1]<9||p.flat[right-1]>.91||(framedEnd&&p.background[right-1]>.68)))right--;
    // A huge flat area can be part of a photograph; only bounded outer strips
    // qualify as a frame, and a rejected grid still returns the complete image.
    if(left===limit)left=0;if(right===p.length-limit)right=p.length;
    return [left,right];
  }
  function gridCropBand(p,band,pos,cellSize){
    if(band[1]>band[0]){
      // A compressed gutter may contain several nearby background shades.
      // Finish a short low-variance fringe at a clear photo edge, while keeping
      // the colour guard from consuming a flat region inside the photograph.
      var fringe=Math.max(1,Math.floor(cellSize*.02)),threshold=Math.max(8,p.uniform[band[0]]+3);
      var left=band[0],right=band[1],candidate=left;
      while(candidate>0&&left-candidate<=fringe&&p.uniform[candidate-1]<threshold)candidate--;
      if(left-candidate<=fringe&&candidate>0&&p.uniform[candidate-1]>=threshold*2)left=candidate;
      candidate=right;
      while(candidate<p.length&&candidate-right<=fringe&&p.uniform[candidate]<threshold)candidate++;
      if(candidate-right<=fringe&&candidate<p.length&&p.uniform[candidate]>=threshold*2)right=candidate;
      return [left,right];
    }
    // Antialiased, translucent or compressed rules are not uniformly coloured.
    // Exclude their narrow transition rather than leaving a grey sliver in a
    // crop. This can trim at most three analysis pixels from either photo.
    var left=pos,right=pos,threshold=Math.max(.2,p.score[pos]*.45);
    while(left>pos-2&&left>0&&p.score[left-1]>=threshold)left--;
    while(right<pos+2&&right<p.length&&p.score[right]>=threshold)right++;
    return [left,right];
  }
  detectRegions = function(img, forceCollage){
    var W=img.naturalWidth||img.width,H=img.naturalHeight||img.height;
    var canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    canvas.getContext('2d').drawImage(img,0,0,W,H);
    function single(){return {canvas:canvas,boxes:[[0,0,W,H]],rows:1,columns:1,confidence:0,method:'single'};}
    var scale=Math.min(1,1800/Math.max(W,H)),w=Math.max(1,Math.round(W*scale)),h=Math.max(1,Math.round(H*scale));
    var analysis=canvas;
    if(scale<1){analysis=document.createElement('canvas');analysis.width=w;analysis.height=h;analysis.getContext('2d').drawImage(canvas,0,0,w,h);}
    var data;try{data=analysis.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;}catch(e){return single();}
    var aw=w,ah=h,offsetX=0,offsetY=0;
    var xp=gridAxisProfile(data,w,h,true),yp=gridAxisProfile(data,w,h,false);
    var outerX=gridOuterSpan(xp),outerY=gridOuterSpan(yp);
    if(outerX[0]||outerY[0]||outerX[1]<w||outerY[1]<h){
      offsetX=outerX[0];offsetY=outerY[0];w=outerX[1]-offsetX;h=outerY[1]-offsetY;
      data=analysis.getContext('2d',{willReadFrequently:true}).getImageData(offsetX,offsetY,w,h).data;
      xp=gridAxisProfile(data,w,h,true);yp=gridAxisProfile(data,w,h,false);
    }
    var xf=gridAxisFits(xp),yf=gridAxisFits(yp),best=null;
    function quality(fit){return fit.count>=4?(fit.score*(fit.count-1)-fit.least)/(fit.count-2):fit.score;}
    function minimumEvidence(fit){
      // A dense, accurately aligned grid can have one nearly invisible seam
      // after thumbnail resampling. Require both independent image content and
      // strong remaining seams before accepting that weak boundary.
      if(fit.count>=4&&fit.error<.05&&fit.correlation<.4&&fit.support>.5&&quality(fit)>.55)return .15;
      return fit.count>=4&&fit.score>.7?.2:.28;
    }
    xf.forEach(function(x){yf.forEach(function(y){
      // One seam may be weak where neighbouring photos have matching dark
      // backgrounds. A dense lattice can corroborate it with the other seams.
      if(x.least<minimumEvidence(x)||y.least<minimumEvidence(y)||x.score<.38||y.score<.38)return;
      if((x.continuity<.30&&x.correlation>.45)||(y.continuity<.30&&y.correlation>.45))return;
      var value=(quality(x)+quality(y))/2+.06*Math.log(x.count*y.count)-.2*(x.error+y.error);
      if(!best||value>best.value)best={x:x,y:y,value:value};
    });});
    if(!best){
      var one={count:1,cuts:[],bands:[],score:1,continuity:1,correlation:0,error:0};
      [xf,yf].forEach(function(fits,axis){fits.forEach(function(fit){
        if(fit.count<(forceCollage?2:3)||fit.least<.42||fit.score<.6)return;
        if(fit.continuity<.36&&fit.correlation>.4)return;
        var value=fit.score+.06*Math.log(fit.count)-.2*fit.error;
        if(!best||value>best.value)best={x:axis===0?fit:one,y:axis===1?fit:one,value:value};
      });});
    }
    if(!best)return single();
    var xs=[[0,0]].concat(best.x.bands.map(function(b,i){return gridCropBand(xp,b,best.x.cuts[i],w/best.x.count);})).concat([[w,w]]);
    var ys=[[0,0]].concat(best.y.bands.map(function(b,i){return gridCropBand(yp,b,best.y.cuts[i],h/best.y.count);})).concat([[h,h]]),boxes=[];
    for(var row=0;row<ys.length-1;row++)for(var col=0;col<xs.length-1;col++){
      boxes.push([Math.round((offsetX+xs[col][1])*W/aw),Math.round((offsetY+ys[row][1])*H/ah),Math.round((offsetX+xs[col+1][0])*W/aw),Math.round((offsetY+ys[row+1][0])*H/ah)]);
    }
    return {canvas:canvas,boxes:boxes,rows:best.y.count,columns:best.x.count,confidence:Math.min(.99,(best.x.score+best.y.score)/2),method:'grid-seams',partialLastRow:!!best.y.partialLast,partialLastColumn:!!best.x.partialLast};
  };

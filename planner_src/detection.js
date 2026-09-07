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
      var y=p.acrossStart===undefined?Math.min(across-1,Math.floor((j+.5)*across/samples)):Math.min(p.acrossEnd-1,Math.floor(p.acrossStart+(j+.5)*(p.acrossEnd-p.acrossStart)/samples));
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
  function gridGutterRegions(data,W,H,xp,yp,forceCollage){
    // A consistent flat gutter can separate unequal rectangles and different
    // numbers of photos in each row. Do not extrapolate a regular lattice into
    // the empty end of a row. This deliberately excludes overlapping/freeform
    // mosaics and textured gutters; those still need review or the original.
    var colors=[];
    [xp,yp].forEach(function(p){
      for(var x=0;x<p.length-1;x++){
        if(p.uniform[x]>2||p.uniform[x+1]>2)continue;
        var color=[p.meanR[x],p.meanG[x],p.meanB[x]],known=colors.find(function(c){return Math.abs(c.rgb[0]-color[0])+Math.abs(c.rgb[1]-color[1])+Math.abs(c.rgb[2]-color[2])<8;});
        if(known)known.weight++;else colors.push({rgb:color,weight:1});
      }
    });
    colors.sort(function(a,b){return b.weight-a.weight;});
    for(var candidate=0;candidate<Math.min(3,colors.length);candidate++){
      var rgb=colors[candidate].rgb,stride=W+1,integral=new Uint32Array((W+1)*(H+1));
      for(var y=0;y<H;y++){
        var sum=0;
        for(var x=0;x<W;x++){
          var at=(y*W+x)*4;
          if(Math.abs(data[at]-rgb[0])+Math.abs(data[at+1]-rgb[1])+Math.abs(data[at+2]-rgb[2])<18)sum++;
          integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;
        }
      }
      function area(l,t,r,b){return integral[b*stride+r]-integral[t*stride+r]-integral[b*stride+l]+integral[t*stride+l];}
      function blank(l,t,r,b){return area(l,t,r,b)>=(r-l)*(b-t)*.998;}
      var leaves=[],splits=0,axes=[0,0],invalid=false;
      function divide(l,t,r,b,depth){
        if(invalid)return;
        if(depth>24||leaves.length>=144){invalid=true;return;}
        while(l<r&&blank(l,t,l+1,b))l++;
        while(r>l&&blank(r-1,t,r,b))r--;
        while(t<b&&blank(l,t,r,t+1))t++;
        while(b>t&&blank(l,b-1,r,b))b--;
        if(l===r||t===b)return;
        // Prefer full row gaps, then look for column gaps within each row.
        for(var axis=1;axis>=0;axis--){
          var start=axis?t:l,end=axis?b:r,bands=[];
          for(var pos=start+1;pos<end-1;pos++){
            if(!(axis?blank(l,pos,r,pos+1):blank(pos,t,pos+1,b)))continue;
            var first=pos;
            while(pos<end&&(axis?blank(l,pos,r,pos+1):blank(pos,t,pos+1,b)))pos++;
            if(pos-first>=2)bands.push([first,pos]);
          }
          if(!bands.length)continue;
          var p={data:data,W:W,H:H,vertical:!axis,length:axis?H:W,acrossStart:axis?l:t,acrossEnd:axis?r:b};
          // A rule drawn across one continuous photo is weak evidence of a
          // collage. Reject highly correlated content on its two sides.
          if(bands.some(function(band){var c=gridSeamContinuity(p,band);return c.correlation>.8&&c.support<.3;})){invalid=true;return;}
          splits+=bands.length;axes[axis]+=bands.length;
          var from=start;
          bands.concat([[end,end]]).forEach(function(band){if(axis)divide(l,from,r,band[0],depth+1);else divide(from,t,band[0],b,depth+1);from=band[1];});
          return;
        }
        var width=r-l,height=b-t;
        // Every outer edge must belong predominantly to photo content. An
        // L-shaped remainder or overlapping mosaic is not a rectangular crop.
        if(width<24||height<24||area(l,t,r,b)>width*height*.35||area(l,t,r,t+1)>width*.12||area(l,b-1,r,b)>width*.12||area(l,t,l+1,b)>height*.12||area(r-1,t,r,b)>height*.12){invalid=true;return;}
        leaves.push([l,t,r,b]);
      }
      divide(0,0,W,H,0);
      if(splits&&invalid)return {unresolved:true};
      if(!invalid&&leaves.length>=(forceCollage?2:3)&&(axes[0]&&axes[1]||splits>=2)){
        leaves.sort(function(a,b){return a[1]-b[1]||a[0]-b[0];});
        var tops=[];leaves.forEach(function(box){if(tops.indexOf(box[1])<0)tops.push(box[1]);});
        var columns=Math.max.apply(null,tops.map(function(top){return leaves.filter(function(box){return box[1]===top;}).length;}));
        var rowBoxes=tops.map(function(top){return leaves.filter(function(box){return box[1]===top;});});
        // Two matching complete rows establish an expected height. A shorter
        // aligned final row is disclosed as partial, while its exact bounds stay.
        var reference=rowBoxes[0],expectedHeight=reference[0][3]-reference[0][1];
        function aligned(row){return row.length===reference.length&&row.every(function(box,i){return Math.abs(box[0]-reference[i][0])<=2&&Math.abs(box[2]-reference[i][2])<=2;});}
        var partialLast=tops.length>=3&&rowBoxes.slice(0,-1).every(function(row){return aligned(row)&&row.every(function(box){return Math.abs(box[3]-box[1]-expectedHeight)<=2;});})&&aligned(rowBoxes[rowBoxes.length-1])&&rowBoxes[rowBoxes.length-1].every(function(box){return box[3]-box[1]<expectedHeight-2;});
        return {boxes:leaves,rows:tops.length,columns:columns,partialLastRow:partialLast,irregular:leaves.length!==tops.length*columns||leaves.some(function(box){return box[2]-box[0]!==leaves[0][2]-leaves[0][0]||box[3]-box[1]!==leaves[0][3]-leaves[0][1];})};
      }
    }
    return null;
  }
  detectRegions = function(img, forceCollage){
    var W=img.naturalWidth||img.width,H=img.naturalHeight||img.height;
    var canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    canvas.getContext('2d').drawImage(img,0,0,W,H);
    function single(unresolved){return {canvas:canvas,boxes:[[0,0,W,H]],rows:1,columns:1,confidence:0,method:'single',unresolvedLayout:!!unresolved};}
    var scale=Math.min(1,1800/Math.max(W,H)),w=Math.max(1,Math.round(W*scale)),h=Math.max(1,Math.round(H*scale));
    var analysis=canvas;
    if(scale<1){analysis=document.createElement('canvas');analysis.width=w;analysis.height=h;analysis.getContext('2d').drawImage(canvas,0,0,w,h);}
    var data;try{data=analysis.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;}catch(e){return single();}
    var aw=w,ah=h,offsetX=0,offsetY=0;
    var xp=gridAxisProfile(data,w,h,true),yp=gridAxisProfile(data,w,h,false);
    // Remove independently detected screenshot framing before looking for
    // photo gutters. Header icons can otherwise look like malformed crops.
    var outerX=gridOuterSpan(xp),outerY=gridOuterSpan(yp);
    if(outerX[0]||outerY[0]||outerX[1]<w||outerY[1]<h){
      offsetX=outerX[0];offsetY=outerY[0];w=outerX[1]-offsetX;h=outerY[1]-offsetY;
      data=analysis.getContext('2d',{willReadFrequently:true}).getImageData(offsetX,offsetY,w,h).data;
      xp=gridAxisProfile(data,w,h,true);yp=gridAxisProfile(data,w,h,false);
    }
    var gutters=gridGutterRegions(data,w,h,xp,yp,forceCollage);
    if(gutters){
      if(gutters.unresolved)return single(true);
      return {canvas:canvas,boxes:gutters.boxes.map(function(box){return [Math.round((offsetX+box[0])*W/aw),Math.round((offsetY+box[1])*H/ah),Math.round((offsetX+box[2])*W/aw),Math.round((offsetY+box[3])*H/ah)];}),rows:gutters.rows,columns:gutters.columns,confidence:.9,method:'uniform-gutters',irregularLayout:gutters.irregular,partialLastRow:!!gutters.partialLastRow};
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
        // One strong horizon is also common in a single photograph. Two-photo
        // proposals need a visible gutter; ambiguous adjacent pairs stay whole.
        if(fit.count===2&&fit.bands.some(function(band){return band[1]-band[0]<2;}))return;
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

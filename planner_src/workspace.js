
  // Workspace shell. All durable content continues through the original state model.
  function setPreview(active){
    document.body.classList.toggle('preview-mode',active);
    document.getElementById('planview').classList.toggle('on',!active);
    document.getElementById('feedpreview').classList.toggle('on',active);
    document.getElementById('planview').setAttribute('aria-pressed',String(!active));
    document.getElementById('feedpreview').setAttribute('aria-pressed',String(active));
    document.getElementById('grid-context').textContent=active?'Profile preview':'Planned posts';
    setSelectionMode(false);
  }
  document.getElementById('feedpreview').addEventListener('click',function(){setPreview(true);});
  document.getElementById('planview').addEventListener('click',function(){setPreview(false);});
  document.getElementById('plan-nav').addEventListener('click',function(){setPreview(false);window.scrollTo({top:0,behavior:'smooth'});});
  ['library-add','library-upload'].forEach(function(id){document.getElementById(id).addEventListener('click',function(){document.getElementById('fileinput').click();});});
  document.getElementById('backtotop').addEventListener('click',function(){window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
  var helpDialog=document.getElementById('help-dialog');
  document.getElementById('helpbutton').addEventListener('click',function(){openPanelModal(helpDialog);});
  helpDialog.querySelector('.dialog-close').addEventListener('click',function(){helpDialog.close();});
  helpDialog.addEventListener('click',function(ev){if(ev.target===helpDialog){var r=helpDialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)helpDialog.close();}});
  document.querySelector('.more-menu').addEventListener('click',function(ev){if(ev.target.closest('button'))this.open=false;});
  document.addEventListener('click',function(ev){var menu=document.querySelector('.more-menu');if(!menu.contains(ev.target))menu.open=false;});
  var previousLibraryQuery="";
  function filterLibrary(){
    var q=document.getElementById('library-search').value.trim().toLowerCase(),visible=0;
    if(!q&&!previousLibraryQuery)return;previousLibraryQuery=q;
    Array.prototype.forEach.call(document.querySelectorAll('#railitems .bitem'),function(n){
      var id=n.dataset.id,m=state.meta[id]||{};
      n.hidden=!!q&&(id+' '+(m.c||'')+' '+(m.d||'')).toLowerCase().indexOf(q)<0;
      if(!n.hidden)visible++;
    });
    document.getElementById('library-no-results').hidden=!q||!!visible;
  }
  document.getElementById('library-search').addEventListener('input',filterLibrary);
  var workspaceRender=render;
  render=function(){
    workspaceRender();filterLibrary();
    document.querySelectorAll('#colsw button').forEach(function(b){b.setAttribute('aria-pressed',String(+b.dataset.c===state.cols));});

  };

  function prepareThumbnails(){document.querySelectorAll('.tile img:not([loading]),.bitem img:not([loading])').forEach(function(img){img.loading='lazy';img.decoding='async';});}
  var thumbObserver=new MutationObserver(prepareThumbnails);thumbObserver.observe(grid,{childList:true});thumbObserver.observe(document.getElementById('railitems'),{childList:true});

  function setSelectionMode(on){
    document.body.classList.toggle('select-mode',on);
    document.getElementById('selectposts').textContent=on?'Done':'Select';
    document.getElementById('selectposts').setAttribute('aria-pressed',String(on));
    if(!on)clearSelection();
  }
  document.getElementById('selectposts').addEventListener('click',function(){setSelectionMode(!document.body.classList.contains('select-mode'));});
  [grid,railitems].forEach(function(surface){surface.addEventListener('click',function(ev){
    if(!document.body.classList.contains('select-mode')||ev.target.closest('button'))return;
    var node=ev.target.closest('.tile,.bitem');
    if(!node||node.classList.contains('locked'))return;
    ev.preventDefault();ev.stopImmediatePropagation();toggleSelect(node.dataset.id);
  },true);});
  window.addEventListener('keydown',function(ev){
    if(ev.defaultPrevented||ev.target.closest('dialog,[role="dialog"],.lightbox'))return;
    if(ev.key==='Escape')setSelectionMode(false);
  });

  var compactLibrary=matchMedia('(max-width:760px) and (max-height:650px)'), libraryPreference=null;
  try{libraryPreference=localStorage.getItem('gridsmith.libraryCollapsed');}catch(e){}
  var libraryCollapsed=libraryPreference===null?compactLibrary.matches:libraryPreference==='true';
  compactLibrary.addEventListener('change',function(){if(libraryPreference===null){libraryCollapsed=compactLibrary.matches;applyLibraryCollapse();}});
  function applyLibraryCollapse(){
    document.body.classList.toggle('library-collapsed',libraryCollapsed);
    var button=document.getElementById('library-collapse');
    button.setAttribute('aria-expanded',String(!libraryCollapsed));
    button.setAttribute('aria-label',libraryCollapsed?'Expand library':'Collapse library');
    button.title=libraryCollapsed?'Expand library':'Collapse library';
    button.textContent=libraryCollapsed?'\u2303':'\u2304';
  }
  document.getElementById('library-collapse').addEventListener('click',function(){libraryCollapsed=!libraryCollapsed;libraryPreference=String(libraryCollapsed);applyLibraryCollapse();try{localStorage.setItem('gridsmith.libraryCollapsed',String(libraryCollapsed));}catch(e){}});
  applyLibraryCollapse();

  function openPanelModal(dialog){
    if(dialog.open)return;
    if(!dialog._plannerClose){
      dialog._plannerClose=dialog.close.bind(dialog);
      dialog.close=function(value){if(dialog._unlockScroll)dialog._unlockScroll();dialog._plannerClose(value);};
      dialog.addEventListener('cancel',function(ev){ev.preventDefault();dialog.close();});
      dialog.addEventListener('close',function(){if(!dialog.open&&dialog._unlockScroll)dialog._unlockScroll();});
    }
    var y=window.scrollY,x=window.scrollX,style=document.body.getAttribute('style');
    dialog._unlockScroll=function(){
      dialog._unlockScroll=null;
      if(style===null)document.body.removeAttribute('style');else document.body.setAttribute('style',style);
      window.scrollTo(x,y);
    };
    document.body.style.position='fixed';document.body.style.top=-y+'px';document.body.style.left=-x+'px';document.body.style.width='100%';document.body.style.overflow='hidden';
    dialog.showModal();
  }
  document.getElementById('importcollage').addEventListener('click',function(){
    var input=document.getElementById('collageinput');input.click();
  });
  document.getElementById('collageinput').addEventListener('change',function(){processFiles(this.files,true);this.value='';});

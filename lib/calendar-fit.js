export function fitCalendar(ui,root){
 ui.calendarFitCleanup?.();root.dataset.view=ui.calendarView;
 const doc=root.ownerDocument,win=doc.defaultView;if(!win)return;
 const fit=()=>{
  // Native pinch zoom must magnify the layout, not trigger a compensating resize.
  if(win.visualViewport?.scale>1.05)return;
  const grid=root.querySelector('.hourGrid');if(!grid||root.hidden)return;
  const top=grid.getBoundingClientRect().top;
  const head=grid.querySelector('.hourHead')?.getBoundingClientRect().height||40;
  const available=(win.visualViewport?.height||win.innerHeight)-Math.max(0,top)-head-24;
  grid.style.setProperty('--calendar-height',Math.max(180,available)+'px');
 };
 root.querySelector('.calendarDisplayTools')?.remove();
 const bar=doc.createElement('div');bar.className='calendarDisplayTools';
 const toggle=doc.createElement('button');toggle.type='button';toggle.id='expandCalendar';
 const update=()=>{
  doc.body.classList.toggle('calendarExpanded',!!ui.calendarExpanded);
  toggle.textContent=ui.calendarExpanded?'Réduire le planning':'Agrandir le planning';
  toggle.setAttribute('aria-pressed',String(!!ui.calendarExpanded));
  fit();
 };
 toggle.onclick=()=>{ui.calendarExpanded=!ui.calendarExpanded;update();toggle.focus();};bar.append(toggle);
 // Keep creation available while the settings panels are hidden.
 for(const [id,label] of [['planEvent','+ Planifier'],['newPrivateEvent','+ Rendez-vous privé']]){
  const original=root.querySelector('#'+id);if(!original)continue;
  const button=doc.createElement('button');button.type='button';button.className='calendarExpandedAction';
  button.textContent=label;button.disabled=original.disabled;button.onclick=()=>original.click();bar.append(button);
 }
 root.prepend(bar);update();
 const escape=e=>{if(e.key==='Escape'&&ui.calendarExpanded&&!doc.querySelector('dialog[open]')){ui.calendarExpanded=false;update();toggle.focus();}};
 doc.addEventListener('keydown',escape);
 const raf=win.requestAnimationFrame?.(fit);fit();
 win.addEventListener('resize',fit);win.visualViewport?.addEventListener('resize',fit);
 const observer=win.ResizeObserver?new win.ResizeObserver(fit):null;
 for(const el of root.ownerDocument.querySelectorAll('body>header,#mainNav,.calendarTools,.calendarViewSwitch'))observer?.observe(el);
 ui.calendarFitCleanup=()=>{doc.removeEventListener('keydown',escape);doc.body.classList.remove('calendarExpanded');if(raf)win.cancelAnimationFrame(raf);win.removeEventListener('resize',fit);win.visualViewport?.removeEventListener('resize',fit);observer?.disconnect();};
}

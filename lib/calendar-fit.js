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
 // Controls live in a closed drawer; opening the agenda always shows the grid.
 const drawer=doc.createElement('dialog');drawer.id='calendarSettingsDrawer';drawer.className='calendarSettingsDrawer';
 drawer.setAttribute('aria-labelledby','calendarSettingsTitle');
 drawer.innerHTML='<div class="calendarDrawerHead"><h2 id="calendarSettingsTitle">Gérer le planning</h2><button type="button" aria-label="Fermer les commandes du planning">✕</button></div><div class="calendarDrawerBody"></div>';
 const content=drawer.querySelector('.calendarDrawerBody');
 for(const panel of root.querySelectorAll(':scope > .pageHeading,:scope > .privateCalendarPanel'))content.append(panel);
 root.append(drawer);
 const more=doc.createElement('button');more.type='button';more.id='calendarMore';more.textContent='⋯';more.title='Gérer le planning';
 more.setAttribute('aria-label','Ouvrir les commandes du planning');more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-controls',drawer.id);more.setAttribute('aria-expanded','false');
 root.querySelector('.calendarViewSwitch').append(more);
 const close=()=>{if(drawer.open)drawer.close();more.setAttribute('aria-expanded','false');};
 more.onclick=()=>{drawer.showModal();more.setAttribute('aria-expanded','true');};
 drawer.querySelector('.calendarDrawerHead button').onclick=close;
 drawer.addEventListener('close',()=>{more.setAttribute('aria-expanded','false');if(more.isConnected&&!doc.querySelector('dialog[open]'))more.focus();});
 drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
 // Close before opening another dialog, but keep refresh/association feedback visible.
 content.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&(button.closest('.pageHeading')||['newPrivateEvent','newPrivateSiteEvent'].includes(button.id)))close();},true);
 for(const [id,short,label] of [['dayView','J','Jour'],['weekView','S','Semaine'],['monthView','M','Mois']]){
  const button=root.querySelector('#'+id);if(!button)continue;
  button.innerHTML='<span class="calendarViewLong">'+label+'</span><span class="calendarViewShort" aria-hidden="true">'+short+'</span>';
  button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(ui.calendarView===({dayView:'day',weekView:'week',monthView:'month'}[id])));
 }
 const raf=win.requestAnimationFrame?.(fit);fit();
 win.addEventListener('resize',fit);win.visualViewport?.addEventListener('resize',fit);
 const observer=win.ResizeObserver?new win.ResizeObserver(fit):null;
 for(const el of root.ownerDocument.querySelectorAll('body>header,#mainNav,.calendarTools,.calendarViewSwitch,#planningConfirmation'))observer?.observe(el);
 ui.calendarFitCleanup=()=>{if(drawer.open)drawer.close();doc.body.classList.remove('calendarExpanded');if(raf)win.cancelAnimationFrame(raf);win.removeEventListener('resize',fit);win.visualViewport?.removeEventListener('resize',fit);observer?.disconnect();};
}

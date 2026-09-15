export function fitCalendar(ui,root){
 ui.calendarFitCleanup?.();root.dataset.view=ui.calendarView;
 const win=root.ownerDocument.defaultView;if(!win)return;
 const fit=()=>{
  // Native pinch zoom must magnify the layout, not trigger a compensating resize.
  if(win.visualViewport?.scale>1.05)return;
  const grid=root.querySelector('.hourGrid');if(!grid||root.hidden)return;
  const top=grid.getBoundingClientRect().top;
  const head=grid.querySelector('.hourHead')?.getBoundingClientRect().height||40;
  const available=(win.visualViewport?.height||win.innerHeight)-Math.max(0,top)-head-24;
  grid.style.setProperty('--calendar-height',Math.max(180,available)+'px');
 };
 const raf=win.requestAnimationFrame?.(fit);fit();
 win.addEventListener('resize',fit);win.visualViewport?.addEventListener('resize',fit);
 const observer=win.ResizeObserver?new win.ResizeObserver(fit):null;
 for(const el of root.ownerDocument.querySelectorAll('body>header,#mainNav,.calendarTools,.calendarViewSwitch'))observer?.observe(el);
 ui.calendarFitCleanup=()=>{if(raf)win.cancelAnimationFrame(raf);win.removeEventListener('resize',fit);win.visualViewport?.removeEventListener('resize',fit);observer?.disconnect();};
}

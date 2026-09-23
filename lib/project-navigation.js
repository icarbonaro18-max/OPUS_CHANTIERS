// Restore the project layout when arriving directly from a calendar appointment.
export function showProjectScreen(ui,detail){
 document.body.classList.remove('calendarScreen');
 ui?.calendarFitCleanup?.();
 if(ui){ui.section='projects';ui.setActiveNav();}
 localStorage.setItem('opus-main-section','projects');
 for(const id of ['dashboard','projectPage','interventionsPage','visitsPage','calendarPage','officePage']){
  const el=document.getElementById(id);if(el)el.hidden=id!==(detail?'projectPage':'dashboard');
 }
 const aside=document.getElementById('projectAside');if(aside)aside.hidden=false;
}

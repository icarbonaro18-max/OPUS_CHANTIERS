// Reversible removal from report lists; hours and archived documents stay intact.
export async function setReportDeleted(ui,report,deleted){
 if(!ui.c.isAdmin?.())throw Error('Suppression réservée à l’administrateur.');
 const before={reportDeletedAt:report.reportDeletedAt,reportDeletedBy:report.reportDeletedBy};
 report.reportDeletedAt=deleted?new Date().toISOString():null;
 report.reportDeletedBy=deleted?(ui.user.displayName||'Administrateur'):null;
 try{await ui.save('interventions');}catch(error){Object.assign(report,before);throw error;}
}
export function bindReportSwipe(row,remove){
 let start=null,blocked=false,suppressUntil=0;
 row.style.touchAction='pan-y pinch-zoom';
 row.addEventListener('pointerdown',e=>{if(e.isPrimary===false||e.button>0)return;start={x:e.clientX,y:e.clientY,id:e.pointerId};blocked=false;});
 row.addEventListener('pointermove',e=>{if(!start||e.pointerId!==start.id)return;if(Math.abs(e.clientY-start.y)>25)blocked=true;});
 row.addEventListener('pointercancel',()=>{start=null;});
 row.addEventListener('pointerup',e=>{if(!start||e.pointerId!==start.id)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(!blocked&&dx<=-90&&Math.abs(dy)<25){suppressUntil=Date.now()+500;remove();}});
 row.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
}

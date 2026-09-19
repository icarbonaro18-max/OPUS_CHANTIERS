export function reportSource(x,read) {
  return {
    client:x.clientName||'',address:x.siteAddress||'',number:x.number||'',
    title:x.title||'',request:x.request||'',
    workDone:read('aWork').trim(),notes:read('aNotes').trim(),materials:read('aMaterial').trim(),
    needsQuote:read('aQuote')==='oui'||(x.reportItems||[]).some(p=>p.needsQuote),
    points:(x.reportItems||[]).map(({title,issueType,location,observation,action,reference,needsQuote,startedAt,endedAt})=>({title,issueType,location,observation,action,reference,needsQuote,startedAt,endedAt}))
  };
}

export function visitReportSource(x,read){
 return {kind:'visit_before_quote',client:x.clientName||'',address:x.siteAddress||'',number:x.number||'',type:x.type||'',request:x.request||'',summary:read('vSummary').trim(),notes:read('vNotes').trim(),needsQuote:read('vNeedsQuote')==='oui',tasks:(x.visitTasks||[]).map(({room,title,length,width,height,falseCeiling,plenumHeight,need,observation})=>({room,title,length,width,height,falseCeiling,plenumHeight,need,observation}))};
}
export function savedVisitReportSource(x){return visitReportSource(x,id=>({vSummary:x.summary||'',vNotes:x.notes||'',vNeedsQuote:x.needsQuote===false?'non':'oui'})[id]||'');}

export function bindReportAI(ui,x,canEdit,visit=false) {
  const form=document.getElementById(visit?'finishVisit':'finishInt');
  const sourceFn=visit?visitReportSource:reportSource;
  const section=document.createElement('section');
  section.className='quickReport';
  section.innerHTML='<h3>Rapport client en français</h3><p>Notes FR / IT → rapport français. La rédaction utilise les notes écrites, sans analyser les photos. Relisez les faits et les réserves avant validation. Les notes terrain restent conservées.</p><button type="button" id="generateClientReport">✨ Générer le rapport complet</button><textarea id="clientReportDraft" rows="16" aria-label="Proposition de rapport client"></textarea><label><input type="checkbox" id="approveClientReport"> J’ai relu et validé ce rapport pour le PDF client.</label><p id="clientReportStatus" role="status"></p>';
  if(visit){section.querySelector('h3').textContent='Compte rendu de visite en français';section.querySelector('button').textContent='✨ Créer le compte rendu de visite en français';}
  // Task cards have nested action rows; insert only before the form's own footer.
  form.insertBefore(section,Array.from(form.children).find(el=>el.classList.contains('actionRow'))||null);
  const draft=section.querySelector('textarea'),approve=section.querySelector('input'),button=section.querySelector('button'),status=section.querySelector('[role=status]');
  const read=id=>document.getElementById(id)?.value||'';
  const fingerprint=()=>JSON.stringify(sourceFn(x,read));
  draft.value=x.clientReport||'';
  let generatedSource=x.clientReportSource||'';section.dataset.source=generatedSource;
  approve.checked=!!x.clientReportApproved&&generatedSource===fingerprint();
  if(x.clientReportApproved&&!approve.checked)status.textContent='Les notes ont changé : régénérez le rapport.';
  button.disabled=!canEdit;draft.readOnly=!canEdit;approve.disabled=!canEdit;
  draft.oninput=()=>{approve.checked=false;};
  form.addEventListener('input',ev=>{if(!section.contains(ev.target)){approve.checked=false;status.textContent='Notes modifiées : régénérez le rapport avant validation.';}});
  button.onclick=async()=>{
    const source=sourceFn(x,read);
    if(visit?(!source.summary&&!source.notes&&!source.tasks.length):(!source.workDone.trim()&&!source.notes.trim()&&!source.points.length)){status.textContent='Ajoutez des constats ou des travaux réalisés avant de générer.';return;}
    if(draft.value&&!confirm('Remplacer la proposition actuelle ? Les notes terrain seront conservées.'))return;
    const snapshot=JSON.stringify(source);button.disabled=true;status.textContent='Rédaction en cours…';
    try{
      const result=await ui.assistant.request(visit?'visit_report_fr':'report_fr',JSON.stringify({...source,concise:true}));
      if(!form.isConnected)return;
      if(snapshot!==fingerprint()){status.textContent='Notes modifiées pendant la génération. Relancez la rédaction.';return;}
      draft.value=result.text;generatedSource=snapshot;section.dataset.source=snapshot;approve.checked=false;
      status.textContent='Proposition prête : relisez, ajustez si nécessaire, cochez la validation puis enregistrez le rapport.';
    }catch(e){status.textContent=e.name==='AbortError'?'Délai dépassé. Vos notes sont conservées.':e.message;}
    finally{button.disabled=!canEdit;}
  };
  // Run before the existing submit handler; keep the original notes intact.
  form.addEventListener('submit',ev=>{
    if(!canEdit||!visit)return;
    if(approve.checked&&(!draft.value.trim()||generatedSource!==fingerprint())){
      ev.preventDefault();ev.stopImmediatePropagation();approve.checked=false;
      status.textContent='Le rapport est vide ou les notes ont changé. Régénérez puis relisez.';return;
    }
    x.clientReport=draft.value.trim();x.clientReportSource=generatedSource;
    x.clientReportApproved=approve.checked;
  },true);
  for(const id of (visit?['downloadVisitPdf','saveVisitPdf']:[])){
    document.getElementById(id)?.addEventListener('click',ev=>{
      if(draft.value!== (x.clientReport||'')||approve.checked!==!!x.clientReportApproved||generatedSource!==fingerprint()&&draft.value){
        ev.preventDefault();ev.stopImmediatePropagation();
        status.textContent='Enregistrez d’abord le rapport et sa validation avant de produire le PDF.';
      }
    },true);
  }
}

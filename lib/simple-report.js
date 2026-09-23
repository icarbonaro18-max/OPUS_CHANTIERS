// Move existing controls, preserving values, handlers and the saved record format.
function fold(nodes,title,open=false){
 nodes=nodes.filter(Boolean);if(!nodes.length)return;
 const box=document.createElement('details');box.className='reportOptional';box.open=open;
 const label=document.createElement('summary');label.textContent=title;box.append(label);
 nodes[0].before(box);nodes.forEach(node=>box.append(node));return box;
}
export function simplifyReport(x,visit=false){
 const form=document.getElementById(visit?'finishVisit':'finishInt');if(!form)return;
 form.classList.add('simpleReport');
 const modal=form.closest('dialog')||form.parentElement;
 const oldDetails=modal?.querySelector('.detailGrid');
 if(oldDetails){
  const box=document.createElement('div');box.className='reportIdentity';
  for(const [label,value] of [['Dossier',x.projectName||x.number],['Client',x.clientName],['Objet / travaux prévus',x.title],['À faire / consignes',x.request],['Lieu d’intervention',x.siteAddress],['Contact sur place',[x.siteContact,x.sitePhone||x.phone,x.siteEmail||x.email].filter(Boolean).join(' · ')]]){
   if(!value)continue;const line=document.createElement('div'),title=document.createElement('strong');title.textContent=label+' : ';line.style.whiteSpace='pre-wrap';line.style.overflowWrap='anywhere';line.append(title,document.createTextNode(value));box.append(line);
  }
  oldDetails.replaceWith(box);
 }

 const get=id=>document.getElementById(id);
 const work=get(visit?'vSummary':'aWork')?.parentElement;
 const photos=get(visit?'visitPhotoPreview':'photoPreview')?.closest('section');
 const ai=get('clientReportDraft')?.closest('section');
 const heading=document.createElement('p');heading.className='reportIntro';heading.hidden=true;
 form.prepend(heading);let anchor=heading;
 for(const node of [work,photos,ai])if(node){anchor.after(node);anchor=node;}
 const language=modal?.querySelector('.languageBar');if(language&&work){work.append(language);const explanation=language.querySelector('span');if(explanation)explanation.remove();}
 if(work){work.classList.add('reportEssential');work.querySelector('label').textContent=visit?'1. Ce que vous avez constaté':'1. Ce qui a été fait';work.querySelector('textarea').rows=3;}
 if(photos){photos.querySelector('h3').textContent='2. Photos';const p=photos.querySelector('p');if(p)p.textContent='Vue d’ensemble, travaux réalisés ou problème à signaler.';}
 if(ai){ai.querySelector('h3').textContent='3. Résumé en français';ai.querySelector('p').textContent='Facultatif : créez un résumé à partir de vos notes FR / IT, puis relisez-le. Les photos restent jointes.';ai.querySelector('button').textContent='Créer le résumé en français';ai.querySelector('textarea').rows=5;const preview=fold([ai.querySelector('textarea'),ai.querySelector('label')],'Relire et valider le résumé',!!x.clientReport);const generate=ai.querySelector('button'),run=generate.onclick;generate.onclick=async ev=>{preview.open=true;await run(ev);};}
 const items=get(visit?'addVisitTask':'intItemsList')?.closest('section');
 fold([items],visit?'Détailler par pièce / sujet (facultatif)':'Détailler par équipement / sujet (facultatif)',!!(visit?x.visitTasks?.length:x.reportItems?.length));
 const notes=get(visit?'vNotes':'aNotes')?.parentElement;
 fold([notes],'Observations / suites (facultatif)',!!(visit?x.notes:x.notes));
 if(!visit){
  const project=form.querySelector('.projectReportSummary');
  if(project){const kind=get('prKind'),label=kind.previousElementSibling;const row=document.createElement('div');row.className='reportKind';row.append(label,kind);heading.after(row);fold([project],'Avancement et matériel pour la suite (facultatif)',!!(x.progressNotes||x.materialNeeded||x.requestMaterials?.length));}
 }
 const grid=form.querySelector('.compactReport');if(grid){grid.classList.add('reportHours');const title=document.createElement('h3');title.className='wide';title.textContent='Horaires réels à vérifier';grid.prepend(title);}
 fold([form.querySelector('.helpCard')],'Aide à la dictée et à la rédaction');
 const footer=Array.from(form.children).find(el=>el.classList.contains('actionRow'));
 if(footer){footer.classList.add('reportSend');const extras=[...footer.querySelectorAll('button')].filter(b=>b.id&&b.type!=='submit');if(extras.length)fold(extras,'PDF et autres actions');}
 // Open any optional panel containing an invalid field before browser validation focuses it.
 form.addEventListener('invalid',ev=>{let p=ev.target.parentElement;while(p&&p!==form){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}},true);
}

import {payrollRows} from './workforce.js';
import {standardDayHours,isoDate} from './ops.js';
import {installPdfFonts} from './pdf-fonts.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function shortWorkLabel(value){
 const s=String(value||'');const project=s.match(/(?<![A-Za-z0-9-])20\d{2}-\d{4,8}[_ ][^;·\n]*/g);
 if(project)return project.map(x=>x.replaceAll('_',' ').trim()).join(' / ');
 const refs=s.match(/\b(?:INT|VIS|VAD)-20\d{2}-\d+/g);return refs?[...new Set(refs)].join(' / '):'';
}
export const PAYROLL_COLUMNS=[['Travail','Travail'],['Maladie','Maladie'],['Sans solde','Sans solde'],['Congés payés','Congés payés'],['École','École'],['Autre','Autres*']];
export function payrollCells(day){return PAYROLL_COLUMNS.map(([nature])=>(nature==='Autre'?!PAYROLL_COLUMNS.slice(0,5).some(([n])=>n===day.nature):day.nature===nature)?Number(day.hours)||0:0);}
export function monthSheet(data,personId,month,saved={}){
 const person=data.people.find(p=>p.id===personId);if(!person)throw Error('Salarié introuvable.');
 const facts=payrollRows({...data,people:[person]},month),[y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate();
 return Array.from({length:days},(_,i)=>{const date=isoDate(new Date(y,m-1,i+1,12)),rows=facts.filter(r=>r.date===date),actual=rows.reduce((n,r)=>n+r.actual,0),fingerprint=JSON.stringify(rows),old=saved.days?.find(d=>d.date===date);return {date,actual,standard:standardDayHours(person,date),details:rows.map(r=>[r.type,r.ref,r.label].filter(Boolean).join(' · ')).join(' ; '),fingerprint,hours:old?.hours??actual,nature:old?.nature||'Travail',note:old?.note||'',reviewed:!!old?.reviewed&&old.fingerprint===fingerprint,changed:!!old&&old.fingerprint!==fingerprint};});
}
export function validateSheet(days,{requireReason=true}={}){for(const d of days){if(!Number.isFinite(Number(d.hours))||Number(d.hours)<0||Number(d.hours)>24)throw Error(d.date+' : saisissez une durée entre 0 et 24 heures.');if(requireReason&&Number(d.hours)!==Number(d.actual)&&!d.note.trim())throw Error(d.date+' : ajoutez un motif pour la différence avec le pointage terrain.');}}
export async function sheetPdf(person,month,days){
 const {jsPDF}=await import('../vendor/jspdf.js');const p=new jsPDF();await installPdfFonts(p);
 const r=await fetch(new URL('../assets/logo.png',import.meta.url));if(!r.ok)throw Error('Logo OPUS indisponible.');p.addImage(new Uint8Array(await r.arrayBuffer()),'PNG',12,10,43,14);
 p.setTextColor(12,61,99);p.setFont('OpusSans','bold');p.setFontSize(15);p.text('FICHE MENSUELLE D’HEURES',198,18,{align:'right'});
 p.setFontSize(11);p.text(person.name+' — '+month,12,34);p.setFont('OpusSans','normal');p.setFontSize(8);p.text('Matricule : '+(person.employeeCode||'—')+' | Heures retenues et validées par le bureau',12,40);
 p.text('Heures de travail hors pause déjeuner. Ne pas déduire la pause une seconde fois.',12,46);
 const widths=[14,64,18,18,18,20,16,18],heads=['Jour','Chantier / intervention',...PAYROLL_COLUMNS.map(c=>c[1])];let y=53;
 const row=(values,h,header=false)=>{let x=12;p.setFont('OpusSans',header?'bold':'normal');p.setFontSize(7.1);for(let i=0;i<values.length;i++){p.setFillColor(...(header?[12,61,99]:[248,250,252]));p.setDrawColor(213,225,234);p.rect(x,y,widths[i],h,'FD');p.setTextColor(...(header?[255,255,255]:[22,52,75]));let v=String(values[i]);if(header){const lines=p.splitTextToSize(v,widths[i]-3);p.text(lines,i<2?x+1.5:x+widths[i]-1.5,y+(h-lines.length*2.7)/2+2,{align:i<2?'left':'right',lineHeightFactor:1.1});}else{while(p.getTextWidth(v)>widths[i]-3&&v.length>1)v=v.slice(0,-2)+'…';p.text(v,i<2?x+1.5:x+widths[i]-1.5,y+h/2+1,{align:i<2?'left':'right'});}x+=widths[i];}y+=h;};
 row(heads,10,true);const totals=Array(6).fill(0);
 for(const d of days){const cells=payrollCells(d);cells.forEach((v,i)=>totals[i]+=v);row([d.date.slice(8)+'/'+d.date.slice(5,7),shortWorkLabel(d.details)||'—',...cells.map(v=>v?v.toFixed(2):'—')],5.7);}
 row(['TOTAL','Heures du mois',...totals.map(v=>v.toFixed(2))],8,true);
 y+=7;p.setTextColor(40,65,85);p.setFont('OpusSans','normal');p.setFontSize(8);p.text('* Autres : fermetures à qualifier et autres natures. Détail conservé dans l’application.',12,y);y+=5;
 p.text('Les absences sont présentées séparément des heures de travail.',12,y);p.setFontSize(7);p.text('OPUS ELEC · Synthèse préparatoire à la paie · '+month+' · 1/1',12,286);
 return p.output('blob');
}
export async function openPayroll(ui,month){
 if(ui.role()!=='admin')return;
 ui.c.modal('Fiches mensuelles par salarié',`<p><strong>Saisissez uniquement les heures de travail, pause déjeuner déjà déduite.</strong> Du lundi au jeudi : 8h–17h moins 1h de pause = 8h. Vendredi : 8h–16h moins 1h = 7h, soit 39h par semaine. Apprentis : vendredi 8h–11h sans pause = 3h, soit 35h par semaine.</p><p>Le pointage terrain reste intact. Corrigez les heures retenues pour la paie, indiquez leur nature et le motif. Les absences et l’école sont rappelées pour contrôle.</p><label>Salarié<select id="psPerson"><option value="">Choisir</option>${ui.data.people.filter(p=>p.type!=='external').map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><p id="psStatus" role="status"></p><div id="psBody"></div>`);
 const select=document.getElementById('psPerson'),body=document.getElementById('psBody'),status=document.getElementById('psStatus');let dirty=false,serial=0;
 select.onchange=async()=>{if(dirty&&!confirm('Abandonner les modifications non enregistrées ?')){select.value=select.dataset.previous||'';return;}select.dataset.previous=select.value;dirty=false;const personId=select.value,call=++serial;body.replaceChildren();if(!personId)return;status.textContent='Chargement…';try{
 const key='payroll_'+month+'_'+personId;let saved=await ui.repo.load(key,{});if(call!==serial)return;const days=monthSheet(ui.data,personId,month,saved),person=ui.data.people.find(p=>p.id===personId);status.textContent=month+' · '+person.name;
 body.innerHTML=`<p>« Journée prévue » applique ${person.role==='apprenti'||Number(person.weeklyTarget)===35?'35':'39'} h par semaine, y compris les horaires du vendredi. Contrôlez aussi les jours sans pointage.</p><div class="psTableWrap"><table class="psTable"><thead><tr><th>Jour / activité</th><th>Terrain</th><th>Travail retenu<br>(hors déjeuner)</th><th>Nature</th><th>Motif</th><th>Vérifié</th></tr></thead><tbody>${days.map((d,i)=>`<tr data-day="${i}"><td>${esc(d.date)}<small style="display:block;max-width:300px">${esc(shortWorkLabel(d.details)||d.details.replace(/\b[A-Z0-9]{20,}\b/g,''))}${d.changed?' — SOURCES MODIFIÉES, À REVÉRIFIER':''}</small></td><td>${d.actual.toFixed(2)} h</td><td><input data-k="hours" type="number" min="0" max="24" step="0.25" value="${d.hours}" style="width:90px"><button type="button" data-standard="${i}">Journée prévue (${d.standard} h)</button></td><td><select data-k="nature">${['Travail','École','Congés payés','Maladie','Sans solde','Fermeture à qualifier','Autre'].map(n=>`<option ${n===d.nature?'selected':''}>${n}</option>`).join('')}</select></td><td><textarea data-k="note" rows="2" placeholder="Motif de correction…">${esc(d.note)}</textarea></td><td><input data-k="reviewed" type="checkbox" ${d.reviewed?'checked':''}></td></tr>`).join('')}</tbody></table></div><div class="psFooter"><p id="psTotal"></p><p id="psFeedback" role="status" aria-live="polite"></p><div class="actionRow"><button id="psSave">Enregistrer la fiche</button><button id="psReview" class="secondary">Valider toutes les journées relues</button><button id="psPdf">Enregistrer et exporter le PDF de ce salarié</button></div></div>`;
 const total=()=>document.getElementById('psTotal').textContent='Total retenu, toutes natures (hors déjeuner) : '+days.reduce((n,d)=>n+Number(d.hours||0),0).toFixed(2)+' h';total();
 body.querySelectorAll('[data-k]').forEach(el=>el.oninput=()=>{const d=days[+el.closest('tr').dataset.day];d[el.dataset.k]=el.type==='checkbox'?el.checked:el.dataset.k==='hours'?Number(el.value):el.value;if(el.dataset.k!=='reviewed'){d.reviewed=false;el.closest('tr').querySelector('[data-k=reviewed]').checked=false;}dirty=true;total();});
 body.querySelectorAll('[data-standard]').forEach(b=>b.onclick=()=>{const d=days[+b.dataset.standard],tr=b.closest('tr');d.hours=d.standard;if(!d.note.trim()){d.note='Journée contractuelle retenue par le bureau, hors pause déjeuner';tr.querySelector('[data-k=note]').value=d.note;}d.reviewed=false;tr.querySelector('[data-k=hours]').value=d.hours;tr.querySelector('[data-k=reviewed]').checked=false;dirty=true;total();});
 const feedback=(message,error=false)=>{status.textContent=message;const f=document.getElementById('psFeedback');f.textContent=message;f.className=error?'psError':'psSuccess';};
 document.getElementById('psReview').onclick=()=>{if(!confirm('Confirmez-vous avoir relu toutes les dates, heures, natures et motifs de ce mois ?'))return;days.forEach(d=>d.reviewed=true);body.querySelectorAll('[data-k=reviewed]').forEach(i=>i.checked=true);dirty=true;feedback('Journées marquées comme relues. Enregistrez ou exportez la fiche.');};
 let saving=false;const save=async(exportPdf)=>{
  if(saving)return;saving=true;select.disabled=true;body.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=true);let recorded=false;
  feedback('Enregistrement en cours…');
  try{
   if(ui.role()!=='admin')throw Error('Accès réservé au gérant.');
   validateSheet(days,{requireReason:false});
   const current=await ui.repo.load(key,{});if(JSON.stringify(current)!==JSON.stringify(saved))throw Error('Cette fiche a changé sur un autre ordinateur. Rouvrez-la avant de modifier.');
   const next={personId,month,days:structuredClone(days),updatedAt:new Date().toISOString(),by:ui.c.getUser?.()?.displayName||'Administrateur',history:[...(saved.history||[]),{at:new Date().toISOString(),days:saved.days||[]}]};
   await ui.repo.save(key,next);saved=next;dirty=false;recorded=true;feedback('Fiche enregistrée dans OPUS. Vous pouvez continuer à la compléter.');
   if(exportPdf){
    validateSheet(days);const pending=days.filter(d=>!d.reviewed);if(pending.length)throw Error(pending.length+' journée(s) à vérifier, à partir du '+pending[0].date+'. Cochez les journées relues ou utilisez le bouton de validation du mois.');
    feedback('Fiche enregistrée. Création du PDF…');
    ui.c.download(await sheetPdf(person,month,days),'OPUS_HEURES_'+person.name.replace(/[^a-z0-9]/gi,'_')+'_'+month+'.pdf');feedback('Fiche enregistrée et PDF téléchargé.');
   }
  }catch(e){feedback((recorded?'Fiche enregistrée ; PDF non exporté. ':'Enregistrement non effectué. ')+e.message,true);}
  finally{saving=false;select.disabled=false;body.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=false);}
 };
 document.getElementById('psSave').onclick=()=>save(false);document.getElementById('psPdf').onclick=()=>save(true);
 }catch(e){status.textContent=e.message;}};
}

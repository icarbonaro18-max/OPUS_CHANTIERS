import {payrollRows} from './workforce.js';
import {standardDayHours,isoDate} from './ops.js';
import {installPdfFonts} from './pdf-fonts.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function monthSheet(data,personId,month,saved={}){
 const person=data.people.find(p=>p.id===personId);if(!person)throw Error('Salarié introuvable.');
 const facts=payrollRows({...data,people:[person]},month),[y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate();
 return Array.from({length:days},(_,i)=>{const date=isoDate(new Date(y,m-1,i+1,12)),rows=facts.filter(r=>r.date===date),actual=rows.reduce((n,r)=>n+r.actual,0),fingerprint=JSON.stringify(rows),old=saved.days?.find(d=>d.date===date);return {date,actual,standard:standardDayHours(person,date),details:rows.map(r=>[r.type,r.ref,r.label].filter(Boolean).join(' · ')).join(' ; '),fingerprint,hours:old?.hours??actual,nature:old?.nature||'Travail',note:old?.note||'',reviewed:!!old?.reviewed&&old.fingerprint===fingerprint,changed:!!old&&old.fingerprint!==fingerprint};});
}
export function validateSheet(days,{requireReason=true}={}){for(const d of days){if(!Number.isFinite(Number(d.hours))||Number(d.hours)<0||Number(d.hours)>24)throw Error(d.date+' : saisissez une durée entre 0 et 24 heures.');if(requireReason&&Number(d.hours)!==Number(d.actual)&&!d.note.trim())throw Error(d.date+' : ajoutez un motif pour la différence avec le pointage terrain.');}}
export async function sheetPdf(person,month,days){
 const {jsPDF}=await import('../vendor/jspdf.js');const p=new jsPDF();await installPdfFonts(p);p.setFont('OpusSans');let y=20;
 const text=(value,bold=false)=>{p.setFont('OpusSans',bold?'bold':'normal');p.setFontSize(9);for(const line of p.splitTextToSize(value,174)){if(y>270){p.addPage();y=20;}p.text(line,18,y);y+=4.5;}y+=3;};
 const imageResponse=await fetch(new URL('../assets/logo.png',import.meta.url));if(!imageResponse.ok)throw Error('Logo OPUS indisponible.');const imageBytes=new Uint8Array(await imageResponse.arrayBuffer());p.addImage(imageBytes,'PNG',18,12,49,16);y=42;
 p.setTextColor(12,61,99);p.setFontSize(17);p.text('FICHE MENSUELLE D’HEURES',18,y);y+=13;
 text(person.name+' · Matricule '+(person.employeeCode||'non renseigné')+' · '+month,true);
 text('Synthèse préparatoire validée par le bureau — heures retenues distinctes des pointages terrain.');
 text('Heures de travail hors pause déjeuner : la pause est déjà exclue. Ne pas la déduire une seconde fois.',true);
 const totals={};for(const d of days)totals[d.nature]=(totals[d.nature]||0)+Number(d.hours);
 text(Object.entries(totals).map(([k,v])=>k+' : '+v.toFixed(2)+' h').join(' | '),true);
 for(const d of days){text(d.date+' | Terrain : '+d.actual.toFixed(2)+' h | Retenues : '+Number(d.hours).toFixed(2)+' h | '+d.nature,true);if(d.details)text(d.details);if(d.note)text('Motif / commentaire : '+d.note);}
 for(let i=1;i<=p.getNumberOfPages();i++){p.setPage(i);p.setFontSize(8);p.text('OPUS ELEC · '+person.name+' · '+month+' · '+i+'/'+p.getNumberOfPages(),18,285);}return p.output('blob');
}
export async function openPayroll(ui,month){
 if(ui.role()!=='admin')return;
 ui.c.modal('Fiches mensuelles par salarié',`<p><strong>Saisissez uniquement les heures de travail, pause déjeuner déjà déduite.</strong> Du lundi au jeudi : 8h–17h moins 1h de pause = 8h. Vendredi : 8h–16h moins 1h = 7h, soit 39h par semaine. Apprentis : vendredi 8h–11h sans pause = 3h, soit 35h par semaine.</p><p>Le pointage terrain reste intact. Corrigez les heures retenues pour la paie, indiquez leur nature et le motif. Les absences et l’école sont rappelées pour contrôle.</p><label>Salarié<select id="psPerson"><option value="">Choisir</option>${ui.data.people.filter(p=>p.type!=='external').map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><p id="psStatus" role="status"></p><div id="psBody"></div>`);
 const select=document.getElementById('psPerson'),body=document.getElementById('psBody'),status=document.getElementById('psStatus');let dirty=false,serial=0;
 select.onchange=async()=>{if(dirty&&!confirm('Abandonner les modifications non enregistrées ?')){select.value=select.dataset.previous||'';return;}select.dataset.previous=select.value;dirty=false;const personId=select.value,call=++serial;body.replaceChildren();if(!personId)return;status.textContent='Chargement…';try{
 const key='payroll_'+month+'_'+personId;let saved=await ui.repo.load(key,{});if(call!==serial)return;const days=monthSheet(ui.data,personId,month,saved),person=ui.data.people.find(p=>p.id===personId);status.textContent=month+' · '+person.name;
 body.innerHTML=`<p>« Journée prévue » applique ${person.role==='apprenti'||Number(person.weeklyTarget)===35?'35':'39'} h par semaine, y compris les horaires du vendredi. Contrôlez aussi les jours sans pointage.</p><div class="psTableWrap"><table class="psTable"><thead><tr><th>Jour / activité</th><th>Terrain</th><th>Travail retenu<br>(hors déjeuner)</th><th>Nature</th><th>Motif</th><th>Vérifié</th></tr></thead><tbody>${days.map((d,i)=>`<tr data-day="${i}"><td>${esc(d.date)}<small style="display:block;max-width:300px">${esc(d.details)}${d.changed?' — SOURCES MODIFIÉES, À REVÉRIFIER':''}</small></td><td>${d.actual.toFixed(2)} h</td><td><input data-k="hours" type="number" min="0" max="24" step="0.25" value="${d.hours}" style="width:90px"><button type="button" data-standard="${i}">Journée prévue (${d.standard} h)</button></td><td><select data-k="nature">${['Travail','École','Congés payés','Maladie','Sans solde','Fermeture à qualifier','Autre'].map(n=>`<option ${n===d.nature?'selected':''}>${n}</option>`).join('')}</select></td><td><textarea data-k="note" rows="2" placeholder="Motif de correction…">${esc(d.note)}</textarea></td><td><input data-k="reviewed" type="checkbox" ${d.reviewed?'checked':''}></td></tr>`).join('')}</tbody></table></div><div class="psFooter"><p id="psTotal"></p><p id="psFeedback" role="status" aria-live="polite"></p><div class="actionRow"><button id="psSave">Enregistrer la fiche</button><button id="psReview" class="secondary">Valider toutes les journées relues</button><button id="psPdf">Enregistrer et exporter le PDF de ce salarié</button></div></div>`;
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

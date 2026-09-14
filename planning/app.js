const $=id=>document.getElementById(id);let key='',events=[],busy=false,sequence=0;
const date=d=>d.toISOString().slice(0,10),plus=(s,n)=>date(new Date(Date.parse(s)+n*86400000));
const today=new Date(),monday=new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()));monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);$('from').value=date(monday);
function text(tag,value,parent){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
function draw(){
 $('days').replaceChildren();for(let i=0;i<7;i++){
  const d=plus($('from').value,i),card=document.createElement('article');text('h2',new Date(d+'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Paris'}),card);
  const list=events.filter(e=>e.date===d&&(!$('person').value||e.team.some(p=>p.name===$('person').value)));
  for(const e of list){const block=document.createElement('section');block.className='event';text('h3',e.title,block);text('p',e.start+' – '+e.end+(e.endDate!==e.date?' · fin le '+e.endDate:''),block);const ul=document.createElement('ul');for(const p of e.team)text('li',p.name+' : '+p.start+'–'+p.end,ul);block.append(ul);card.append(block);}
  if(!list.length)text('p','Aucune affectation affichée',card);$('days').append(card);
 }
}
async function load(){if(busy||!key)return;busy=true;$('from').disabled=true;const request=++sequence;$('status').textContent='Chargement…';$('days').replaceChildren();events=[];
 try{const r=await fetch('/api/planning-reader',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:key,from:$('from').value}),cache:'no-store',signal:AbortSignal.timeout(45000)});const data=await r.json();if(request!==sequence)return;if(!r.ok)throw Error(data.error||'Planning indisponible.');events=data.events;$('calendar').hidden=false;$('login').hidden=true;const selected=$('person').value;$('person').replaceChildren(new Option('Toute l’équipe',''));for(const name of [...new Set(events.flatMap(e=>e.team.map(p=>p.name)))].sort())$('person').add(new Option(name,name));$('person').value=[...$('person').options].some(o=>o.value===selected)?selected:'';draw();$('status').textContent='Planning actualisé à '+new Date(data.checkedAt).toLocaleTimeString('fr-FR');}
 catch(e){if(request!==sequence)return;$('status').textContent=e.message;$('login').hidden=false;}
 finally{if(request===sequence){busy=false;$('from').disabled=false;}}
}
$('login').onsubmit=e=>{e.preventDefault();key=$('code').value.trim();$('code').value='';load();};$('refresh').onclick=load;$('from').onchange=load;$('person').onchange=draw;
$('previous').onclick=()=>{if(!busy){$('from').value=plus($('from').value,-7);load();}};$('next').onclick=()=>{if(!busy){$('from').value=plus($('from').value,7);load();}};
$('logout').onclick=()=>{++sequence;busy=false;$('from').disabled=false;key='';events=[];$('days').replaceChildren();$('calendar').hidden=true;$('login').hidden=false;$('status').textContent='Planning fermé.';};
const fragment=new URLSearchParams(location.hash.slice(1));if(fragment.has('code')){key=fragment.get('code');history.replaceState(null,'',location.pathname);load();}
// No mailbox, personnel file, access code or calendar data in persistent storage.
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

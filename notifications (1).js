import {store,read,write,defaults,readiness,identity,personFor,loadPlanning,enrichedRows,validSubscription,hash,admins,push} from '../server/notifications.js';
import {phone,assignmentBlocks,smsCandidates} from '../lib/notification-plan.js';
export function createHandler({env=process.env,fetcher=fetch}={}){return async(req,res)=>{res.setHeader('Cache-Control','no-store, private');const fail=(n,error)=>res.status(n).json({error});if(req.method!=='POST')return fail(405,'Utilisez POST.');try{
 if(!readiness(env).storage||!readiness(env).admins)return fail(503,'Notifications non activées : configuration serveur nécessaire.');
 const user=await identity(req,env,fetcher),db=store(env,fetcher);let body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||JSON.stringify(body).length>300000)return fail(400,'Requête invalide.');const action=body.action;
 if(['save','preview','private'].includes(action)&&!user.admin)return fail(403,'Réservé à l’administrateur.');
 const data=await loadPlanning(env,fetcher),person=personFor(user,data.people);if(!user.admin&&!person)return fail(403,'Votre e-mail Microsoft doit correspondre à votre fiche personnel.');
 if(action==='status'){const settings=await read(db,'settings',defaults),heartbeat=await read(db,'heartbeat',null);return res.status(200).json({admin:user.admin,publicKey:env.VAPID_PUBLIC_KEY||'',ready:readiness(env),heartbeat,...(user.admin?{settings,people:data.people.filter(p=>p.active!==false).map(p=>({id:p.id,name:p.name,email:p.email||''})),logs:(await db('LRANGE','opus87:log',0,29)).map(x=>JSON.parse(x))}:{enabled:settings.enabled&&settings.pushEnabled})});}
 if(action==='save'){
 const s=body.settings;if(!s||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.sendTime)||s.sendTime<'16:00'||s.sendTime>'21:00'||!Array.isArray(s.recipients)||s.recipients.length>100)return fail(400,'Choisissez une heure entre 16 h et 21 h et vérifiez les destinataires.');
 const recipients=s.recipients.map(r=>({personId:String(r.personId),phone:phone(r.phone),sms:r.sms===true}));if(recipients.some(r=>!data.people.some(p=>p.id===r.personId&&p.active!==false)||r.sms&&!r.phone)||new Set(recipients.map(r=>r.personId)).size!==recipients.length)return fail(400,'Salarié ou numéro invalide.');
 const active=recipients.filter(r=>r.sms);if(new Set(active.map(r=>r.phone)).size!==active.length)return fail(400,'Un numéro est attribué à plusieurs salariés. Vérifiez les destinataires.');
 const ready=readiness(env);if(s.enabled&&(!ready.microsoft||!ready.cron||s.pushEnabled&&!ready.push||s.smsEnabled&&!ready.sms))return fail(400,'Complétez la configuration serveur avant d’activer.');
 await write(db,'settings',{enabled:s.enabled===true,pushEnabled:s.pushEnabled===true,smsEnabled:s.smsEnabled===true,sendTime:s.sendTime,recipients});return res.status(200).json({ok:true});
 }
 if(action==='preview'){const settings=await read(db,'settings',defaults),rows=await enrichedRows(data,new Date()),blocks=assignmentBlocks(rows),previous=await read(db,'announced',{});return res.status(200).json({messages:smsCandidates(blocks,previous,new Date(body.at||Date.now()),settings.sendTime).filter(m=>settings.recipients.some(r=>r.personId===m.personId&&r.sms)).map(m=>({name:data.people.find(p=>p.id===m.personId)?.name,text:m.text,missingAddress:!m.cancelled&&!m.block.address})),note:'Aperçu à l’heure choisie. Aucun SMS envoyé.'});}
 if(action==='subscribe'){
 if(!validSubscription(body.subscription))return fail(400,'Abonnement de notification invalide ou navigateur non pris en charge.');if(Number(await db('HLEN','opus87:subscriptions'))>=500)return fail(400,'Limite d’appareils atteinte : désactivez les anciens appareils.');const id=hash(body.subscription.endpoint);await db('HSET','opus87:subscriptions',id,JSON.stringify({id,ownerId:user.id,identities:[user.id,user.userPrincipalName].filter(Boolean).map(s=>s.toLowerCase()),admin:user.admin,personId:person?.id||'',name:person?.name||'Administrateur',subscription:body.subscription}));return res.status(200).json({ok:true});
 }
 if(action==='test'){const id=hash(body.endpoint||''),raw=await db('HGET','opus87:subscriptions',id);if(!raw||JSON.parse(raw).ownerId!==user.id)return fail(403,'Inscrivez cet appareil avec votre compte.');if(!await db('SET','opus87:test:'+user.id,'1','NX','EX',60))return fail(429,'Attendez une minute avant un nouveau test.');await push(env,JSON.parse(raw).subscription,{title:'OPUS · Test de notification',body:'Les notifications sont autorisées sur cet appareil.',tag:'opus-test'});return res.status(200).json({ok:true});}
 if(action==='unsubscribe'){const id=hash(body.endpoint||''),old=await db('HGET','opus87:subscriptions',id);if(old&&JSON.parse(old).ownerId===user.id)await db('HDEL','opus87:subscriptions',id);return res.status(200).json({ok:true});}
 if(action==='private'){
 if(!Array.isArray(body.rows)||body.rows.length>1000)return fail(400,'Agenda privé trop volumineux.');const rows=body.rows.map(r=>{
  if(!r.id||!Number.isFinite(Date.parse(r.start))||!Number.isFinite(Date.parse(r.end))||Date.parse(r.end)<=Date.parse(r.start))throw Error('Date du rendez-vous privé invalide.');
  let recurrence=null;if(r.recurrence){const until=String(r.recurrence.until||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(until)||Date.parse(until)>Date.parse(r.start)+5*366*86400000||!Array.isArray(r.recurrence.days)||r.recurrence.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Récurrence invalide.');recurrence={frequency:'weekly',until,days:[...new Set(r.recurrence.days)]};}
  return {id:String(r.id).slice(0,150),ownerId:user.id,kind:'private',title:String(r.title||'Rendez-vous privé').slice(0,200),address:String(r.address||'').slice(0,350),start:new Date(r.start).toISOString(),end:new Date(r.end).toISOString(),allDay:!!r.allDay,recurrence};
 });await write(db,'private:'+user.id,{rows,expiresAt:Date.now()+7*86400000});return res.status(200).json({ok:true});
 }
 return fail(400,'Action inconnue.');
 }catch(e){return fail(e.status||502,e.status?e.message:'Action non confirmée : vérifiez la configuration Microsoft et le stockage des notifications.');}};}
export default createHandler();

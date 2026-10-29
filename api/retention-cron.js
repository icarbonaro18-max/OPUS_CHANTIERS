import {createHash,timingSafeEqual} from 'node:crypto';
import {scheduledRetention} from '../server/project-retention.js';
const digest=value=>createHash('sha256').update(value).digest();
export function createHandler({env=process.env,runner=scheduledRetention}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Méthode interdite.'});}
  const auth=req.headers.authorization;
  if(!env.CRON_SECRET||typeof auth!=='string'||auth.length>4096||!timingSafeEqual(digest(auth),digest('Bearer '+env.CRON_SECRET)))return res.status(401).json({error:'Accès refusé.'});
  try{return res.status(200).json(await runner(env));}
  catch{console.error('Conservation : exécution non confirmée.');return res.status(503).json({error:'Nettoyage non confirmé. Vérifier la configuration et les journaux serveur.'});}
 };
}
export default createHandler();

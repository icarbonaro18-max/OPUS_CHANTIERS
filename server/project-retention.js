import {Graph} from '../lib/cloud.js';
import {runRetention} from '../lib/project-archive-maintenance.js';
export {runRetention} from '../lib/project-archive-maintenance.js';

export function retentionConfigured(env){return ['RETENTION_TENANT_ID','RETENTION_CLIENT_ID','RETENTION_CLIENT_SECRET','RETENTION_DRIVE_ID','RETENTION_SITE_HOST','RETENTION_SITE_PATH'].every(key=>typeof env[key]==='string'&&env[key].trim());}
export async function scheduledRetention(env,{fetcher=fetch,runner=runRetention}={}){
 if(env.OPUS_RETENTION_ENABLED!=='true')return {disabled:true};
 if(env.OPUS_RETENTION_POLICY!=='permanent-onedrive-v1')return {disabled:true,reason:'permanent_archive_policy_not_activated'};
 if(!retentionConfigured(env))throw Error('Service de conservation non configuré.');
 if(!/^[a-z0-9.-]+\.sharepoint\.com$/i.test(env.RETENTION_SITE_HOST)||!env.RETENTION_SITE_PATH.startsWith('/sites/'))throw Error('Site de conservation invalide.');
 let cachedToken=null,expiresAt=0;
 const token=async({forceRefresh=false}={})=>{
  if(!forceRefresh&&cachedToken&&Date.now()<expiresAt)return cachedToken;
  const response=await fetcher('https://login.microsoftonline.com/'+encodeURIComponent(env.RETENTION_TENANT_ID)+'/oauth2/v2.0/token',{method:'POST',body:new URLSearchParams({client_id:env.RETENTION_CLIENT_ID,client_secret:env.RETENTION_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Connexion du service de conservation refusée.');const data=await response.json(),value=data.access_token;if(!value)throw Error('Jeton du service absent.');cachedToken=value;expiresAt=Date.now()+Math.max(0,Number(data.expires_in||300)-60)*1000;return value;
 };
 const graph=new Graph(token,fetcher);await graph.connect({siteHost:env.RETENTION_SITE_HOST,sitePath:env.RETENTION_SITE_PATH,driveId:env.RETENTION_DRIVE_ID});return runner(graph);
}

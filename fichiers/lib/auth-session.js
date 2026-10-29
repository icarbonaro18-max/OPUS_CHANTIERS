/* A transport failure is not an expired Microsoft session. Only explicit MSAL
 * interaction-required errors may offer an interactive sign-in. Never sign out
 * or clear the account/token cache here. */
import {CloudError} from './cloud.js';
const INTERACTIVE_CODES=new Set(['auth_required','interaction_required','login_required','consent_required','no_account_error']);
export function requiresInteractiveAuth(error){
 return error?.name==='InteractionRequiredAuthError'||INTERACTIVE_CODES.has(error?.errorCode||error?.code);
}
const interactions=new WeakMap();
// One interactive operation per MSAL client. Never queue a sign-out behind a
// sign-in or retry an interactive operation automatically.
export async function runAuthInteraction(msal,operation,onBusy=()=>{}){
 if(!msal)throw new CloudError('La connexion Microsoft se prépare. Réessayez dans un instant.',0,'auth_not_initialized');
 if(interactions.has(msal))throw new CloudError('Une fenêtre de connexion Microsoft est déjà en cours. Terminez-la ou fermez-la avant de réessayer.',0,'auth_busy');
 const marker={};interactions.set(msal,marker);
 try{onBusy(true);return await operation();}
 catch(cause){
  if((cause?.errorCode||cause?.code)==='interaction_in_progress'){
   const error=new CloudError('Une ancienne tentative de connexion bloque Microsoft. Utilisez « Relancer la connexion bloquée » après avoir fermé la fenêtre Microsoft précédente.',0,'auth_interaction_blocked');error.cause=cause;throw error;
  }
  throw cause;
 }finally{if(interactions.get(msal)===marker)interactions.delete(msal);onBusy(false);}
}
export function selectSessionAccount(msal,expectedHomeAccountId=''){
 const active=msal?.getActiveAccount();
 if(expectedHomeAccountId){
  if(active?.homeAccountId===expectedHomeAccountId)return active;
  const found=msal?.getAllAccounts?.().find(a=>a.homeAccountId===expectedHomeAccountId);
  if(found){msal.setActiveAccount(found);return found;}
  return null;
 }
 return active||null;
}
export async function acquireSessionToken(msal,scopes,{forceRefresh=false,account:requestedAccount,expectedHomeAccountId=''}={}){
 if(!msal)throw new CloudError('La connexion Microsoft n’est pas encore initialisée. Réessayez dans quelques instants.',0,'auth_not_initialized');
 const account=requestedAccount||selectSessionAccount(msal,expectedHomeAccountId);
 if(!account)throw new CloudError('Sélectionnez votre compte Microsoft pour vous connecter.',401,'auth_required');
 try{
  const response=await msal.acquireTokenSilent({scopes,account,forceRefresh});
  if(!response?.accessToken)throw new CloudError('Microsoft n’a pas renvoyé de jeton. Réessayez sans fermer votre fiche.',0,'token_response_invalid');
  return response.accessToken;
 }catch(cause){
  if(cause instanceof CloudError)throw cause;
  const interactive=requiresInteractiveAuth(cause);
  const error=new CloudError(interactive?'Microsoft demande de renouveler votre connexion. Votre saisie reste sur cet appareil.':'Connexion Microsoft momentanément indisponible. Réessayez sans fermer votre fiche.',interactive?401:0,interactive?'auth_required':'token_unavailable');
  error.cause=cause;error.authErrorCode=cause?.errorCode||cause?.code||cause?.name||'';
  if(cause?.claims)error.claims=cause.claims;
  throw error;
 }
}

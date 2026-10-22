/* A transport failure is not an expired Microsoft session. Only explicit MSAL
 * interaction-required errors may offer an interactive sign-in. Never sign out
 * or clear the account/token cache here. */
import {CloudError} from './cloud.js';
const INTERACTIVE_CODES=new Set(['auth_required','interaction_required','login_required','consent_required','no_account_error']);
export function requiresInteractiveAuth(error){
 return error?.name==='InteractionRequiredAuthError'||INTERACTIVE_CODES.has(error?.errorCode||error?.code);
}
export async function acquireSessionToken(msal,scopes,{forceRefresh=false,account:requestedAccount}={}){
 if(!msal)throw new CloudError('La connexion Microsoft n’est pas encore initialisée. Réessayez dans quelques instants.',0,'auth_not_initialized');
 const account=requestedAccount||msal.getActiveAccount();
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

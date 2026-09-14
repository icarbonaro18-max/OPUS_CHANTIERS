// Finish the redirect round trip before reading accounts or starting another interaction.
export async function initializeConnection(msal){
 await msal.initialize();
 const response=await msal.handleRedirectPromise();
 const account=response?.account||msal.getActiveAccount()||msal.getAllAccounts()[0];
 if(account)msal.setActiveAccount(account);
 return account;
}

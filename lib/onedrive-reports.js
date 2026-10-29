export function trustedOneDriveUrl(value,siteHost){
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname===siteHost&&!url.username&&!url.password&&!url.port?url.href:null;}catch{return null;}
}
export async function openReportOneDrive(ui,record){
 const host=ui.config?.siteHost||ui.c.getConfig?.()?.siteHost;
 let url=trustedOneDriveUrl(record.pdfWebUrl||record.oneDriveWebUrl||record.permanentArchive?.webUrl,host);
 // Open a blank window within the click gesture; later network work must not
 // cause the tablet browser to block the requested OneDrive navigation.
 const target=globalThis.window?.open?.('about:blank','_blank');if(target)target.opener=null;
 try{
  if(!url){const id=record.pdfFileId||record.oneDriveFolderId||record.permanentArchive?.pdfId||record.permanentArchive?.folderId;if(!id)throw Error('Le rapport doit d’abord être enregistré dans OneDrive.');const item=await ui.c.graph.item(id);url=trustedOneDriveUrl(item.webUrl,host);}
  if(!url)throw Error('Lien OneDrive non confirmé.');
  if(target){target.location.href=url;return;}
  ui.c.modal('Aller sur OneDrive','<p>Votre navigateur demande un nouveau clic pour ouvrir le document.</p><a id="reportOneDriveLink" class="button" target="_blank" rel="noopener noreferrer">Aller sur OneDrive</a>');document.getElementById('reportOneDriveLink').href=url;
 }catch(error){target?.close?.();ui.c.toast(error.message);}
}
export function bindOneDriveReports(ui,root){root.querySelectorAll('[data-onedrive-record]').forEach(button=>button.onclick=()=>{const record=ui.data[button.dataset.onedriveKind||'visits']?.find(row=>row.id===button.dataset.onedriveRecord);if(record)return openReportOneDrive(ui,record);});}

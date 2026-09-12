let fonts;
export async function installPdfFonts(pdf){
  fonts ||= Promise.all(['OpusSans.ttf','OpusSans-Bold.ttf'].map(async name=>{
    const response=await fetch(new URL('../assets/'+name,import.meta.url));
    if(!response.ok)throw new Error('Police PDF indisponible. Reconnectez-vous puis réessayez.');
    const bytes=new Uint8Array(await response.arrayBuffer());
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return [name,btoa(binary)];
  })).catch(e=>{fonts=null;throw e;});
  const loaded=await fonts;
  for(const [name,data] of loaded)pdf.addFileToVFS(name,data);
  pdf.addFont('OpusSans.ttf','OpusSans','normal');
  pdf.addFont('OpusSans-Bold.ttf','OpusSans','bold');
}

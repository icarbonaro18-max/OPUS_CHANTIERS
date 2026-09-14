import {jsPDF} from '../vendor/jspdf.js';
import {installPdfFonts} from '../lib/pdf-fonts.js';
export async function makePDF(order,{logo,supplierLogo='',project=''}={}){
 const p=new jsPDF({unit:'mm',format:'a4'});await installPdfFonts(p);p.setFont('OpusSans');let y=18;
 const line=(text,bold=false,size=10)=>{p.setFont('OpusSans',bold?'bold':'normal');p.setFontSize(size);const lines=p.splitTextToSize(String(text||''),174);for(const l of lines){if(y>272){p.addPage();y=20;}p.text(l,18,y);y+=size*.48;}y+=3;};
 p.setTextColor(12,61,99);if(logo){p.addImage(logo,'PNG',18,14,49,16);y=43;}
 if(supplierLogo){const a=p.getImageProperties(supplierLogo);const w=Math.min(40,16*a.width/a.height),h=w*a.height/a.width;p.addImage(supplierLogo,undefined,192-w,15,w,h);}
 line(order.internal?'BON INTERNE — DÉPÔT':'BON DE COMMANDE',true,20);line('Préparation et récupération du matériel',false,10);y+=4;
 line(order.supplier+' · '+order.number,true,13);
 line('Date : '+(order.date||'Non précisée')+'   |   Référence affaire : '+(order.clientReference||'Non précisée'));
 if(project)line('Chantier : '+project,true);
 line(order.internal?'RETRAIT AU DÉPÔT DE BUC':order.deliveryMode==='retrait'?'RETRAIT EN AGENCE':'LIVRAISON',true,11);line(order.destination);
 if(order.availability)line((order.internal?'État du bon interne : ':'Suivi fournisseur : ')+order.availability);
 if(order.notes)line('Consignes : '+order.notes);
 const header=()=>{if(y>254){p.addPage();y=20;}p.setFillColor(12,61,99);p.rect(18,y,174,9,'F');p.setTextColor(255);p.setFontSize(9);p.setFont('OpusSans','bold');p.text('RÉFÉRENCE',20,y+6);p.text('DÉSIGNATION',60,y+6);p.text('QTÉ / UNITÉ',164,y+6);p.setTextColor(12,61,99);y+=13;};header();
 p.setFontSize(9);
 for(const item of order.items){p.setFont('OpusSans','normal');const a=p.splitTextToSize(item.reference||'Non précisée',36),b=p.splitTextToSize(item.description,98),c=p.splitTextToSize(item.quantity+' '+item.unit,26),n=Math.max(a.length,b.length,c.length);for(let i=0;i<n;i++){if(y>267){p.addPage();y=20;header();p.setFont('OpusSans','normal');}if(a[i])p.text(a[i],20,y);if(b[i])p.text(b[i],60,y);if(c[i])p.text(c[i],164,y);y+=4.5;}y+=3;p.setDrawColor(218,228,235);p.line(18,y,192,y);y+=5;}
 for(let i=1;i<=p.getNumberOfPages();i++){p.setPage(i);p.setFontSize(8);p.setTextColor(100);p.text(order.internal?'OPUS ELEC · Bon interne de préparation et de récupération au dépôt':'OPUS ELEC · Document interne établi à partir de la commande fournisseur',18,283);p.text(`${i} / ${p.getNumberOfPages()}`,192,283,{align:'right'});p.text(order.internal?'État de récupération déclaré par le bureau.':'Ne remplace pas la confirmation ni le bon de livraison du fournisseur.',18,288);}
 return p.output('blob');
}

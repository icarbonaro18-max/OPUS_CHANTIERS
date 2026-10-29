import {deviceStorageInfo} from './device-storage.js';
export function canViewStorage(user,config){
 const owners=config?.storageOwnerUsers||['ignazio@opuselec.fr','IgnazioCARBONARO@OPUSELEC.onmicrosoft.com'];
 const ids=[user?.mail,user?.userPrincipalName].filter(Boolean).map(value=>value.toLowerCase());
 return owners.some(value=>ids.includes(value.toLowerCase()));
}
export const storageSize=n=>Number.isFinite(n)?(n>=1073741824?(n/1073741824).toFixed(2)+' Go':(n/1048576).toFixed(1)+' Mo'):'Non communiqué';
export function renderStorageGauge(host,info){
 host.replaceChildren();
 const label=document.createElement('p');label.textContent='Stockage de l’application sur cet appareil';host.append(label);
 const valid=Number.isFinite(info.usage)&&info.usage>=0&&Number.isFinite(info.quota)&&info.quota>0;
 if(valid){const gauge=document.createElement('meter');gauge.min=0;gauge.max=info.quota;gauge.value=Math.min(info.usage,info.quota);gauge.low=info.quota*.7;gauge.high=info.quota*.9;gauge.optimum=0;gauge.setAttribute('aria-label','Espace utilisé par OPUS sur cet appareil');gauge.style.width='100%';gauge.style.height='28px';host.append(gauge);}
 const detail=document.createElement('p');detail.textContent='Utilisé : '+storageSize(info.usage)+' · Disponible estimé : '+storageSize(valid?Math.max(0,info.quota-info.usage):null);host.append(detail);
 const help=document.createElement('small');help.textContent='Estimation du stockage autorisé par le navigateur pour OPUS sur cet appareil. Cette jauge ne mesure pas la mémoire vive ni tout le disque de la tablette.';host.append(help);
}
export async function refreshStorageGauge(button,{user,config,navigator}){
 button.hidden=!canViewStorage(user,config);if(button.hidden)return;
 const info=await deviceStorageInfo(navigator);if(!canViewStorage(user,config))return;
 button.textContent='Stockage · '+storageSize(info.usage)+' utilisés';button.title='Voir l’espace utilisé et disponible sur cet appareil';
 return info;
}

/* Published personnel, calendars and access rules must never be shadowed by a
 * previously saved full config.json. Device preferences cover connection only. */
const CONFIG_KEY='opus-cloud-config-v3';
const DEVICE_KEYS=['clientId','tenant','siteHost','sitePath','driveId','aiEndpoint'];
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function deviceConfigOverrides(value){
 if(!isObject(value))return {};
 return Object.fromEntries(DEVICE_KEYS.filter(key=>Object.hasOwn(value,key)&&typeof value[key]==='string').map(key=>[key,value[key]]));
}
export function loadAppConfig(published,storage){
 const config={...published};
 let saved;
 try{const raw=storage?.getItem(CONFIG_KEY);if(!raw)return config;saved=JSON.parse(raw);}catch{return config;}
 const overrides=deviceConfigOverrides(saved);
 // Historical device configuration was applied only after an application ID
 // had been supplied. Empty optional connection fields remain meaningful.
 if(!overrides.clientId?.trim())return config;
 const sameKeys=Object.keys(saved).length===Object.keys(overrides).length;
 const alreadyMinimal=sameKeys&&Object.keys(saved).every(key=>Object.hasOwn(overrides,key)&&saved[key]===overrides[key]);
 if(!alreadyMinimal){try{storage.setItem(CONFIG_KEY,JSON.stringify(overrides));}catch{/* Read-only storage must not prevent startup. */}}
 return {...config,...overrides};
}

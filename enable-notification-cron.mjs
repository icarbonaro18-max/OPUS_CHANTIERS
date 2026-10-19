// Run only after enabling a plan that supports a once-per-minute Vercel cron.
import {readFile,writeFile} from 'node:fs/promises';
const path='vercel.json',config=JSON.parse(await readFile(path,'utf8'));
config.crons=[...(config.crons||[]).filter(c=>c.path!=='/api/notification-cron'),{path:'/api/notification-cron',schedule:'* * * * *'}];
await writeFile(path,JSON.stringify(config,null,2)+'\n');
console.log('Déclencheur ajouté à vercel.json. Déployer après configuration des variables serveur.');

/*
 * INSERM - devis 1261. Initialisation des attestations BAES à partir des
 * contrôles archivés dans Microsoft 365 sous le devis 1240.
 * Aucune photo et aucune donnée de contrôle client n'est publiée sur GitHub.
 */
export const INSERM_1261_PROJECT_ID = '01VXF2LY6VYJBR256WSBEYT66ABLEC2VZA';
export const INSERM_1261_SOURCE_NAME = '001240';

export const INSERM_1261_SITES = [
  {
    slug: 'BIOPARK',
    nom: 'Biopark',
    sourceRecordId: '40486633304a442aa151b7b46e81e69c',
    sourceRef: 'BAES-001240-BIOPARK',
    blocs: [18],
    controleComplementaire: 'Contrôler la télécommande au poste de sécurité lors du remplacement du BAES n° 18, sous réserve d’accès. En cas de défaut, prévoir un devis complémentaire.'
  },
  {
    slug: 'FER-A-MOULIN',
    nom: 'Institut du Fer à Moulin',
    sourceRecordId: '69073e79bcc94677a98a5b9f5e2d8dd5',
    sourceRef: 'BAES-001240-FER-A-MOULIN',
    blocs: [1,19,38,46,47,51,52,53,54,56,59,62],
    controleComplementaire: 'Vérifier les 4 à 5 BAES du laboratoire non contrôlés en octobre. Ajouter chaque bloc identifié au formulaire. Ne déclarer aucun bloc conforme avant les essais.'
  },
  {
    slug: 'SAINT-ANTOINE',
    nom: 'Hôpital Saint-Antoine – Bâtiment Kourilsky',
    sourceRecordId: '99684f0e0ff04d5a83ec80bbac9f73c4',
    sourceRef: 'BAES-001240-SAINT-ANTOINE',
    blocs: [3,7,19,30,39,48,56,76,77,79,93,94,107,114,115,121],
    pictogramme: 110,
    controleComplementaire: 'Vérifier les 4 BAES non contrôlés du laboratoire lors des travaux d’éclairage. Ajouter chaque bloc identifié au formulaire. Remplacer la télécommande Merlin Gerin, puis tester les commandes de mise au repos et de remise en service.'
  }
];

const simpleId = (slug,n) => 'b1261_'+slug.replace(/[^A-Z0-9]/g,'')+'_'+n;
const trim = value => String(value == null ? '' : value).trim();
const numFrom = entry => Number((trim(entry?.repere).match(/\b(?:BAES|BARS)\s*(\d+)\b/i)||[])[1] || 0);

function originalBloc(state,num){
  const cards=Array.isArray(state?.baes)?state.baes:[];
  const byNumber=cards.find(b=>numFrom(b)===num);
  return byNumber || (cards[num-1] && (numFrom(cards[num-1])===num || !numFrom(cards[num-1])) ? cards[num-1] : null);
}

function blocTravaux(entry,num,site,operation){
  const date=trim(site.dateControle)||'octobre 2026';
  const observation=trim(entry?.observation)||'Anomalie signalée au rapport de contrôle initial.';
  return {
    id: simpleId(site.slug,num),
    repere:trim(entry?.repere)||'BAES '+num,
    emplacement:trim(entry?.emplacement),
    reference:'',
    type:trim(entry?.type)||'Évacuation',
    statut:'',
    duree:'',
    tests:{},
    observation:'',
    resultat:'',
    photo:'',
    photoAvant:entry?.photo||'',
    historique:'Contrôle initial du '+date+' : '+observation+' (résultat : '+(trim(entry?.resultat)||'à revoir')+').',
    interventionPrevue:operation,
    dateRemplacement:'',
    technicienRemplacement:''
  };
}

function telecommandeTravaux(entry,site){
  return {
    id:'tc1261_'+site.slug,
    repere:trim(entry?.repere)||'Télécommande du site',
    emplacement:trim(entry?.emplacement)|| (site.slug==='BIOPARK'?'Poste de sécurité':'TGBT'),
    reference:'',
    type:trim(entry?.type)||'Télécommande BAES centralisée',
    zone:trim(entry?.zone),
    tests:{},
    observation:'',
    resultat:'',
    photo:'',
    photoAvant:entry?.photo||'',
    historique:site.slug==='BIOPARK'
      ?'Télécommande non contrôlée en octobre 2026 : accès au poste de sécurité impossible.'
      :'Contrôle initial : '+(trim(entry?.resultat)||'non renseigné')+' ; '+(trim(entry?.observation)||'recontrôle après travaux'),
    interventionPrevue:site.slug==='SAINT-ANTOINE'?'Remplacement et essais':'Essais de mise au repos et remise en veille',
    dateRemplacement:'',
    technicienRemplacement:''
  };
}

export function preparerAttestation1261(spec,ancien,userName=''){
  if(!ancien?.state || !Array.isArray(ancien.state.baes))throw Error('Le contrôle BAES 1240 est incomplet pour '+spec.nom+'.');
  const previous=ancien.state;
  const site={...spec,dateControle:previous.dateControle};
  const baes=spec.blocs.map(num=>{
    const orig=originalBloc(previous,num);
    if(!orig)throw Error('BAES n° '+num+' introuvable dans le contrôle 1240 de '+spec.nom+'.');
    return blocTravaux(orig,num,site,'Remplacement complet du BAES');
  });
  if(spec.pictogramme){
    const orig=originalBloc(previous,spec.pictogramme);
    if(!orig)throw Error('BAES n° '+spec.pictogramme+' introuvable pour le pictogramme.');
    baes.push(blocTravaux(orig,spec.pictogramme,site,'Pose du pictogramme manquant, sans remplacement du BAES'));
  }
  const remote=Array.isArray(previous.telecommandes)?previous.telecommandes:[];
  const telecommandes=[
    telecommandeTravaux(remote[0]||{},site)
  ];
  const reference='BAES-001261-'+spec.slug;
  const now=new Date().toISOString();
  const adresse=trim(previous.adresse);
  const state={
    dateControle:'',
    reference,
    technicien:'',
    client:'INSERM',
    adresse,
    operation:'Devis n° 1261 – Travaux de remise en état et levée des réserves – '+spec.nom,
    intervention:'Autre',
    interventionAutre:'Remplacement de BAES / levée des réserves',
    tests:[],
    dureeEssai:'',
    observationsGenerales:spec.controleComplementaire,
    conclusionGenerale:'',
    signature:'',
    baes,telecommandes
  };
  return {
    moduleKey:'baes',
    ref:reference,
    authorName:userName,
    createdAt:now,
    updatedAt:now,
    state,
    context:{
      client:'INSERM',
      adresse,
      siteName:spec.nom,
      devis:'001261',
      originalRef:spec.sourceRef,
      headers:{reference,client:'INSERM',adresse,site:spec.nom,ordre:'Devis n° 1261',technicien:''}
    }
  };
}

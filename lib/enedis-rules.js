export const VERSION='2026-09-13';
export const TYPES={new:'Nouveau raccordement individuel ≤ 36 kVA',move:'Déplacement de compteur / branchement',power:'Modification de puissance',phase:'Passage monophasé / triphasé',remove:'Suppression de branchement',temporary:'Branchement provisoire',collective:'Immeuble / plusieurs compteurs',large:'Raccordement > 36 kVA / HTA'};
export const SOURCES=[
 ['Raccordement individuel et mise en service','https://www.enedis.fr/raccordement-maison'],
 ['Formulaire individuel ≤ 36 kVA · MOP-RAC_003E v1, 03/07/2025','https://www.enedis.fr/media/4651/download'],
 ['Mandat officiel · MOP-RAC_046E v1, référence du 15/09/2025','https://www.enedis.fr/media/1926/download'],
 ['Modification d’installation','https://www.enedis.fr/je-modifie-mon-installation-electrique-professionnel-entreprise'],
 ['Modification de puissance · NMO-RAC_010E, 03/07/2025','https://www.enedis.fr/media/4663/download'],
 ['Bâtiments et opérations collectives','https://www.enedis.fr/raccordement-batiment-professionnel-entreprise'],
 ['Branchement provisoire','https://www.enedis.fr/branchement-provisoire-professionnel-entreprise'],
 ['Référentiel et formulaires à jour','https://www.enedis.fr/documents']];
export function route(d){
 if(d.type==='temporary')return 'Fournisseur d’énergie pour un branchement provisoire classique. Examiner avec Enedis la solution définitive « 2 en 1 » si le chantier s’y prête.';
 if(['power','phase'].includes(d.type))return 'Fournisseur en premier pour le contrat existant. Les changements de segment de puissance et les contrats CARD nécessitent une orientation spécifique à confirmer avec Enedis.';
 if(d.type==='remove'&&d.contract!=='resilie')return 'Fournisseur : faire traiter la résiliation avant la suppression du branchement par Enedis.';
 return 'Enedis : préparer la demande dans le portail de raccordement, puis suivre les demandes de votre interlocuteur.';
}
export function requirements(d){
 const r=[],add=(id,label,level='requis',stage='depot',source=1)=>r.push({id,label,level,stage,source});
 if(d.mandate!=='none')add('mandat','Mandat officiel relu et signé par les deux parties','requis','depot',2);
 if(d.type==='new'){
 add('demande','Demande officielle renseignée et signée / saisie validée sur le portail');
 if(d.building==='immeuble'){add('syndic','Attestation d’information du syndic');add('plan_compteur','Plan de l’emplacement du comptage dans le local');if(d.pre1997!=='non')add('dta','Dossier technique amiante (immeuble avant 1997)',d.pre1997==='oui'?'requis':'a-confirmer');}
 else{add('situation','Plan de situation avec limites de parcelles');add('masse','Plan de masse : accès, CCPI, compteur, distances');add('cadastre','Plan cadastral');add('photos','Photographie de l’environnement du projet');}
 }
 if(['move','remove'].includes(d.type)){add('masse','Plan de masse du projet','requis','depot',3);add('photos','Photos de l’existant et de l’emplacement souhaité','conseille','depot',3);add('situation','Plan de situation','conseille','depot',3);}
 if(['power','phase'].includes(d.type)){add('facture','Facture / référence du contrat et PDL','conseille','depot',3);add('technique','Informations demandées par le fournisseur / Enedis','a-confirmer','depot',3);add('masse','Plan de masse si travaux sur le branchement','a-confirmer','depot',3);}
 if(['collective','large'].includes(d.type)){add('masse','Plan de masse de l’opération','requis','depot',5);add('collecte','Fiches de collecte et étude adaptées à la puissance','requis','depot',5);if(d.type==='collective')add('colonnes','Schémas des colonnes électriques et liste des lots / puissances','requis','depot',5);add('validation','Liste spécifique des pièces confirmée par Enedis','requis','depot',5);}
 if(['new','collective','large'].includes(d.type)&&d.urban!=='non')add('urbanisme','Autorisation d’urbanisme intégrale',d.urban==='oui'?'requis':'a-confirmer');
 if(d.pac==='oui')add('constructeur','Déclaration constructeur NF EN 61000-3-3, si applicable','a-confirmer');
 if(d.owner==='non')add('proprietaire','Accord propriétaire / droits permettant les travaux','a-confirmer');
 if(d.access==='non')add('tiers','Accord de passage / servitude pour parcelle tierce','a-confirmer');
 if(d.tva==='oui')add('tva','Annexe de TVA du formulaire officiel renseignée','requis');
 if(d.type==='temporary'){add('engagement','Lettre d’engagement délivrée par Enedis et signée','requis','travaux',6);add('materiel','Préparation du matériel selon les instructions Enedis','a-confirmer','travaux',6);}
 if(d.type==='remove')add('resiliation','Confirmation de résiliation du contrat','requis','travaux',3);
 if(['new','collective','large'].includes(d.type)){add('offre','Offre de raccordement signée','requis','travaux',0);add('acompte','Justificatif de l’acompte prévu par l’offre','requis','travaux',0);add('consuel','Attestation CONSUEL visée','requis','service',0);add('solde','Règlement des travaux de raccordement','requis','service',0);add('contrat','Contrat fournisseur pour la mise en service','requis','service',0);}
 for(const x of d.extra||[])add(x.id,x.label,x.level||'requis',x.stage||'depot',7);
 return r;
}
export function errors(d){const e=[];for(const[k,l]of [['client','Client'],['address','Adresse du chantier'],['zip','Code postal'],['city','Commune'],['description','Description du projet'],['wanted','Date souhaitée']])if(!String(d[k]||'').trim())e.push(l+' à renseigner');
 if(d.zip&&!/^\d{5}$/.test(d.zip))e.push('Code postal : 5 chiffres attendus');
 if(d.pdl&&!/^\d{14}$/.test(d.pdl))e.push('PDL / PRM : 14 chiffres attendus');
 if(['move','power','phase','remove'].includes(d.type)&&!d.pdl)e.push('PDL / PRM à renseigner');
 if(d.type!=='remove'&&!(Number(d.power)>0))e.push('Puissance souhaitée à préciser');
 if(d.type==='new'&&Number(d.power)>36)e.push('Choisir le parcours > 36 kVA');
 if(d.phase==='Monophasé'&&Number(d.power)>12)e.push('Monophasé > 12 kVA : configuration à revoir avec Enedis');
 if(!d.email&&!d.phone)e.push('Coordonnée de contact client à renseigner');
 if(d.type==='temporary'&&(!d.end||d.end<d.wanted))e.push('Date de fin du provisoire à renseigner après le début');
 if(d.type==='new'&&!d.cadastre)e.push('Référence cadastrale à renseigner');
 if(!d.mandate)e.push('Choix de représentation à préciser');
 if(['new','collective','large'].includes(d.type)&&(!d.urban||d.urban==='inconnu'))e.push('Situation d’urbanisme à confirmer');
 if(['new','move','collective','large'].includes(d.type)){if(!d.owner||d.owner==='inconnu')e.push('Qualité de propriétaire à confirmer');if(!d.access||d.access==='inconnu')e.push('Accès au domaine public à confirmer');}
 if(!d.reviewed)e.push('Relecture de la fiche à confirmer');return e;}
export function pieceState(d,r){const p=d.pieces?.[r.id]||{};const files=(d.attachments||[]).filter(a=>a.category===r.id);if(p.state==='sans-objet')return p.note?.trim()?'Sans objet justifié':'Justification manquante';if(p.state==='portail')return p.note?.trim()?'Validé sur portail (déclaré)':'Référence portail manquante';if(p.state==='verifie'&&files.length)return 'Pièce vérifiée';return files.length?'À vérifier':'Manquant';}
export function blockers(d){return [...errors(d),...requirements(d).filter(r=>r.stage==='depot'&&r.level!=='conseille'&&!['Pièce vérifiée','Sans objet justifié','Validé sur portail (déclaré)'].includes(pieceState(d,r))).map(r=>r.label+' : '+pieceState(d,r))];}
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safe=s=>String(s||'document').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);

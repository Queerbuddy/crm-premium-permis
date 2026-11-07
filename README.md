# CRM Premium Permis

Petit CRM des 2 agences (Boissy-Saint-Léger et Paris 5e), séparé du site.

- **Essayer** : double-cliquer sur `index.html` → mode démo (données fictives, dans ce navigateur).
- **Mettre en ligne** : suivre `GUIDE-MISE-EN-LIGNE.md`.

## Ce que fait la version 1
- Les 9 formulaires du site arrivent tout seuls (webhook Netlify → fonction Supabase `demande-site`), chacun avec sa règle :
  | form_name | Source dans le CRM | Tâche créée |
  |---|---|---|
  | rappel-accueil, rappel | Site : rappel | Rappeler sous 24 h |
  | inscription | Site : inscription (prospect chaud) | Rappeler sous 2 h pour finaliser |
  | devis | Site : devis (prospect chaud) | Envoyer le devis sous 4 h |
  | contact | Site : question | Répondre sous 24 h |
  | info-appli | Site : info appli | Répondre sous 24 h |
  | liste-attente | Appli : liste d'attente | Selon la situation, sous 48 h (pas d'agence → rangé à Boissy, signalé) |
  | chatbot (assistant du site) | Site : assistant (lead qualifié) | Rappeler selon « debut » : dès que possible → 2 h (prospect chaud), dans le mois → 24 h, plus tard / se renseigne → 72 h. « Je ne sais pas encore » comme agence → rangé à Boissy, signalé |
  | black-friday | Site : offre (prospect chaud) | Rappeler sous 24 h + rappel 3 j avant la date limite de passage en agence ; fiche liée à l'offre par le code promo |
  | autre nom | Site : autre | Traiter sous 24 h |
  Ce tableau existe en double : `workflows.js` (démo) et `supabase/functions/demande-site/index.ts` (en ligne).
- Une fiche par prospect / élève, avec historique (demandes, appels, notes, étapes).
- Pipeline (parcours d'Adama) : Nouveau → Rappelé → RDV pris → Venu au RDV → Inscrit (Klaxo) → Code → Conduite → Permis obtenu / Perdu (glisser-déposer). Boutons « Il est venu / Pas venu » le jour du RDV (absences comptées), n° d'élève Klaxo sur la fiche, carte « Parcours » au tableau de bord (taux RDV, venue, inscription par agence). Base : `supabase/etapes-klaxo.sql`.
- Rendez-vous en ligne (Cal.com, un lien par agence ; webhook → fonction Supabase `rdv-calcom`), workflow 8 :
  RDV réservé → fiche retrouvée (n° de réservation, téléphone ou e-mail) ou créée (source « Site : rendez-vous »), étape « RDV pris » + date, rappels d'avant fermés, tâche « Confirmer le RDV (la veille) », e-mail à l'agence, alerte si le RDV tombe après la date limite d'une offre ;
  déplacé → nouvelle date et confirmation déplacée ; annulé → retour en « Rappelé » + tâche « le rappeler sous 2 h ». Agence = lien contenant « paris » ou non. Base : `supabase/calcom.sql`. Bouton « Simuler un RDV Cal.com » en démo.
- Tâches et rappels, en retard en rouge.
- Alertes : e-mail à chaque demande (Resend), alerte dans le CRM et notification du navigateur.
- Workflows automatiques (fichier `workflows.js`) :
  1. nouvelle demande → tâche adaptée au formulaire (tableau ci-dessus) pour l'agence choisie ;
  2. changement d'étape → tâche suivante (relance à 3 j, confirmer le RDV la veille, accueil de l'élève…) ;
  3. appel « pas de réponse » → nouvel essai demain, SMS/WhatsApp au 3e échec ; « a répondu » → passe en Rappelé.
- Tableau de bord : demandes par semaine et par agence, taux d'inscription, délai du 1er appel, sources.
- Origine publicitaire : chaque fiche garde utm_*, gclid, fbclid, page_arrivee, site_precedent (1re origine connue). Carte « Publicités » : demandes, RDV, inscrits, taux et perdus par canal (Google Ads, Facebook/Instagram Ads, Google gratuit, direct…), par campagne ou par annonce.
- Paiements (directeur + secrétariat, pas les moniteurs) : prix total, paiements reçus, reste à payer, paiement en 2 à 10 fois avec une tâche de rappel par échéance, page Paiements (encaissé du mois, retards, élèves qui doivent, par mois/agence/moyen), export Excel. Workflow 5 : un 1er paiement sur un prospect le passe en Inscrit. Base : `supabase/paiements.sql`.
- Offres (directeur + secrétariat) : page « Offres » par code promo (demandes, venus en agence, inscrits, délai dépassé), date limite = date fixe de l'offre (Black Friday : 1er décembre) sinon demande + délai, alignée sur les fiches si on la change, rappel auto 3 j avant (workflow 7), code saisissable à la main sur la fiche, création/modification d'offres par le directeur. Base : `supabase/offres.sql` (crée Black Friday 2026, BLACKPERMIS26, limite fixe 1er déc.).
- Sauvegarde : « Sauvegarder tout » / « Restaurer… » (directeur, page Contacts), rappel automatique chaque semaine (workflow 4) ; réveil quotidien de Supabase par GitHub Actions (`.github/workflows/reveil-supabase.yml`).
- Rôles : directeur (tout), secrétariat (son agence), moniteur (élèves inscrits de son agence).

## Fichiers
| Fichier | Rôle |
|---|---|
| `index.html`, `app.css`, `app.js` | les écrans |
| `donnees.js` | lecture/écriture (démo ou Supabase) |
| `workflows.js` | listes et règles automatiques |
| `config.js` | adresse et clé publique Supabase (vide = démo) |
| `supabase/schema.sql` | tables et règles d'accès |
| `supabase/etapes-klaxo.sql` | nouveau parcours RDV → venue → Klaxo (à lancer si schema.sql a déjà été lancé) |
| `supabase/offres.sql` | offres et codes promo, avec Black Friday 2026 |
| `supabase/paiements.sql` | table des paiements (à lancer après schema.sql) |
| `supabase/functions/demande-site/index.ts` | réception des formulaires du site |
| `supabase/functions/rdv-calcom/index.ts` | réception des rendez-vous Cal.com (logique recopiée dans `workflows.js`, `CRM.calcom`) |
| `supabase/calcom.sql` | n° de réservation Cal.com sur les fiches |

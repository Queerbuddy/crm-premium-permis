# Mettre le CRM en ligne, pas à pas

Durée : environ 45 minutes, une seule fois. Coût : 0 €.
Le site de l'auto-école n'est **pas** modifié et **aucun crédit Netlify** n'est utilisé.

Qui fait quoi :

- **Supabase** garde les données, gère les connexions et reçoit les demandes du site ;
- **GitHub Pages** affiche les écrans du CRM (Supabase ne sait pas afficher des pages web) ;
- **Resend** envoie les e-mails d'alerte (facultatif).

Si vous bloquez à une étape, faites une capture d'écran et envoyez-la-moi.

---

## Étape 0 : essayer le CRM sur votre Mac (mode démo)

1. Ouvrez le Finder, puis le disque **T5**, puis le dossier **crm-premium-permis**.
2. Double-cliquez sur **index.html**. Le CRM s'ouvre dans votre navigateur.
3. Choisissez un rôle (Adama, Secrétariat Boissy…). Tout est fictif et reste sur votre ordinateur.
4. Essayez le bouton **Simuler une demande du site** : une fiche et une tâche « Rappeler sous 24 h » apparaissent.

---

## Étape 1 : créer le projet Supabase

1. Allez sur **supabase.com** et cliquez sur **Start your project**. Créez le compte vous-même, avec l'e-mail de l'auto-école.
2. Cliquez sur **New project**.
   - Name : `crm-premium-permis`
   - Database Password : cliquez sur **Generate a password**, puis **notez-le dans un endroit sûr**.
   - Region : **West EU (Paris)**
   - Plan : **Free**
3. Cliquez sur **Create new project** et attendez environ 2 minutes.

## Étape 2 : créer la base de données

1. Dans le menu de gauche, cliquez sur **SQL Editor**.
2. Cliquez sur **New query**.
3. Sur votre Mac, ouvrez le fichier `crm-premium-permis/supabase/schema.sql` avec **TextEdit**. Faites Cmd+A puis Cmd+C.
4. Revenez dans Supabase, cliquez dans la grande zone blanche, puis Cmd+V.
5. Cliquez sur **Run** (en bas à droite). Le message attendu est « Success. No rows returned ».

### Étape 2 bis : le suivi des paiements

Refaites la même manipulation avec le fichier `supabase/paiements.sql` : ouvrez **New query**, collez le contenu du fichier, puis cliquez sur **Run**. Le message attendu est « Success ». Ce fichier ajoute les paiements, et les moniteurs ne voient pas l'argent.

### Étape 2 ter : le parcours RDV → venue → Klaxo

Refaites encore la même manipulation avec le fichier `supabase/etapes-klaxo.sql`. Il met en place le parcours voulu par Adama : RDV pris, puis venu au RDV, puis inscrit dans Klaxo. Il ajoute aussi le numéro d'élève Klaxo. Si votre projet est tout neuf, ce n'est pas obligatoire, mais il ne casse rien.

### Étape 2 quater : les offres (Black Friday)

Même manipulation avec `supabase/offres.sql`. Il crée la partie « Offres » et l'offre **Black Friday 2026** :
- code `BLACKPERMIS26` ;
- 100 € offerts et paiement en 3 fois sans frais ;
- demandes du 9 novembre au 1er décembre ;
- passage en agence au plus tard le **1er décembre** (date limite fixe).

### Étape 2 quinquies : les rendez-vous Cal.com

Même manipulation avec `supabase/calcom.sql`. Il ajoute le numéro de réservation Cal.com sur chaque fiche. Grâce à lui, le CRM retrouve la bonne fiche quand un élève déplace ou annule son rendez-vous.

**Ordre des fichiers SQL** : `schema.sql`, puis `paiements.sql`, puis `etapes-klaxo.sql`, puis `offres.sql`, puis `calcom.sql`.

⚠️ La fonction `demande-site` a changé : si elle est déjà installée (étape 6), recollez son code et cliquez de nouveau sur **Deploy**.

## Étape 3 : relier les écrans à Supabase

1. Dans Supabase, cliquez sur **Project Settings** (la roue dentée en bas à gauche), puis sur **API** (ou **Data API**).
2. Copiez la **Project URL**. Elle ressemble à `https://abcdefgh.supabase.co`.
3. Allez ensuite dans **API Keys** et copiez la clé **anon public** (ou **publishable**).
   ⚠️ Ne copiez **jamais** la clé « service_role » ou « secret ».
4. Ouvrez `crm-premium-permis/config.js` avec TextEdit. Collez les deux valeurs entre les guillemets :
   ```
   supabaseUrl: 'https://abcdefgh.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi…',
   ```
5. Enregistrez le fichier avec Cmd+S.

> Pour revenir au mode démo plus tard, il suffit de vider ces deux valeurs.

## Étape 4 : publier les écrans sur GitHub Pages

1. Ouvrez **GitHub Desktop**.
2. Cliquez sur le menu **File**, puis sur **Add Local Repository…**, et choisissez le dossier `crm-premium-permis`.
3. GitHub Desktop indique que ce n'est pas encore un dépôt : cliquez sur **create a repository**, puis sur **Create Repository**.
4. Faites votre commit comme d'habitude (par exemple « CRM v1 »), puis cliquez sur **Publish repository**.
   - **Décochez** « Keep this code private ». GitHub Pages n'est gratuit que pour les dépôts publics.
   - Ce n'est pas grave : le code ne contient aucune donnée d'élève ni aucun mot de passe. Les données restent dans Supabase, protégées par la connexion.
5. Sur **github.com**, ouvrez le dépôt `crm-premium-permis`. Cliquez sur **Settings**, puis sur **Pages**.
   - Source : **Deploy from a branch**
   - Branch : **main**, dossier **/ (root)**
   - Cliquez sur **Save**.
6. Attendez 1 à 2 minutes. L'adresse s'affiche en haut de la page, par exemple `https://votre-compte.github.io/crm-premium-permis/`. **Notez-la.**

## Étape 5 : régler les connexions dans Supabase

1. Cliquez sur **Authentication**, puis sur **Sign In / Providers**. **Désactivez « Allow new users to sign up »**. Ainsi, seules les personnes que vous invitez peuvent entrer.
2. Toujours dans Authentication, cliquez sur **URL Configuration**.
   - Site URL : collez l'adresse GitHub Pages notée à l'étape 4.
   - Redirect URLs : cliquez sur **Add URL** et collez la même adresse.
3. Créez votre propre compte : **Authentication > Users > Add user > Create new user**. Tapez votre e-mail, choisissez vous-même un mot de passe et cochez **Auto Confirm User**.
4. Donnez-vous le rôle de directeur. Retournez dans **SQL Editor > New query**, collez la ligne ci-dessous en remplaçant l'e-mail par le vôtre, puis cliquez sur **Run** :
   ```sql
   update profils set role = 'directeur', nom = 'Adama' where email = 'votre-email@exemple.fr';
   ```
5. Ouvrez l'adresse GitHub Pages et connectez-vous. Le CRM est en ligne, encore vide.

## Étape 6 : la fonction qui reçoit les demandes du site

1. Dans Supabase, cliquez sur **Edge Functions**, puis sur **Deploy a new function**, puis sur **Via Editor**.
2. Nom de la fonction : `demande-site` (exactement ce nom).
3. Effacez le code d'exemple. Ouvrez `crm-premium-permis/supabase/functions/demande-site/index.ts` avec TextEdit, copiez tout le contenu et collez-le.
4. Cliquez sur **Deploy function**.
5. Ouvrez la fonction, puis l'onglet **Details** (ou **Settings**). **Désactivez « Enforce JWT verification »** (parfois appelé « Verify JWT »), puis enregistrez. Netlify ne sait pas envoyer ce jeton : c'est le « mot secret » de l'étape suivante qui protège la fonction.
6. Copiez l'adresse de la fonction (**Endpoint URL**). Elle ressemble à `https://abcdefgh.supabase.co/functions/v1/demande-site`.
7. Cliquez sur **Edge Functions**, puis sur **Secrets**, puis sur **Add new secret**, et ajoutez :
   | Name | Value |
   |---|---|
   | `NETLIFY_WEBHOOK_SECRET` | inventez une longue phrase sans espace, par exemple `permis-boissy-paris-2026-tournesol-47`. Notez-la. |
   | `CRM_URL` | l'adresse GitHub Pages (pour le lien « Ouvrir la fiche » dans l'e-mail) |

## Étape 7 : les e-mails d'alerte (facultatif, gratuit)

1. Créez vous-même un compte sur **resend.com**.
2. Cliquez sur **API Keys**, puis sur **Create API Key**. Donnez-lui un nom (par exemple « crm ») et copiez la clé (elle commence par `re_`).
3. Dans Supabase, ouvrez **Edge Functions > Secrets** et ajoutez :
   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | la clé `re_…` |
   | `EMAIL_DEFAUT` | **l'e-mail avec lequel vous avez créé le compte Resend** |

   Tant que le domaine premiumpermis.fr n'est pas vérifié chez Resend, celui-ci ne peut écrire qu'à l'adresse de votre compte.
   Plus tard, vous pourrez vérifier le domaine dans Resend (rubrique **Domains**) puis ajouter `EMAIL_BOISSY`, `EMAIL_PARIS` et `EMAIL_EXPEDITEUR` (par exemple `CRM Premium Permis <crm@premiumpermis.fr>`). Chaque agence recevra alors ses propres alertes.

## Étape 8 : brancher le site Netlify sur le CRM

Cette étape ne redéploie pas le site, donc **elle ne consomme aucun crédit**.

1. Sur **app.netlify.com**, ouvrez le projet **premiumpermiswebsite**.
2. Cliquez sur **Project configuration** (ou **Site configuration**), puis sur **Notifications**.
3. Dans la partie **Emails and webhooks**, sous **Form submission notifications**, cliquez sur **Add notification**, puis sur **HTTP POST request**.
4. Remplissez :
   - Event to listen for : **New form submission**
   - URL to notify : l'adresse de la fonction, notée à l'étape 6.6
   - JWS secret token : **la même phrase** que `NETLIFY_WEBHOOK_SECRET`
   - Form : **Any form**
5. Cliquez sur **Save**.

## Étape 9 : test en vrai

1. Ouvrez le CRM dans un onglet et le site dans un autre.
2. Sur le site, remplissez le formulaire « Être rappelé » avec votre propre prénom et votre numéro.
3. Dans les secondes qui suivent :
   - une alerte « Nouvelle demande » apparaît dans le CRM ;
   - la fiche est dans le Pipeline, colonne **Nouveau** ;
   - une tâche « Rappeler … » est prévue pour le lendemain ;
   - un e-mail arrive (si vous avez fait l'étape 7).
4. Si rien n'arrive, faites une capture de **Supabase > Edge Functions > demande-site > Logs** et envoyez-la-moi.
5. Supprimez ensuite la fiche de test : ouvrez-la, puis cliquez sur **Supprimer cette fiche** (en bas).

## Étape 10 : inviter l'équipe

1. Ouvrez **Supabase > Authentication > Users > Invite user**, tapez l'e-mail de la personne et cliquez sur **Invite**.
2. La personne reçoit un e-mail, clique sur le lien et choisit son mot de passe dans le CRM.
3. Dans le CRM, menu **Équipe**, choisissez son **rôle** et son **agence** :
   - **Secrétariat** : voit toutes les fiches de son agence ;
   - **Moniteur** : voit seulement les élèves inscrits de son agence ;
   - **Directeur** : voit les 2 agences et gère l'équipe.

   Tant que l'agence n'est pas choisie, la personne ne voit rien.
4. Sur chaque poste, cliquez une fois sur **Activer les alertes** (tableau de bord). Les nouvelles demandes s'affichent alors même quand l'onglet est en arrière-plan.

## Étape 11 : marquer les publicités (pour savoir quelle annonce amène les élèves)

Le site enregistre déjà l'origine de chaque visiteur. Pour que le CRM affiche le **nom exact de la campagne et de l'annonce**, il faut l'ajouter une fois dans chaque outil de pub.

**Google Ads**
1. Ouvrez **Google Ads**, cliquez sur **Admin** (la roue dentée), puis sur **Paramètres du compte**, puis sur **Suivi**.
2. Dans **Suffixe de l'URL finale**, collez :
   ```
   utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}
   ```
3. Cliquez sur **Enregistrer**.

Le CRM affichera alors les **numéros** de campagne et d'annonce. Vous retrouvez ces mêmes numéros dans Google Ads, en ajoutant la colonne « ID ».

**Facebook / Instagram (Meta)**
1. Dans le **Gestionnaire de publicités**, ouvrez chaque publicité.
2. Descendez jusqu'à **Paramètres d'URL** et collez :
   ```
   utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
   ```
3. Cliquez sur **Publier**. Ici, ce sont les **noms** de campagne et d'annonce qui s'affichent.

Sans ce réglage, le CRM reconnaît quand même une pub Google ou Facebook, mais il affiche « campagne non indiquée ».

Si vous aviez déjà fait l'étape 2 avant cette mise à jour, refaites-la une fois avec le nouveau `schema.sql` : il ajoute seulement les colonnes d'origine, sans rien effacer.

## Étape 12 : brancher Cal.com (rendez-vous en ligne)

Quand quelqu'un prend rendez-vous sur Cal.com, le CRM :
- retrouve sa fiche (même téléphone ou même e-mail) ou en crée une nouvelle, avec la source « Site : rendez-vous » ;
- la passe à l'étape **RDV pris**, avec la date et l'heure ;
- ferme les tâches « Rappeler… » devenues inutiles ;
- crée la tâche « Confirmer le RDV (la veille) » et envoie un e-mail à l'agence.

Si le rendez-vous est **déplacé**, la date et la tâche de confirmation suivent. S'il est **annulé**, la fiche revient en « Rappelé » et une tâche « le rappeler pour en fixer un autre » est créée pour dans 2 h.

**A. Installer la fonction dans Supabase**
1. Dans Supabase, cliquez sur **Edge Functions**, puis sur **Deploy a new function**, puis sur **Via Editor**.
2. Nom de la fonction : `rdv-calcom` (exactement ce nom).
3. Effacez le code d'exemple. Collez tout le contenu du fichier `supabase/functions/rdv-calcom/index.ts`, puis cliquez sur **Deploy function**.
4. Comme pour `demande-site`, **désactivez « Enforce JWT verification »**, puis enregistrez.
5. Copiez l'adresse de la fonction. Elle ressemble à `https://abcdefgh.supabase.co/functions/v1/rdv-calcom`.
6. Dans **Edge Functions > Secrets**, ajoutez `CALCOM_WEBHOOK_SECRET`. Inventez une nouvelle longue phrase sans espace (une autre que celle de Netlify) et notez-la.

**B. Le rendez-vous dans Cal.com** (un seul : « rendez-vous »)
1. Ouvrez le rendez-vous, puis l'onglet **Advanced**, puis **Booking questions**. Vérifiez ces questions :
   | Identifier (exactement) | Ce que c'est | Réglage |
   |---|---|---|
   | `formule` | Quel permis ? | type **Select** (un seul choix), plutôt que MultiSelect |
   | `lieu` | Paris 5 ou Boissy-Saint-Léger 94 | type **Select** : c'est lui qui range la fiche dans la bonne agence |
   | `attendeePhoneNumber` | Téléphone | à activer (l'œil) et à rendre **Required** : sans téléphone, le CRM retrouve la fiche par l'e-mail |
   | `motif` | M'inscrire / Me renseigner | « M'inscrire » marque la fiche « prospect chaud » |
2. La provenance (pub Google, Facebook, campagne…) est envoyée par le site lui-même : rien à ajouter dans Cal.com.

**C. Le webhook dans Cal.com**
1. Dans Cal.com, cliquez sur **Settings**, puis **Developer**, puis **Webhooks**, puis **New**.
2. Remplissez :
   - Subscriber URL : l'adresse de la fonction `rdv-calcom` (point A.5) ;
   - Secret : **la même phrase** que `CALCOM_WEBHOOK_SECRET` ;
   - Event triggers : cochez au moins **Booking created**, **Booking rescheduled** et **Booking cancelled** (le reste peut rester coché, le CRM l'ignore).
3. Laissez le « Payload template » vide, puis cliquez sur **Create webhook**.

**D. Tester**
1. Prenez un rendez-vous sur votre propre lien Cal.com, avec votre prénom et votre numéro.
2. Dans le CRM, la fiche doit apparaître en **RDV pris**, avec la date. Annulez ensuite le rendez-vous depuis l'e-mail de Cal.com : la fiche repasse en « Rappelé ».
   Pour tester la provenance, réservez depuis une page du site avec `?utm_source=test&utm_campaign=essai-crm` à la fin de l'adresse : la fiche doit indiquer « source test · campagne essai-crm ».
3. Si rien n'arrive, envoyez-moi une capture de **Supabase > Edge Functions > rdv-calcom > Logs**.

En mode démo, le bouton **Simuler un RDV Cal.com** permet d'essayer tout cela sans compte.

---

## Bon à savoir

- **Mise en veille** : un projet Supabase gratuit se met en pause après 7 jours **sans aucune activité**. Avec un usage quotidien, cela n'arrive pas. Sinon, il suffit de cliquer sur « Restore » dans Supabase.
- **Modifier les écrans** : changez les fichiers, puis Commit et Push dans GitHub Desktop. GitHub Pages se met à jour en 1 à 2 minutes.
- **Modifier les règles automatiques** (délais, textes des tâches) : fichier `workflows.js`.
- **Sauvegarde (à faire chaque semaine)** : dans le CRM, ouvrez la page **Contacts**, puis cliquez sur **Sauvegarder tout**. Ce bouton est réservé au directeur. Il télécharge un fichier `sauvegarde-crm-premium-permis-AAAA-MM-JJ.json` qui contient toutes les fiches, tout l'historique et toutes les tâches. Rangez-le sur le disque T5 ou dans Google Drive. Chaque semaine, le CRM vous crée la tâche « Faire la sauvegarde du CRM ». Elle se coche toute seule quand vous cliquez sur le bouton.
- **Restaurer** : sur la même page, cliquez sur **Restaurer…** et choisissez un fichier de sauvegarde. Rien n'est effacé : les fiches sauvegardées sont remises ou remplacées par leur version sauvegardée. Il faut ensuite recréer les comptes de l'équipe (étape 10).
- **Excel** : le bouton **Exporter (Excel)** télécharge seulement les fiches, pour les ouvrir dans un tableur.
- **Réveil automatique** : le fichier `.github/workflows/reveil-supabase.yml` fait une petite visite à Supabase chaque matin, pour que le projet ne se mette jamais en veille. Il démarre tout seul quand le dossier est publié sur GitHub et que `config.js` est rempli.
  - Pour vérifier qu'il marche : sur github.com, ouvrez le dépôt, cliquez sur l'onglet **Actions**, puis sur **Réveil Supabase**, puis sur **Run workflow**. Une coche verte veut dire que c'est bon.
  - ⚠️ Si personne ne modifie le dépôt pendant 60 jours, GitHub met ce réveil en pause et vous prévient par e-mail. Il suffit de cliquer sur **Enable workflow** dans l'onglet Actions.

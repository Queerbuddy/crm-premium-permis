/* CRM Premium Permis : listes communes et règles automatiques (workflows).
   Pour changer un délai ou le texte d'une tâche automatique, c'est ici. */
(function () {
  const HEURE = 3600 * 1000, JOUR = 24 * HEURE;

  // Parcours voulu par Adama : prise de RDV → venue au RDV → inscription dans Klaxo.
  const RDV = 'RDV pris', VENU = 'Venu au RDV', INSCRIT = 'Inscrit (Klaxo)';
  const ETAPES = ['Nouveau', 'Rappelé', RDV, VENU, INSCRIT, 'Code', 'Conduite', 'Permis obtenu', 'Perdu'];
  const ETAPES_ELEVE = [INSCRIT, 'Code', 'Conduite', 'Permis obtenu'];
  const rang = (e) => ETAPES.indexOf(e);
  // A atteint (ou dépassé) une étape ? Les dates gardent la trace même si la fiche passe ensuite en « Perdu ».
  const aAtteint = (c, e) => (e === RDV && c.rdv_pris_le) || (e === VENU && c.venu_le) || (e === INSCRIT && c.inscrit_le) || (c.etape !== 'Perdu' && rang(c.etape) >= rang(e));
  const AGENCES = ['Boissy', 'Paris 5e'];
  const FORMULES = ['B manuelle', 'B automatique', 'Conduite accompagnée', 'Moto', 'Je ne sais pas'];
  const SOURCES = ['Site : rendez-vous', 'Site : offre', 'Site : assistant', 'Site : rappel', 'Site : inscription', 'Site : devis', 'Site : question', 'Site : info appli', "Appli : liste d'attente", 'Site : contact', 'Téléphone', 'Passage en agence', 'WhatsApp', 'Bouche-à-oreille', 'Réseaux sociaux', 'Autre'];
  const RAISONS_PERTE = ['Pas de réponse', 'Trop cher', 'Autre auto-école', 'Projet reporté', 'Hors zone', 'Autre'];

  const dans = (ms) => new Date(Date.now() + ms).toISOString();
  const nomCourt = (c) => (c.prenom || c.nom || 'le prospect');

  /* Workflow 1 : une demande arrive du site → fiche + historique + tâche adaptée au formulaire.
     ⚠️ Même tableau recopié dans supabase/functions/demande-site/index.ts : changer les deux. */
  const FORMULAIRES = {
    'rappel-accueil': { source: 'Site : rappel', heures: 24, titre: (p) => `Rappeler ${p} (demande de rappel, accueil)` },
    'rappel': { source: 'Site : rappel', heures: 24, titre: (p) => `Rappeler ${p} (demande de rappel)` },
    'inscription': { source: 'Site : inscription', heures: 2, chaud: true, titre: (p) => `Prospect chaud : rappeler ${p} pour finaliser l'inscription` },
    'devis': { source: 'Site : devis', heures: 4, chaud: true, titre: (p, d) => `Envoyer le devis${d.formule ? ' ' + d.formule : ''} à ${p}` },
    'contact': { source: 'Site : question', heures: 24, titre: (p) => `Répondre à la question de ${p}` },
    'info-appli': { source: 'Site : info appli', heures: 24, titre: (p) => `Répondre à ${p} (question sur l'appli)` },
    'liste-attente': {
      source: "Appli : liste d'attente", heures: 48, sansAgence: true,
      titre: (p, d) => /premium/i.test(d.situation || '') ? `Élève inscrit : vérifier l'accès de ${p} à l'appli`
        : /autre/i.test(d.situation || '') ? `${p} est dans une autre auto-école : lui présenter nos formules`
        : `${p} veut l'appli : lui proposer une inscription`,
    },
  };
  // Page offre-black-friday.html (le code promo relie la demande à une offre, voir la page Offres).
  FORMULAIRES['black-friday'] = { source: 'Site : offre', heures: 24, chaud: true, titre: (p, d) => `Rappeler ${p} (offre ${(d.code_promo || 'Black Friday').toUpperCase()}) pour fixer son passage en agence` };
  // « chatbot » : l'assistant du site. Lead déjà qualifié ; la priorité dépend de « debut ».
  const DELAI_SELON_DEBUT = { 'Dès que possible': 2, 'Dans le mois': 24, 'Dans 2 ou 3 mois': 72, 'Je me renseigne': 72 };
  FORMULAIRES.chatbot = {
    source: 'Site : assistant', heures: 24, sansAgence: true,
    ajuster: (d) => ({ heures: DELAI_SELON_DEBUT[d.debut] || 24, chaud: d.debut === 'Dès que possible' }),
    titre: (p, d) => `${d.debut === 'Dès que possible' ? 'Prospect chaud : ' : ''}rappeler ${p} (assistant${d.permis ? ', ' + d.permis : ''}${d.code ? ', code : ' + d.code : ''}${d.debut ? ', ' + d.debut.toLowerCase() : ''})`,
  };
  const agenceInconnue = (d) => !d.agence || /sais pas/i.test(d.agence);
  // L'assistant envoie « permis » (ex. « Permis B manuelle », « Moto (A1 / A2) ») au lieu de « formule ».
  const formuleDe = (d) => d.formule || (d.permis ? d.permis.replace(/^Permis /, '').replace(/^Moto.*/, 'Moto').replace(/^Autre.*/, 'Je ne sais pas') : '');
  function regleFormulaire(nom, d = {}) {
    const r = FORMULAIRES[nom];
    if (r && r.ajuster) return { ...r, ...r.ajuster(d) };
    return r || { source: 'Site : autre', heures: 24, titre: (p) => `Traiter la demande de ${p} (formulaire « ${nom} »)` };
  }
  function tacheNouvelleDemande(c, formulaire = 'rappel', d = {}) {
    const r = regleFormulaire(formulaire, d);
    const t = r.titre(nomCourt(c), d);
    return { titre: t.charAt(0).toUpperCase() + t.slice(1), echeance: dans(r.heures * HEURE), auto: true };
  }

  /* Workflow 2 : quand une fiche change d'étape, on prépare la suite. */
  function apresChangementEtape(c, nouvelle) {
    const t = [];
    if (nouvelle === 'Rappelé') t.push({ titre: `Relancer ${nomCourt(c)} si pas de RDV fixé`, echeance: dans(3 * JOUR), auto: true });
    if (nouvelle === RDV) {
      const rdv = c.rdv_le ? new Date(c.rdv_le).getTime() : 0;
      const veille = rdv ? Math.max(Date.now(), rdv - JOUR) : Date.now() + JOUR;
      t.push({ titre: `Confirmer le RDV de ${nomCourt(c)} (la veille)`, echeance: new Date(veille).toISOString(), auto: true });
    }
    if (nouvelle === VENU) t.push({ titre: `Inscrire ${nomCourt(c)} dans Klaxo (dossier + 1er paiement)`, echeance: dans(4 * HEURE), auto: true });
    if (nouvelle === INSCRIT) t.push({ titre: `Accueil de ${nomCourt(c)} : dossier complet + accès à l'appli de code`, echeance: dans(2 * JOUR), auto: true });
    if (nouvelle === 'Code') t.push({ titre: `Point d'étape code avec ${nomCourt(c)}`, echeance: dans(21 * JOUR), auto: true });
    if (nouvelle === 'Permis obtenu') t.push({ titre: `Féliciter ${nomCourt(c)} et lui demander un avis Google`, echeance: dans(HEURE), auto: true });
    return t;
  }

  /* Offres (codes promo). Workflow 7 : une demande avec un code → fiche liée à l'offre, date limite
     de passage en agence (demande + délai), rappel 3 jours avant si la personne n'est pas encore venue.
     (Même logique côté serveur dans supabase/functions/demande-site.) */
  const ajouterJours = (iso, n) => { const x = new Date(iso.slice(0, 10) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  function offrePour(offres, code, formulaire) {
    const c = (code || '').trim().toUpperCase(), actives = (offres || []).filter((o) => o.actif !== false);
    return (c && actives.find((o) => o.code === c)) || (formulaire && actives.find((o) => o.formulaire === formulaire)) || null;
  }
  function liaisonOffre(offre, dateDemandeIso, code) {
    const jour = dateDemandeIso.slice(0, 10), limite = offre.limite_fixe || ajouterJours(jour, offre.delai_jours || 14);
    return { champs: { offre_id: offre.id, code_promo: (code || '').trim().toUpperCase() || offre.code, offre_limite: limite }, horsPeriode: jour < offre.debut || jour > offre.fin, limite };
  }
  function tacheOffre(c, offre, limite) {
    const rappel = new Date(ajouterJours(limite, -3) + 'T10:00:00');
    const jour = new Date(limite + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return { titre: `Offre ${offre.nom} : ${nomCourt(c)} doit passer en agence avant le ${jour}`, echeance: (rappel > new Date() ? rappel : new Date(Date.now() + HEURE)).toISOString(), auto: true };
  }
  const TACHE_OFFRE = /^Offre .* doit passer en agence/;

  /* Workflow 6 : le jour du RDV. Venu → étape « Venu au RDV » (puis tâche « inscrire dans Klaxo ») ;
     absent → on le note et on le rappelle vite pour un autre RDV. */
  function apresRdv(c, venu) {
    if (venu) return { etape: VENU, taches: [] };
    return { etape: null, taches: [{ titre: `${nomCourt(c)} n'est pas venu au RDV : le rappeler pour en fixer un autre`, echeance: dans(2 * HEURE), auto: true }] };
  }

  /* Workflow 3 : résultat d'un appel.
     - « A répondu » sur une fiche Nouveau → passe en Rappelé (ce qui déclenche le workflow 2).
     - « Pas de réponse » → nouvel essai demain ; au 3e échec, tâche « envoyer un SMS ou WhatsApp ». */
  function apresAppel(c, aRepondu, nbEchecs) {
    if (aRepondu) return { etape: c.etape === 'Nouveau' ? 'Rappelé' : null, taches: [] };
    if (nbEchecs >= 3) return { etape: null, taches: [{ titre: `3 appels sans réponse : envoyer un SMS ou WhatsApp à ${nomCourt(c)}`, echeance: dans(HEURE), auto: true }] };
    return { etape: null, taches: [{ titre: `Rappeler ${nomCourt(c)} (essai n° ${nbEchecs + 1})`, echeance: dans(JOUR), auto: true }] };
  }

  /* Origine publicitaire d'un prospect (champs envoyés par tous les formulaires du site). */
  const CHAMPS_ORIGINE = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'page_arrivee', 'site_precedent'];
  const PAYANT = /cpc|ppc|paid|ads?$|cpm|display|sponsor|social[-_ ]?paid/i;
  function canal(c) {
    const src = (c.utm_source || '').toLowerCase(), med = c.utm_medium || '', prec = (c.site_precedent || '').toLowerCase();
    if (c.gclid || (/google|adwords|youtube/.test(src) && PAYANT.test(med))) return 'Google Ads';
    if (c.fbclid || (/facebook|fb|instagram|ig|meta/.test(src) && PAYANT.test(med))) return 'Facebook / Instagram Ads';
    if (/facebook|fb|instagram|ig|meta/.test(src)) return 'Facebook / Instagram (gratuit)';
    if (/google/.test(src)) return 'Google (autre)';
    if (src) return 'Autre pub : ' + c.utm_source;
    if (/google\./.test(prec)) return 'Google (recherche gratuite)';
    if (/facebook|instagram|fb\.|t\.co|tiktok|snapchat|linkedin/.test(prec)) return 'Réseaux sociaux (gratuit)';
    if (prec === 'accès direct') return 'Accès direct';
    if (prec) { try { return 'Autre site : ' + new URL(prec.startsWith('http') ? prec : 'https://' + prec).hostname.replace(/^www\./, ''); } catch (e) { return 'Autre site'; } }
    return 'Inconnue (hors site ou avant le suivi)';
  }
  const campagne = (c) => c.utm_campaign || (c.gclid || c.fbclid ? '(campagne non indiquée dans l\'annonce)' : '(sans campagne)');
  const annonce = (c) => c.utm_content || c.utm_term || (c.gclid || c.fbclid ? '(annonce non indiquée)' : '(sans annonce)');


  /* Workflow 8 : rendez-vous pris en ligne sur Cal.com (un lien par agence).
     ⚠️ Même logique côté serveur dans supabase/functions/rdv-calcom/index.ts : changer les deux.
     Réservé → étape « RDV pris » + date + « Confirmer le RDV (la veille) », rappels d'avant fermés ;
     déplacé → nouvelle date ; annulé → retour en « Rappelé » + « le rappeler pour un autre RDV ». */
  const AVANT_RDV = /^(Rappeler|Relancer|Prospect chaud|Répondre)|sans réponse|n'est pas venu|RDV annulé/;
  const CONFIRMER = /^Confirmer le RDV/;
  const valeurCal = (x) => {
    const v = x && typeof x === 'object' && 'value' in x ? x.value : x;
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(valeurCal).filter(Boolean).join(', ');
    if (typeof v === 'object') return [v.firstName, v.lastName].filter(Boolean).join(' ') || String(v.value || '');
    return String(v).trim();
  };
  function lireReservation(envoi) {
    const p = envoi.payload || {}, r = { ...(p.userFieldsResponses || {}), ...(p.responses || {}) }, invite = (p.attendees || [])[0] || {};
    const champ = (...noms) => noms.map((n) => valeurCal(r[n])).find(Boolean) || '';
    const nomV = r.name && typeof r.name === 'object' && 'value' in r.name ? r.name.value : r.name;
    const brut = nomV && typeof nomV === 'object' ? nomV : null, complet = (valeurCal(r.name) || invite.name || '').trim();
    const meta = p.metadata || {}, lieu = champ('lieu', 'agence');
    const quoi = lieu || (meta.page ? String(meta.page) : '') || [p.type, p.eventTitle, p.title].join(' ');
    const f = champ('formule', 'Formule').split(',')[0].replace(/^Permis\s+/i, '').trim(), origine = {};
    for (const k of CHAMPS_ORIGINE) origine[k] = (champ(k) || valeurCal((p.tracking || {})[k]) || valeurCal((p.metadata || {})[k])).slice(0, 300) || null;
    return {
      evenement: envoi.triggerEvent || '', uid: p.uid || p.bookingUid || '', ancienUid: p.rescheduleUid || p.fromReschedule || '', debut: p.startTime || '',
      prenom: ((brut && brut.firstName) || complet.split(/\s+/)[0] || '').trim(), nom: ((brut && brut.lastName) || complet.split(/\s+/).slice(1).join(' ')).trim(),
      tel: champ('telephone', 'attendeePhoneNumber', 'phone', 'location_phone') || invite.phoneNumber || '',
      email: (champ('email') || invite.email || '').toLowerCase(),
      agence: /paris/i.test(quoi) ? 'Paris 5e' : 'Boissy',
      formule: !f ? '' : FORMULES.find((x) => x.toLowerCase() === f.toLowerCase()) || (/moto|scooter|a1|a2|125/i.test(f) ? 'Moto' : /accompagn/i.test(f) ? 'Conduite accompagnée' : /auto/i.test(f) ? 'B automatique' : /manuel/i.test(f) ? 'B manuelle' : 'Je ne sais pas'),
      notes: champ('notes', 'message', 'additionalNotes') || p.additionalNotes || '', motif: p.cancellationReason || champ('rescheduleReason') || '',
      but: champ('motif'), page: valeurCal(meta.page), formuleSite: valeurCal(meta.formule_site), pagePrecedente: valeurCal(meta.page_precedente), lieu, origine,
    };
  }
  const quandRdv = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const tacheConfirmerRdv = (c, debut) => ({ titre: `Confirmer le RDV de ${nomCourt(c)} (la veille)`, echeance: new Date(Math.max(Date.now(), new Date(debut).getTime() - JOUR)).toISOString(), auto: true });
  const tacheRdvAnnule = (c) => ({ titre: `RDV annulé : rappeler ${nomCourt(c)} pour en fixer un autre`, echeance: dans(2 * HEURE), auto: true });

  window.CRM = window.CRM || {};
  Object.assign(window.CRM, { ETAPES, ETAPES_ELEVE, E: { RDV, VENU, INSCRIT }, rang, aAtteint, AGENCES, FORMULES, SOURCES, RAISONS_PERTE, FORMULAIRES, CHAMPS_ORIGINE, origine: { canal, campagne, annonce }, calcom: { lireReservation, quandRdv, tacheConfirmerRdv, tacheRdvAnnule, AVANT_RDV, CONFIRMER }, offres: { offrePour, liaisonOffre, tacheOffre, ajouterJours, TACHE_OFFRE }, workflows: { apresRdv, regleFormulaire, agenceInconnue, formuleDe, tacheNouvelleDemande, apresChangementEtape, apresAppel } });
})();

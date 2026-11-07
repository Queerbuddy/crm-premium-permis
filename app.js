/* CRM Premium Permis : écrans */
(function () {
  const CRM = window.CRM, D = CRM.donnees;
  const S = { moi: null, contacts: [], taches: [], paiements: [], offres: [], offreChoisie: null, profils: [], acts: [], agence: 'Toutes', vue: 'tableau', ouvert: null, recherche: '', filtreEtape: '', filtreSource: '', pubGroupe: 'canal', pubJours: 90 };
  const $app = document.getElementById('app');
  const JOUR = 864e5;

  /* ---------- Petits outils ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nomComplet = (c) => [c.prenom, c.nom].filter(Boolean).join(' ') || 'Sans nom';
  const telLisible = (t) => (t || '').replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  const telInter = (t) => (t && t.startsWith('0') ? '33' + t.slice(1) : t || '');
  const debutJour = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const debutSemaine = (d = new Date()) => { const x = debutJour(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const fmtJour = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtHeure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  function fmtQuand(d) {
    const t = new Date(d), j = debutJour(), diff = Math.round((debutJour(t) - j) / JOUR);
    if (diff === 0) return "aujourd'hui " + fmtHeure(t);
    if (diff === 1) return 'demain ' + fmtHeure(t);
    if (diff === -1) return 'hier ' + fmtHeure(t);
    return fmtJour(t) + (Math.abs(diff) < 7 ? ' ' + fmtHeure(t) : '');
  }
  function fmtDepuis(d) {
    const m = Math.round((Date.now() - new Date(d)) / 6e4);
    if (m < 1) return "à l'instant"; if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
    const j = Math.round(h / 24); return j < 30 ? `il y a ${j} j` : fmtJour(d);
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + ' %' : '–');
  const tagAgence = (a) => `<span class="tag tag-${a === 'Paris 5e' ? 'Paris' : 'Boissy'}">${esc(a)}</span>`;
  const tagEtape = (e) => `<span class="tag etape etape-${esc(String(e).split(' ')[0])}">${esc(e)}</span>`;
  const estEleve = (c) => CRM.ETAPES_ELEVE.includes(c.etape);
  const euros = (n) => (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const lireMontant = (v) => Math.round(parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.')) * 100) / 100;
  const MOYENS = ['Carte bancaire', 'Espèces', 'Chèque', 'Virement', 'CPF', 'Financement / aide', 'Autre'];
  const voitArgent = () => S.moi && S.moi.role !== 'moniteur';
  const ROLES = { directeur: 'Directeur', secretaire: 'Secrétariat', moniteur: 'Moniteur' };

  function toast(html, surClic) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html;
    if (surClic) t.onclick = () => { surClic(); t.remove(); };
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }
  function erreur(e) { console.error(e); toast('Oups : ' + esc(e.message || e)); }

  /* Fenêtre de saisie réutilisable : renvoie les valeurs du formulaire, ou null si annulé. */
  function demander(titre, champs, bouton = 'Enregistrer') {
    return new Promise((ok) => {
      const d = document.createElement('dialog');
      d.innerHTML = `<form method="dialog"><h2>${esc(titre)}</h2>${champs}<div class="actions"><button class="btn" value="annuler" formnovalidate>Annuler</button><button class="btn btn-noir" value="ok">${esc(bouton)}</button></div></form>`;
      document.body.appendChild(d);
      const f = d.querySelector('form');
      let fini = false;
      const finir = (valeurs) => { if (fini) return; fini = true; if (d.open) d.close(); d.remove(); ok(valeurs); };
      // On réagit au bouton cliqué lui-même (plus fiable que l'événement « close » seul).
      f.addEventListener('submit', (e) => { e.preventDefault(); finir(e.submitter && e.submitter.value === 'ok' ? Object.fromEntries(new FormData(f)) : null); });
      d.addEventListener('close', () => finir(null)); // touche Échap
      d.showModal();
    });
  }
  const options = (liste, choisi) => liste.map((v) => `<option ${v === choisi ? 'selected' : ''}>${esc(v)}</option>`).join('');

  /* ---------- Données visibles ---------- */
  const agenceFixe = () => (S.moi && S.moi.role !== 'directeur' ? S.moi.agence : null);
  const filtreAgence = (a) => { const f = agenceFixe() || (S.agence === 'Toutes' ? null : S.agence); return !f || a === f; };
  function contactsVisibles() {
    return S.contacts.filter((c) => filtreAgence(c.agence) && (S.moi.role !== 'moniteur' || estEleve(c)));
  }
  function tachesVisibles() {
    const ids = new Set(contactsVisibles().map((c) => c.id));
    return S.taches.filter((t) => (t.contact_id ? ids.has(t.contact_id) : filtreAgence(t.agence)));
  }
  const contactDe = (id) => S.contacts.find((c) => c.id === id);

  let rappelFait = false;
  async function recharger() {
    try {
      [S.contacts, S.taches, S.acts, S.paiements, S.offres] = await Promise.all([D.contacts(), D.taches(), D.toutesActivites(), voitArgent() ? D.paiements() : [], voitArgent() ? D.offres() : []]);
      if (!rappelFait) { rappelFait = true; await rappelSauvegarde(); }
      if (S.moi.role === 'directeur' && D.mode === 'supabase') S.profils = await D.profils();
    } catch (e) { erreur(e); }
    rendre();
  }

  /* ---------- Actions métier (avec workflows) ---------- */
  async function creerTaches(c, liste) {
    for (const t of liste) await D.creerTache({ contact_id: c.id, agence: c.agence, assigne: c.responsable || null, ...t });
    if (liste.length) toast(`<b>Workflow</b> : ${liste.length} tâche${liste.length > 1 ? 's' : ''} créée${liste.length > 1 ? 's' : ''} automatiquement`);
  }
  async function fermerTachesOuvertes(c, filtre = () => true) {
    for (const t of S.taches.filter((t) => t.contact_id === c.id && !t.faite && filtre(t))) await D.majTache(t.id, { faite: true, faite_le: new Date().toISOString() });
  }

  const TACHE_DE_SUIVI = /^(Rappeler|Relancer|Confirmer le RDV|Prospect chaud|Répondre|Inscrire)|sans réponse|n'est pas venu/;
  async function changerEtape(c, etape) {
    if (!c || c.etape === etape) return;
    const champs = { etape, etape_le: new Date().toISOString() };
    if (etape === 'Perdu') {
      const r = await demander(`${nomComplet(c)} : dossier perdu`, `<div class="champ"><label>Pourquoi ?</label><select name="raison">${options(CRM.RAISONS_PERTE)}</select></div>`, 'Classer en Perdu');
      if (!r) return rendre();
      champs.raison_perte = r.raison;
    }
    const E = CRM.E;
    if (etape === E.RDV) {
      const r = await demander(`RDV avec ${nomComplet(c)}`, `<div class="champ"><label>Date et heure du rendez-vous (facultatif)</label><input type="datetime-local" name="rdv"></div>`, 'Valider le RDV');
      if (!r) return rendre();
      if (r.rdv) champs.rdv_le = new Date(r.rdv).toISOString();
    }
    if (etape === E.INSCRIT) {
      const r = await demander(`${nomComplet(c)} est inscrit dans Klaxo`, `<div class="champ"><label>N° d'élève dans Klaxo (facultatif)</label><input name="klaxo" value="${esc(c.klaxo_id || '')}" autocomplete="off"></div><p class="muet petit" style="margin:0">Pensez à créer d'abord l'élève dans Klaxo.</p>`, 'Valider l\'inscription');
      if (!r) return rendre();
      if (r.klaxo) champs.klaxo_id = r.klaxo.trim();
    }
    // Garde la date de chaque étape franchie (statistiques du parcours, même si la fiche est perdue plus tard).
    if (etape !== 'Perdu') {
      const maint = new Date().toISOString();
      if (!c.rdv_pris_le && CRM.rang(etape) >= CRM.rang(E.RDV)) champs.rdv_pris_le = maint;
      if (!c.venu_le && CRM.rang(etape) >= CRM.rang(E.VENU)) champs.venu_le = maint;
      if (!c.inscrit_le && CRM.rang(etape) >= CRM.rang(E.INSCRIT)) champs.inscrit_le = maint;
    }
    try {
      const ancienne = c.etape;
      const maj = await D.majContact(c.id, champs);
      Object.assign(c, maj);
      await D.ajouterActivite({ contact_id: c.id, type: 'etape', texte: `Étape : ${ancienne} → ${etape}${champs.raison_perte ? ` (${champs.raison_perte})` : ''}${champs.rdv_le ? ` · RDV ${fmtJour(champs.rdv_le)} ${fmtHeure(champs.rdv_le)}` : ''}${champs.klaxo_id ? ` · n° Klaxo ${champs.klaxo_id}` : ''}`, auteur: S.moi.nom });
      // Les rappels et relances automatiques de l'étape d'avant n'ont plus lieu d'être
      // (mais « Envoyer le devis » ou l'accès à l'appli restent à faire) ; en fin de parcours, on ferme tout.
      await fermerTachesOuvertes(c, (t) => (t.auto && TACHE_DE_SUIVI.test(t.titre)) || etape === 'Perdu' || etape === 'Permis obtenu');
      // Workflow 7 (suite) : passé en agence → le rappel de l'offre n'a plus lieu d'être.
      if (etape !== 'Perdu' && CRM.rang(etape) >= CRM.rang(E.VENU)) await fermerTachesOuvertes(c, (t) => CRM.offres.TACHE_OFFRE.test(t.titre));
      await creerTaches(c, CRM.workflows.apresChangementEtape(c, etape));
    } catch (e) { erreur(e); }
    await recharger();
  }

  async function marquerRdv(c, venu) {
    try {
      const w = CRM.workflows.apresRdv(c, venu);
      if (!venu) {
        await D.majContact(c.id, { nb_absences: (c.nb_absences || 0) + 1, rdv_le: null });
        await D.ajouterActivite({ contact_id: c.id, type: 'etape', texte: `Absent au RDV${c.rdv_le ? ' du ' + fmtJour(c.rdv_le) : ''} (absence n° ${(c.nb_absences || 0) + 1})`, auteur: S.moi.nom });
        await fermerTachesOuvertes(c, (t) => /^Confirmer le RDV/.test(t.titre));
      }
      await creerTaches(c, w.taches);
      if (w.etape) { await recharger(); return changerEtape(contactDe(c.id), w.etape); }
    } catch (e) { erreur(e); }
    await recharger();
  }

  async function noterAppel(c, aRepondu) {
    let note = '';
    if (aRepondu) {
      const r = await demander(`Appel avec ${nomComplet(c)}`, `<div class="champ"><label>Ce qui a été dit (facultatif)</label><textarea name="note" placeholder="Ex. : veut commencer en janvier, préfère la boîte auto"></textarea></div>`);
      if (!r) return;
      note = r.note ? ' : ' + r.note : '';
    }
    try {
      const acts = await D.activites(c.id);
      let echecs = 0;
      for (const a of acts) { if (a.type !== 'appel') continue; if (a.texte.startsWith('Pas de réponse')) echecs++; else break; }
      await D.ajouterActivite({ contact_id: c.id, type: 'appel', texte: aRepondu ? 'A répondu' + note : 'Pas de réponse', auteur: S.moi.nom });
      await fermerTachesOuvertes(c, (t) => TACHE_DE_SUIVI.test(t.titre));
      const w = CRM.workflows.apresAppel(c, aRepondu, aRepondu ? 0 : echecs + 1);
      await creerTaches(c, w.taches);
      if (w.etape) { await recharger(); return changerEtape(contactDe(c.id), w.etape); }
    } catch (e) { erreur(e); }
    await recharger();
  }

  async function nouveauContact() {
    const a = agenceFixe() || (S.agence === 'Toutes' ? 'Boissy' : S.agence);
    const r = await demander('Nouveau contact', `
      <div class="champs"><div class="champ"><label>Prénom</label><input name="prenom" required autocomplete="off"></div><div class="champ"><label>Nom</label><input name="nom" autocomplete="off"></div></div>
      <div class="champs"><div class="champ"><label>Téléphone</label><input name="telephone" type="tel" inputmode="tel"></div><div class="champ"><label>E-mail</label><input name="email" type="email"></div></div>
      <div class="champs"><div class="champ"><label>Formule</label><select name="formule">${options(CRM.FORMULES)}</select></div><div class="champ"><label>Agence</label><select name="agence" ${agenceFixe() ? 'disabled' : ''}>${options(CRM.AGENCES, a)}</select></div></div>
      <div class="champ"><label>D'où vient-il ?</label><select name="source">${options(CRM.SOURCES, 'Téléphone')}</select></div>`, 'Créer la fiche');
    if (!r) return;
    try {
      const c = await D.creerContact({ prenom: r.prenom.trim(), nom: r.nom.trim(), telephone: CRM.normaliserTel(r.telephone) || null, email: r.email || null, formule: r.formule, agence: r.agence || a, source: r.source, responsable: S.moi.id.startsWith('demo') ? null : S.moi.id });
      await D.ajouterActivite({ contact_id: c.id, type: 'note', texte: `Fiche créée à la main (${r.source})`, auteur: S.moi.nom });
      await creerTaches(c, [{ titre: `Rappeler ${c.prenom}`, echeance: new Date(Date.now() + JOUR).toISOString(), auto: true }]);
      S.ouvert = c.id;
    } catch (e) { erreur(e); }
    await recharger();
  }

  async function nouvelleTache(c) {
    const demain = new Date(Date.now() + JOUR); demain.setHours(10, 0, 0, 0);
    const local = new Date(demain - demain.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const r = await demander(c ? `Tâche pour ${nomComplet(c)}` : 'Nouvelle tâche', `
      <div class="champ"><label>À faire</label><input name="titre" required placeholder="Ex. : rappeler pour fixer le RDV"></div>
      <div class="champ"><label>Pour quand ?</label><input type="datetime-local" name="echeance" value="${local}" required></div>
      ${c ? '' : `<div class="champ"><label>Agence</label><select name="agence">${options(CRM.AGENCES, agenceFixe() || 'Boissy')}</select></div>`}`, 'Ajouter');
    if (!r) return;
    try { await D.creerTache({ contact_id: c ? c.id : null, agence: c ? c.agence : r.agence, titre: r.titre, echeance: new Date(r.echeance).toISOString(), assigne: S.moi.id.startsWith('demo') ? null : S.moi.id }); } catch (e) { erreur(e); }
    await recharger();
  }

  // Champs envoyés par chaque formulaire du site (voir CRM.FORMULAIRES dans workflows.js).
  const PAGE_DU_FORMULAIRE = { 'rappel-accueil': 'accueil', rappel: 'boissy', inscription: 'contact', devis: 'contact', contact: 'contact', 'info-appli': 'contact', 'liste-attente': 'appli', chatbot: 'accueil', 'black-friday': 'offre-black-friday' };
  async function simulerDemande() {
    const r = await demander('Simuler une demande du site', `
      <p class="muet petit" style="margin:0">Fait comme si quelqu'un remplissait un formulaire du site. En ligne, c'est Netlify qui l'enverra tout seul.</p>
      <div class="champ"><label>Formulaire</label><select name="formulaire">${Object.keys(CRM.FORMULAIRES).map((f) => `<option value="${f}">${f} · ${esc(CRM.FORMULAIRES[f].source)}</option>`).join('')}</select></div>
      <div class="champs"><div class="champ"><label>Prénom</label><input name="prenom" required value="Test"></div><div class="champ"><label>Téléphone</label><input name="telephone" value="06 00 00 00 99"></div></div>
      <div class="champs"><div class="champ"><label>Formule</label><select name="formule">${options(CRM.FORMULES)}</select></div><div class="champ"><label>Agence</label><select name="agence"><option value="">(non précisée)</option>${options(CRM.AGENCES, agenceFixe() || 'Boissy')}</select></div></div>
      <div class="champs"><div class="champ"><label>Arrivé par</label><select name="origine_sim"><option value="google">Pub Google Ads</option><option value="facebook">Pub Facebook / Instagram</option><option value="gclid">Google Ads sans UTM</option><option value="naturel">Recherche Google gratuite</option><option value="direct">Accès direct</option></select></div>
        <div class="champ"><label>Campagne / annonce</label><input name="campagne_sim" value="demo-test / annonce-1"></div></div>
      <div class="champs"><div class="champ"><label>Code (assistant)</label><select name="code"><option>Non</option><option>Oui</option><option>Je suis en train de le passer</option></select></div>
        <div class="champ"><label>Début (assistant)</label><select name="debut"><option>Dès que possible</option><option>Dans le mois</option><option>Dans 2 ou 3 mois</option><option>Je me renseigne</option></select></div></div>
      <div class="champ"><label>Code promo (offre)</label><input name="code_promo" value="BLACKPERMIS26" style="text-transform:uppercase"></div>
      <div class="champ"><label>Situation (liste d'attente de l'appli)</label><select name="situation"><option value="">–</option><option>Élève chez Premium Permis</option><option>Pas encore inscrit dans une auto-école</option><option>Inscrit dans une autre auto-école</option></select></div>`, 'Envoyer');
    if (!r) return;
    const d = { ...r, page: PAGE_DU_FORMULAIRE[r.formulaire], page_arrivee: '/' };
    // Champs d'origine, comme le script du site les remplit.
    const [camp, ann] = (r.campagne_sim || '').split('/').map((x) => x.trim());
    const o = r.origine_sim;
    if (o === 'google') Object.assign(d, { utm_source: 'google', utm_medium: 'cpc', utm_campaign: camp, utm_content: ann, gclid: 'simulation', site_precedent: 'https://www.google.com/' });
    if (o === 'facebook') Object.assign(d, { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: camp, utm_content: ann, fbclid: 'simulation', site_precedent: 'https://m.facebook.com/' });
    if (o === 'gclid') Object.assign(d, { utm_source: 'google (gclid)', gclid: 'simulation', site_precedent: 'https://www.google.com/' });
    if (o === 'naturel') d.site_precedent = 'https://www.google.com/';
    if (o === 'direct') d.site_precedent = 'accès direct';
    delete d.origine_sim; delete d.campagne_sim;
    // Comme sur le vrai site : chaque formulaire n'envoie que ses propres champs.
    if (r.formulaire === 'liste-attente') { delete d.agence; delete d.formule; } else delete d.situation;
    if (['contact', 'info-appli'].includes(r.formulaire)) delete d.formule;
    if (r.formulaire !== 'black-friday') delete d.code_promo;
    if (r.formulaire === 'chatbot') { d.permis = r.formule === 'Moto' ? 'Moto (A1 / A2)' : 'Permis ' + r.formule; delete d.formule; if (!d.agence) d.agence = 'Je ne sais pas encore'; }
    else { delete d.code; delete d.debut; }
    const c = await D.simulerDemande(d);
    await recharger();
    alerteNouvelle(c);
  }

  // Workflow 8 : fait comme si Cal.com envoyait une réservation (même format que le vrai webhook).
  async function simulerRdv() {
    const demain = new Date(Date.now() + 2 * JOUR); demain.setHours(14, 0, 0, 0);
    const local = new Date(demain - demain.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const avecRdv = S.contacts.filter((c) => c.calcom_uid);
    const r = await demander('Simuler un RDV Cal.com', `
      <p class="muet petit" style="margin:0">Fait comme si quelqu'un prenait, déplaçait ou annulait un rendez-vous sur Cal.com. En ligne, c'est Cal.com qui l'enverra tout seul.</p>
      <div class="champ"><label>Ce qui se passe</label><select name="evenement"><option value="BOOKING_CREATED">RDV réservé</option><option value="BOOKING_RESCHEDULED">RDV déplacé</option><option value="BOOKING_CANCELLED">RDV annulé</option></select></div>
      <div class="champ"><label>RDV concerné (si déplacé ou annulé)</label><select name="uid"><option value="">(aucun)</option>${avecRdv.map((c) => `<option value="${esc(c.calcom_uid)}">${esc(nomComplet(c))} · ${fmtJour(c.rdv_le)}</option>`).join('')}</select></div>
      <div class="champs"><div class="champ"><label>Prénom et nom</label><input name="nom" value="Test Rendez-vous"></div><div class="champ"><label>Téléphone</label><input name="telephone" value="06 00 00 00 98"></div></div>
      <div class="champs"><div class="champ"><label>Agence (lien Cal.com)</label><select name="agence">${options(CRM.AGENCES, agenceFixe() || 'Boissy')}</select></div><div class="champ"><label>Date et heure</label><input type="datetime-local" name="debut" value="${local}"></div></div>
      <div class="champs"><div class="champ"><label>Formule</label><select name="formule">${options(CRM.FORMULES)}</select></div><div class="champ"><label>Arrivé par</label><select name="pub"><option value="google">Pub Google Ads</option><option value="">Sans pub</option></select></div></div>
      <div class="champ"><label>Motif (annulation ou déplacement)</label><input name="motif" placeholder="Ex. : empêchement"></div>`, 'Envoyer');
    if (!r) return;
    const uid = r.evenement === 'BOOKING_CREATED' || !r.uid ? 'demo-' + Math.random().toString(36).slice(2, 10) : r.uid;
    const payload = {
      type: 'rendez-vous', title: `Rendez-vous entre Premium Permis et ${r.nom}`, uid, startTime: new Date(r.debut).toISOString(),
      attendees: [{ name: r.nom, email: '', timeZone: 'Europe/Paris' }],
      responses: { name: { label: 'Nom', value: r.nom }, attendeePhoneNumber: { label: 'Téléphone', value: r.telephone },
        formule: { label: 'Formule', value: [r.formule === 'Moto' ? 'Moto (A1 / A2)' : 'Permis ' + r.formule] },
        lieu: { label: 'Lieu', value: [r.agence === 'Paris 5e' ? 'Paris 5' : 'Boissy-Saint-Léger 94'] }, motif: { label: 'Motif', value: "M'inscrire" } },
      metadata: { page: r.agence === 'Paris 5e' ? 'paris' : 'boissy', page_arrivee: '/', ...(r.pub ? { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'demo-test', utm_content: 'annonce-1', gclid: 'simulation', site_precedent: 'https://www.google.com/' } : {}) },
    };
    if (r.evenement === 'BOOKING_RESCHEDULED') { payload.rescheduleUid = r.uid; payload.uid = 'demo-' + Math.random().toString(36).slice(2, 10); payload.responses.rescheduleReason = { value: r.motif }; }
    if (r.evenement === 'BOOKING_CANCELLED') payload.cancellationReason = r.motif;
    const c = await D.simulerReservation({ triggerEvent: r.evenement, payload });
    await recharger();
    if (!c) return toast('Aucune fiche ne correspond à ce RDV : rien à faire.');
    S.ouvert = c.id; rendrePanneau();
  }

  function alerteNouvelle(c) {
    if (!c || !filtreAgence(c.agence)) return;
    toast(`<b>Nouvelle demande</b> · ${esc(c.prenom)} (${esc(c.agence)})${c.formule ? ' · ' + esc(c.formule) : ''}<br><span class="petit">Cliquer pour ouvrir la fiche</span>`, () => { S.ouvert = c.id; rendrePanneau(); });
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        const n = new Notification('Nouvelle demande · ' + c.agence, { body: `${c.prenom} ${telLisible(c.telephone)} · ${c.formule || ''}` });
        n.onclick = () => { window.focus(); S.ouvert = c.id; rendrePanneau(); };
      }
    } catch (e) { /* notifications non disponibles */ }
  }

  /* ---------- Paiements ---------- */
  const aujourdhui = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const moisDe = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
  function paiementsVisibles() { const ids = new Set(contactsVisibles().map((c) => c.id)); return S.paiements.filter((p) => ids.has(p.contact_id)); }
  function soldeDe(c) {
    const ps = S.paiements.filter((p) => p.contact_id === c.id);
    const paye = ps.filter((p) => p.statut === 'paye').reduce((a, p) => a + Number(p.montant), 0);
    const prevu = ps.filter((p) => p.statut === 'prevu').reduce((a, p) => a + Number(p.montant), 0);
    const prix = c.prix_total == null ? null : Number(c.prix_total);
    return { ps, paye, prevu, prix, reste: prix == null ? null : Math.round((prix - paye) * 100) / 100 };
  }
  function lignePaiement(p, avecEleve) {
    const c = contactDe(p.contact_id), retard = p.statut === 'prevu' && p.date_prevue < aujourdhui();
    return `<div class="tache"><div class="txt"><b>${euros(p.montant)}</b> <span class="muet">· ${esc(p.moyen)}</span>${avecEleve && c ? ` · <button class="btn-lien" data-ouvrir="${c.id}">${esc(nomComplet(c))}</button>` : ''}
      <div class="meta">${p.statut === 'paye' ? `<span class="tag" style="background:var(--menthe);color:var(--vert-fonce)">payé</span> le ${fmtJour(p.paye_le)}` : `<span class="tag ${retard ? 'etape-Nouveau' : ''}">${retard ? 'en retard' : 'prévu'}</span> pour le ${fmtJour(p.date_prevue + 'T12:00')}`}${avecEleve && c ? tagAgence(c.agence) : ''}${p.note ? ` · ${esc(p.note)}` : ''}</div></div>
      ${p.statut === 'prevu' ? `<button class="btn btn-petit btn-vert" data-encaisser="${p.id}">Encaissé</button>` : ''}${S.moi.role === 'directeur' ? `<button class="btn btn-petit btn-rouge" data-suppr-paiement="${p.id}" aria-label="Supprimer ce paiement">×</button>` : ''}</div>`;
  }
  function sectionPaiements(c) {
    const { ps, paye, prevu, prix, reste } = soldeDe(c);
    // Échéances à venir d'abord (la plus proche en haut), puis paiements reçus (le plus récent en haut).
    const tri = [...ps.filter((p) => p.statut === 'prevu').sort((a, b) => a.date_prevue.localeCompare(b.date_prevue)), ...ps.filter((p) => p.statut === 'paye').sort((a, b) => String(b.paye_le).localeCompare(String(a.paye_le)))];
    const offre = c.offre_id && S.offres.find((o) => o.id === c.offre_id);
    return `<section><h3>Paiements</h3>${offre ? `<p class="bandeau-demo" style="margin:0 0 10px">Offre ${esc(offre.nom)} : ${esc(offre.avantage || '')}</p>` : ''}
      <form id="form-prix" class="outils" style="margin-bottom:10px"><label for="prix" style="margin:0">Prix total</label><input id="prix" name="prix" inputmode="decimal" placeholder="ex. 1290" value="${prix == null ? '' : String(prix).replace('.', ',')}" style="width:120px"><span class="muet">€</span><button class="btn btn-petit">OK</button></form>
      <p style="margin:0 0 8px">Payé : <b>${euros(paye)}</b>${prevu ? ` · Prévu : ${euros(prevu)}` : ''}${reste != null ? ` · Reste : <b style="color:${reste > 0 ? 'var(--rouge)' : 'var(--vert-fonce)'}">${euros(Math.max(reste, 0))}</b>${reste < 0 ? ` <span class="muet">(trop-perçu ${euros(-reste)})</span>` : ''}` : ' · <span class="muet">prix total non indiqué</span>'}</p>
      ${tri.map((p) => lignePaiement(p, false)).join('') || '<p class="muet petit" style="margin:0">Aucun paiement.</p>'}
      <div class="actions" style="margin-top:10px"><button class="btn btn-petit btn-noir" data-action="paiement">+ Paiement reçu</button><button class="btn btn-petit" data-action="echeancier">Paiement en plusieurs fois</button></div></section>`;
  }
  async function paiementRecu(c) {
    const { reste } = soldeDe(c);
    const r = await demander(`Paiement de ${nomComplet(c)}`, `
      <div class="champs"><div class="champ"><label>Montant (€)</label><input name="montant" inputmode="decimal" required value="${reste > 0 ? String(reste).replace('.', ',') : ''}"></div>
      <div class="champ"><label>Moyen</label><select name="moyen">${options(MOYENS)}</select></div></div>
      <div class="champs"><div class="champ"><label>Date</label><input type="date" name="date" value="${aujourdhui()}" required></div><div class="champ"><label>Note (facultatif)</label><input name="note" placeholder="ex. n° de chèque"></div></div>`, 'Enregistrer le paiement');
    if (!r) return;
    const montant = lireMontant(r.montant);
    if (!(montant > 0)) return toast('Montant illisible : tapez par exemple 300 ou 300,50');
    try {
      await D.creerPaiement({ contact_id: c.id, montant, moyen: r.moyen, statut: 'paye', paye_le: new Date(r.date + 'T12:00').toISOString(), note: r.note || null, auteur: S.moi.nom });
      await D.ajouterActivite({ contact_id: c.id, type: 'note', texte: `Paiement reçu : ${euros(montant)} (${r.moyen})${r.note ? ' · ' + r.note : ''}`, auteur: S.moi.nom });
      // Workflow 5 : un premier paiement sur un prospect = il s'inscrit.
      if (CRM.rang(c.etape) < CRM.rang(CRM.E.INSCRIT)) { toast('<b>Workflow</b> : premier paiement → étape Inscrit (Klaxo)'); await recharger(); return changerEtape(contactDe(c.id), CRM.E.INSCRIT); }
    } catch (e) { erreur(e); }
    await recharger();
  }
  async function echeancier(c) {
    const { reste } = soldeDe(c);
    const dans30 = new Date(Date.now() + 30 * JOUR); const d0 = new Date(dans30 - dans30.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const r = await demander(`Paiement en plusieurs fois : ${nomComplet(c)}`, `
      <p class="muet petit" style="margin:0">Crée les échéances à venir, avec une tâche de rappel le jour de chacune.</p>
      <div class="champs"><div class="champ"><label>Montant à étaler (€)</label><input name="montant" inputmode="decimal" required value="${reste > 0 ? String(reste).replace('.', ',') : ''}"></div>
      <div class="champ"><label>En combien de fois ?</label><select name="nb">${[2, 3, 4, 5, 6, 10].map((n) => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
      <div class="champs"><div class="champ"><label>1re échéance le</label><input type="date" name="debut" value="${d0}" required></div><div class="champ"><label>Moyen</label><select name="moyen">${options(MOYENS)}</select></div></div>
      <p class="muet petit" style="margin:0">Les échéances suivantes tombent le même jour, chaque mois.</p>`, 'Créer les échéances');
    if (!r) return;
    const total = lireMontant(r.montant), nb = Number(r.nb);
    if (!(total > 0)) return toast('Montant illisible');
    const part = Math.floor((total / nb) * 100) / 100;
    try {
      for (let i = 0; i < nb; i++) {
        const d = new Date(r.debut + 'T12:00'); d.setMonth(d.getMonth() + i);
        const date = d.toISOString().slice(0, 10);
        const montant = i === nb - 1 ? Math.round((total - part * (nb - 1)) * 100) / 100 : part;
        const p = await D.creerPaiement({ contact_id: c.id, montant, moyen: r.moyen, statut: 'prevu', date_prevue: date, auteur: S.moi.nom });
        const quand = new Date(date + 'T10:00');
        await D.creerTache({ contact_id: c.id, agence: c.agence, paiement_id: p.id, auto: true, titre: `Encaisser l'échéance ${i + 1}/${nb} de ${c.prenom || nomComplet(c)} : ${euros(montant)} (${r.moyen})`, echeance: quand.toISOString() });
      }
      await D.ajouterActivite({ contact_id: c.id, type: 'note', texte: `Paiement en ${nb} fois : ${euros(total)} à partir du ${fmtJour(r.debut + 'T12:00')} (${r.moyen})`, auteur: S.moi.nom });
      toast(`<b>Workflow</b> : ${nb} échéances et ${nb} rappels créés`);
    } catch (e) { erreur(e); }
    await recharger();
  }
  async function encaisser(id) {
    const p = S.paiements.find((x) => x.id === id); if (!p) return;
    try {
      await D.majPaiement(id, { statut: 'paye', paye_le: new Date().toISOString() });
      for (const t of S.taches.filter((t) => t.paiement_id === id && !t.faite)) await D.majTache(t.id, { faite: true, faite_le: new Date().toISOString() });
      await D.ajouterActivite({ contact_id: p.contact_id, type: 'note', texte: `Échéance encaissée : ${euros(p.montant)} (${p.moyen})`, auteur: S.moi.nom });
      toast('Échéance encaissée');
    } catch (e) { erreur(e); }
    await recharger();
  }
  async function supprimerPaiement(id) {
    const p = S.paiements.find((x) => x.id === id); if (!p || !confirm(`Supprimer ce paiement de ${euros(p.montant)} ?`)) return;
    try { await D.supprimerPaiement(id); await D.ajouterActivite({ contact_id: p.contact_id, type: 'note', texte: `Paiement supprimé : ${euros(p.montant)} (${p.moyen})`, auteur: S.moi.nom }); } catch (e) { erreur(e); }
    await recharger();
  }
  function exporterPaiementsCSV() {
    const lignes = [['eleve', 'telephone', 'agence', 'montant', 'moyen', 'statut', 'date', 'note'].join(';'), ...paiementsVisibles().map((p) => { const c = contactDe(p.contact_id) || {}; return [nomComplet(c), c.telephone, c.agence, String(p.montant).replace('.', ','), p.moyen, p.statut === 'paye' ? 'payé' : 'prévu', p.statut === 'paye' ? String(p.paye_le).slice(0, 10) : p.date_prevue, p.note].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'); })];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lignes.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `paiements-premium-permis-${aujourdhui()}.csv`; a.click();
  }
  function vuePaiements() {
    if (!voitArgent()) return vueTableau();
    const ps = paiementsVisibles(), auj = aujourdhui(), mois = moisDe(new Date());
    const dans30 = new Date(Date.now() + 30 * JOUR).toISOString().slice(0, 10);
    const somme = (l) => l.reduce((a, p) => a + Number(p.montant), 0);
    const encMois = ps.filter((p) => p.statut === 'paye' && moisDe(p.paye_le) === mois);
    const prevusMois = ps.filter((p) => p.statut === 'prevu' && p.date_prevue >= auj && p.date_prevue.slice(0, 7) === mois);
    const retard = ps.filter((p) => p.statut === 'prevu' && p.date_prevue < auj).sort((a, b) => a.date_prevue.localeCompare(b.date_prevue));
    const avenir = ps.filter((p) => p.statut === 'prevu' && p.date_prevue >= auj && p.date_prevue <= dans30).sort((a, b) => a.date_prevue.localeCompare(b.date_prevue));
    const doivent = contactsVisibles().filter((c) => c.etape !== 'Perdu').map((c) => ({ c, ...soldeDe(c) })).filter((x) => x.reste > 0).sort((a, b) => b.reste - a.reste);
    const kpis = `<div class="grille kpis">
      <div class="carte kpi"><div class="lib">Encaissé ce mois</div><div class="val">${euros(somme(encMois))}</div><div class="sous">${encMois.length} paiement${encMois.length > 1 ? 's' : ''}</div></div>
      <div class="carte kpi"><div class="lib">Encore prévu ce mois</div><div class="val">${euros(somme(prevusMois))}</div><div class="sous">${prevusMois.length} échéance${prevusMois.length > 1 ? 's' : ''}</div></div>
      <div class="carte kpi ${retard.length ? 'alerte' : ''}"><div class="lib">Échéances en retard</div><div class="val">${euros(somme(retard))}</div><div class="sous">${retard.length} échéance${retard.length > 1 ? 's' : ''}</div></div>
      <div class="carte kpi"><div class="lib">Reste à payer (tous élèves)</div><div class="val">${euros(doivent.reduce((a, x) => a + x.reste, 0))}</div><div class="sous">${doivent.length} élève${doivent.length > 1 ? 's' : ''} · seulement si le prix total est indiqué</div></div></div>`;
    const sansPrix = contactsVisibles().filter((c) => estEleve(c) && c.prix_total == null).length;
    // Encaissé par mois (6 derniers mois) et par agence
    const moisListe = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return moisDe(d); });
    const ags = CRM.AGENCES.filter(filtreAgence);
    const parMois = `<div class="carte"><h2>Encaissé par mois</h2><div class="table-defile"><table><tr><th>Mois</th>${ags.map((a) => `<th class="nombre">${a}</th>`).join('')}<th class="nombre">Total</th></tr>
      ${moisListe.reverse().map((m) => { const l = ps.filter((p) => p.statut === 'paye' && moisDe(p.paye_le) === m); const lib = new Date(m + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return `<tr><td>${lib}</td>${ags.map((a) => `<td class="nombre">${euros(somme(l.filter((p) => (contactDe(p.contact_id) || {}).agence === a)))}</td>`).join('')}<td class="nombre"><b>${euros(somme(l))}</b></td></tr>`; }).join('')}</table></div></div>`;
    const parMoyen = `<div class="carte"><h2>Par moyen de paiement · 12 mois</h2><div class="table-defile"><table><tr><th>Moyen</th><th class="nombre">Paiements</th><th class="nombre">Montant</th></tr>
      ${MOYENS.map((m) => { const l = ps.filter((p) => p.statut === 'paye' && p.moyen === m && Date.now() - new Date(p.paye_le) < 365 * JOUR); return l.length ? `<tr><td>${esc(m)}</td><td class="nombre">${l.length}</td><td class="nombre">${euros(somme(l))}</td></tr>` : ''; }).join('') || '<tr><td colspan="3" class="vide">Aucun paiement.</td></tr>'}</table></div></div>`;
    return `<div class="entete"><div><h1>Paiements</h1><p class="muet">Visible seulement par le directeur et le secrétariat.</p></div><div class="outils"><button class="btn" data-action="csv-paiements">Exporter (Excel)</button></div></div>
      ${kpis}
      ${sansPrix ? `<p class="bandeau-demo" style="margin-top:14px">${sansPrix} élève${sansPrix > 1 ? 's' : ''} inscrit${sansPrix > 1 ? 's' : ''} sans prix total : indiquez-le dans leur fiche pour calculer le reste à payer.</p>` : ''}
      <div class="grille deux" style="margin-top:14px">
        <div class="carte"><h2>Échéances en retard · ${retard.length}</h2>${retard.map((p) => lignePaiement(p, true)).join('') || '<p class="vide">Aucune.</p>'}
          <h2 style="margin-top:16px">À venir (30 jours) · ${avenir.length}</h2>${avenir.map((p) => lignePaiement(p, true)).join('') || '<p class="muet petit">Rien de prévu.</p>'}</div>
        <div class="carte"><h2>Élèves qui doivent encore</h2><div class="table-defile"><table><tr><th>Élève</th><th class="nombre">Prix</th><th class="nombre">Payé</th><th class="nombre">Reste</th></tr>
          ${doivent.slice(0, 100).map((x) => `<tr class="clic" data-ouvrir="${x.c.id}"><td>${esc(nomComplet(x.c))} ${tagAgence(x.c.agence)}</td><td class="nombre">${euros(x.prix)}</td><td class="nombre">${euros(x.paye)}</td><td class="nombre" style="color:var(--rouge)"><b>${euros(x.reste)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="vide">Personne ne doit d\'argent.</td></tr>'}</table></div></div>
      </div>
      <div class="grille deux" style="margin-top:14px">${parMois}${parMoyen}</div>`;
  }

  /* ---------- Offres ---------- */
  function etatOffre(c) {
    const auj = aujourdhui();
    if (CRM.aAtteint(c, CRM.E.INSCRIT)) return { cle: 'inscrit', html: '<span class="tag etape-Inscrit">inscrit</span>' };
    if (CRM.aAtteint(c, CRM.E.VENU)) return { cle: 'venu', html: '<span class="tag" style="background:var(--bleu-doux);color:var(--bleu)">venu en agence</span>' };
    if (c.etape === 'Perdu') return { cle: 'perdu', html: '<span class="tag etape-Perdu">perdu</span>' };
    if (c.offre_limite < auj) return { cle: 'depasse', html: '<span class="tag etape-Nouveau">délai dépassé</span>' };
    const j = Math.round((new Date(c.offre_limite + 'T12:00') - new Date(auj + 'T12:00')) / JOUR);
    return { cle: 'attente', html: `<span class="tag" style="${j <= 3 ? 'background:var(--jaune-doux);color:#6b5a00' : ''}">pas encore venu · ${j} j restant${j > 1 ? 's' : ''}</span>` };
  }
  function tagOffre(c) {
    if (!c.offre_id) return '';
    const o = S.offres.find((x) => x.id === c.offre_id);
    return `<span class="tag" style="background:var(--jaune-doux);color:#6b5a00">${esc(o ? o.nom : 'Offre')}${c.offre_limite && !CRM.aAtteint(c, CRM.E.VENU) ? ' · avant le ' + new Date(c.offre_limite + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}</span>`;
  }
  async function editerOffre(o) {
    if (S.moi.role !== 'directeur') return;
    const r = await demander(o ? `Modifier l'offre « ${o.nom} »` : 'Nouvelle offre', `
      <div class="champs"><div class="champ"><label>Nom</label><input name="nom" required value="${esc(o ? o.nom : '')}" placeholder="ex. Offre de Noël 2026"></div>
      <div class="champ"><label>Code promo</label><input name="code" required value="${esc(o ? o.code : '')}" style="text-transform:uppercase" autocomplete="off"></div></div>
      <div class="champ"><label>Ce que la personne obtient</label><input name="avantage" value="${esc(o ? o.avantage || '' : '')}" placeholder="ex. 100 € offerts + paiement en 3 fois sans frais"></div>
      <div class="champs"><div class="champ"><label>Demandes acceptées du</label><input type="date" name="debut" required value="${o ? o.debut : aujourdhui()}"></div><div class="champ"><label>au</label><input type="date" name="fin" required value="${o ? o.fin : ''}"></div></div>
      <div class="champs"><div class="champ"><label>Date limite fixe pour passer en agence</label><input type="date" name="limite_fixe" value="${o && o.limite_fixe ? o.limite_fixe : ''}"></div>
      <div class="champ"><label>Sinon : délai après la demande (jours)</label><input type="number" name="delai_jours" min="1" max="120" value="${o ? o.delai_jours : 14}" required></div></div>
      <div class="champs">
      <div class="champ"><label>Formulaire du site lié (facultatif)</label><input name="formulaire" value="${esc(o ? o.formulaire || '' : '')}" placeholder="ex. black-friday"></div></div>
      ${o ? `<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="actif" style="width:auto;min-height:0" ${o.actif !== false ? 'checked' : ''}> Offre active (les nouveaux codes sont reconnus)</label>` : ''}`, o ? 'Enregistrer' : "Créer l'offre");
    if (!r) return;
    const champs = { nom: r.nom.trim(), code: r.code.trim().toUpperCase(), avantage: r.avantage.trim() || null, debut: r.debut, fin: r.fin, delai_jours: Number(r.delai_jours), limite_fixe: r.limite_fixe || null, formulaire: r.formulaire.trim() || null };
    if (o) champs.actif = r.actif === 'on';
    const ancienneLimite = o ? o.limite_fixe : null; // lue avant l'enregistrement
    try {
      const n = o ? await D.majOffre(o.id, champs) : await D.creerOffre(champs); S.offreChoisie = n.id;
      // Date limite fixe changée : on aligne les fiches déjà reçues et leurs rappels.
      let alignees = 0;
      if (o && champs.limite_fixe && champs.limite_fixe !== ancienneLimite) {
        for (const c of S.contacts.filter((c) => c.offre_id === o.id && c.offre_limite !== champs.limite_fixe)) {
          await D.majContact(c.id, { offre_limite: champs.limite_fixe }); alignees++;
          for (const t of S.taches.filter((t) => t.contact_id === c.id && !t.faite && CRM.offres.TACHE_OFFRE.test(t.titre))) {
            const nt = CRM.offres.tacheOffre(c, n, champs.limite_fixe); await D.majTache(t.id, { titre: nt.titre, echeance: nt.echeance });
          }
        }
      }
      toast(o ? `Offre enregistrée${alignees ? ` · date limite mise à jour sur ${alignees} fiche${alignees > 1 ? 's' : ''}` : ''}` : 'Offre créée');
    } catch (e) { erreur(/duplicate|unique/i.test(e.message) ? new Error('ce code promo existe déjà') : e); }
    await recharger();
  }
  function vueOffres() {
    if (!voitArgent()) return vueTableau();
    const offres = S.offres;
    if (!S.offreChoisie || !offres.some((o) => o.id === S.offreChoisie)) S.offreChoisie = (offres.find((o) => o.actif !== false) || offres[0] || {}).id;
    const stats = (o) => {
      const l = contactsVisibles().filter((c) => c.offre_id === o.id), e = l.map(etatOffre);
      const n = (k) => e.filter((x) => x.cle === k).length;
      return { l, total: l.length, venus: n('venu') + n('inscrit'), inscrits: n('inscrit'), attente: n('attente'), depasse: n('depasse') };
    };
    const auj = aujourdhui();
    const cartes = offres.map((o) => { const st = stats(o), enCours = o.actif !== false && auj >= o.debut && auj <= o.fin;
      return `<button class="carte" data-offre="${o.id}" style="text-align:left;cursor:pointer;${o.id === S.offreChoisie ? 'border-color:var(--vert);box-shadow:0 0 0 2px var(--menthe)' : ''}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h3>${esc(o.nom)}</h3><span class="tag ${enCours ? 'etape-Inscrit' : ''}">${o.actif === false ? 'désactivée' : enCours ? 'en cours' : auj < o.debut ? 'à venir' : 'terminée'}</span></div>
        <p class="petit muet" style="margin:4px 0 8px">Code <b style="color:var(--encre)">${esc(o.code)}</b> · du ${fmtJour(o.debut + 'T12:00')} au ${fmtJour(o.fin + 'T12:00')} · ${o.limite_fixe ? `venir en agence avant le ${fmtJour(o.limite_fixe + 'T12:00')}` : `${o.delai_jours} j pour venir`}</p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:14px"><span><b>${st.total}</b> demandes</span><span><b>${st.venus}</b> venus</span><span><b style="color:var(--vert-fonce)">${st.inscrits}</b> inscrits (${pct(st.inscrits, st.total)})</span>${st.depasse ? `<span class="en-retard">${st.depasse} délai dépassé</span>` : ''}</div></button>`; }).join('');
    const o = offres.find((x) => x.id === S.offreChoisie);
    let detail = '<div class="carte vide">Aucune offre. Lancez supabase/offres.sql dans Supabase pour créer l\'offre Black Friday.</div>';
    if (o) {
      const st = stats(o);
      const ordre = { depasse: 0, attente: 1, venu: 2, inscrit: 3, perdu: 4 };
      const l = st.l.map((c) => ({ c, e: etatOffre(c) })).sort((a, b) => ordre[a.e.cle] - ordre[b.e.cle] || String(a.c.offre_limite).localeCompare(String(b.c.offre_limite)));
      detail = `<div class="carte"><div class="entete" style="margin-bottom:8px"><div><h2>${esc(o.nom)}</h2><p class="muet petit">${esc(o.avantage || '')}</p></div>${S.moi.role === 'directeur' ? '<button class="btn btn-petit" data-action="offre-modifier">Modifier</button>' : ''}</div>
        <div class="grille kpis" style="margin-bottom:12px">
          <div class="kpi"><div class="lib">Demandes</div><div class="val">${st.total}</div></div>
          <div class="kpi"><div class="lib">Venus en agence</div><div class="val">${st.venus}</div><div class="sous">${pct(st.venus, st.total)} des demandes</div></div>
          <div class="kpi"><div class="lib">Inscrits grâce à l'offre</div><div class="val" style="color:var(--vert-fonce)">${st.inscrits}</div><div class="sous">${pct(st.inscrits, st.total)} des demandes</div></div>
          <div class="kpi ${st.depasse ? 'alerte' : ''}"><div class="lib">Pas encore venus</div><div class="val">${st.attente + st.depasse}</div><div class="sous">${st.depasse} délai dépassé</div></div></div>
        <div class="table-defile"><table><tr><th>Personne</th><th>Agence</th><th>Code utilisé</th><th>Demande</th><th>Limite agence</th><th>Statut</th><th>Étape</th></tr>
        ${l.map(({ c, e }) => `<tr class="clic" data-ouvrir="${c.id}"><td><b style="color:var(--encre)">${esc(nomComplet(c))}</b><br><span class="muet petit">${esc(telLisible(c.telephone))}</span></td><td>${tagAgence(c.agence)}</td><td>${esc(c.code_promo || '')}${c.code_promo && c.code_promo !== o.code ? ' <span class="muet petit">(modifié)</span>' : ''}</td><td style="white-space:nowrap">${fmtJour(c.cree_le)}</td><td style="white-space:nowrap" class="${e.cle === 'depasse' ? 'en-retard' : ''}">${c.offre_limite ? fmtJour(c.offre_limite + 'T12:00') : ''}</td><td>${e.html}</td><td>${tagEtape(c.etape)}</td></tr>`).join('') || '<tr><td colspan="7" class="vide">Personne pour l\'instant.</td></tr>'}
        </table></div>
        <p class="muet petit" style="margin:8px 0 0">« Venu en agence » = étape « Venu au RDV » ou plus loin. Date limite : ${o.limite_fixe ? `le ${fmtJour(o.limite_fixe + 'T12:00')} pour tout le monde` : `la demande + ${o.delai_jours} jours`}. Un rappel est créé automatiquement 3 jours avant pour ceux qui ne sont pas encore venus.</p></div>`;
    }
    return `<div class="entete"><div><h1>Offres</h1><p class="muet">Codes promo, demandes reçues et inscriptions obtenues.</p></div>${S.moi.role === 'directeur' ? '<div class="outils"><button class="btn btn-noir" data-action="offre-nouvelle">+ Nouvelle offre</button></div>' : ''}</div>
      <div class="grille" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-bottom:14px">${cartes}</div>${detail}`;
  }

  /* ---------- Sauvegarde ---------- */
  const TITRE_SAUVEGARDE = 'Faire la sauvegarde du CRM (Contacts > Sauvegarder tout)';
  async function sauvegarderTout() {
    try {
      const b = await D.toutExporter();
      const fichier = { crm: 'Premium Permis', version: 1, date: new Date().toISOString(), ...b };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(fichier)], { type: 'application/json' }));
      a.download = `sauvegarde-crm-premium-permis-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      for (const t of S.taches.filter((t) => !t.faite && t.titre === TITRE_SAUVEGARDE)) await D.majTache(t.id, { faite: true, faite_le: new Date().toISOString() });
      toast(`<b>Sauvegarde téléchargée</b> : ${b.contacts.length} fiches, ${(b.paiements || []).length} paiements, ${b.activites.length} lignes d'historique, ${b.taches.length} tâches. Rangez le fichier sur le disque T5 ou dans Google Drive.`);
      await recharger();
    } catch (e) { erreur(e); }
  }
  function restaurer() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      try {
        const b = JSON.parse(await i.files[0].text());
        if (b.crm !== 'Premium Permis' || !Array.isArray(b.contacts)) throw new Error("ce fichier n'est pas une sauvegarde du CRM");
        if (!confirm(`Restaurer la sauvegarde du ${new Date(b.date).toLocaleString('fr-FR')} ?\n${b.contacts.length} fiches, ${b.activites.length} lignes d'historique, ${b.taches.length} tâches.\nLes fiches qui existent déjà sont remplacées par la version sauvegardée ; rien n'est effacé.`)) return;
        await D.toutRestaurer(b);
        toast('<b>Sauvegarde restaurée</b>');
        await recharger();
      } catch (e) { erreur(e); }
    };
    i.click();
  }
  // Workflow 4 : rappel de sauvegarde chaque semaine pour le directeur.
  async function rappelSauvegarde() {
    if (S.moi.role !== 'directeur' || S.taches.some((t) => !t.faite && t.titre === TITRE_SAUVEGARDE)) return;
    const derniere = S.taches.filter((t) => t.titre === TITRE_SAUVEGARDE && t.faite).map((t) => t.faite_le).sort().pop();
    const prochaine = derniere ? new Date(Date.parse(derniere) + 7 * JOUR) : new Date();
    try { await D.creerTache({ contact_id: null, agence: null, titre: TITRE_SAUVEGARDE, echeance: prochaine.toISOString(), auto: true }); S.taches = await D.taches(); } catch (e) { erreur(e); }
  }

  function exporterCSV() {
    const col = ['prenom', 'nom', 'telephone', 'email', 'formule', 'agence', 'source', 'etape', 'raison_perte', 'cree_le', 'canal', ...CRM.CHAMPS_ORIGINE];
    const lignes = [col.join(';'), ...contactsVisibles().map((c) => ({ ...c, canal: CRM.origine.canal(c) })).map((c) => col.map((k) => `"${String(c[k] ?? '').replace(/"/g, '""')}"`).join(';'))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lignes.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `contacts-premium-permis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  /* ---------- Écran de connexion ---------- */
  function rendreConnexion(msg = '') {
    if (D.mode === 'demo') {
      $app.innerHTML = `<div class="ecran-connexion"><div class="carte">
        <h1>CRM Premium Permis</h1>
        <p class="muet">Mode démo : données fictives, gardées dans ce navigateur. Choisissez un rôle pour voir ce que chacun verra.</p>
        <div class="choix-demo">${D.profilsDemo.map((p) => `<button class="btn" data-connexion-demo="${p.id}"><b>${esc(p.nom)}</b>&nbsp;<span class="muet">· ${ROLES[p.role]}${p.agence ? ' ' + esc(p.agence) : ', 2 agences'}</span></button>`).join('')}</div>
      </div></div>`;
      return;
    }
    $app.innerHTML = `<div class="ecran-connexion"><div class="carte">
      <h1>CRM Premium Permis</h1><p class="muet" style="margin:4px 0 0">Connexion réservée à l'équipe.</p>
      <form id="form-connexion">
        <div><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required></div>
        <div><label for="mdp">Mot de passe</label><input id="mdp" name="mdp" type="password" autocomplete="current-password" required></div>
        ${msg ? `<p class="erreur">${esc(msg)}</p>` : ''}
        <button class="btn btn-noir">Se connecter</button>
        <button type="button" class="btn-lien" data-action="oubli">Mot de passe oublié ?</button>
      </form></div></div>`;
  }

  /* ---------- Squelette ---------- */
  const ICONES = {
    tableau: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
    pipeline: '<path d="M3 4h4v16H3zm7 0h4v11h-4zm7 0h4v7h-4z"/>',
    contacts: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"/>',
    taches: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
    offres: '<path d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .6.2 1.1.6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8z"/>',
    paiements: '<path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4v-6h16zm0-10H4V6h16z"/>',
    equipe: '<path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4zm8 0c-.3 0-.7 0-1.1.1 1.2.8 2.1 2 2.1 3.9v2h7v-2c0-2.7-5.3-4-8-4z"/>',
  };
  const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONES[n]}</svg>`;

  function rendre() {
    if (!S.moi) { rendreConnexion(); return rendrePanneau(); }
    const enRetard = tachesVisibles().filter((t) => !t.faite && new Date(t.echeance) < new Date()).length;
    const nouveaux = contactsVisibles().filter((c) => c.etape === 'Nouveau').length;
    const liens = [['tableau', 'Tableau de bord', 0], ['pipeline', 'Pipeline', nouveaux], ['contacts', 'Contacts', 0], ['taches', 'Tâches', enRetard]];
    if (voitArgent()) liens.push(['offres', 'Offres', contactsVisibles().filter((c) => c.offre_id && !CRM.aAtteint(c, CRM.E.VENU) && c.etape !== 'Perdu' && c.offre_limite < aujourdhui()).length]);
    if (voitArgent()) liens.push(['paiements', 'Paiements', paiementsVisibles().filter((p) => p.statut === 'prevu' && p.date_prevue < aujourdhui()).length]);
    if (S.moi.role === 'directeur' && D.mode === 'supabase') liens.push(['equipe', 'Équipe', 0]);
    $app.innerHTML = `<div class="coquille">
      <header class="barre">
        <a class="marque" href="#tableau"><b>P</b>CRM Premium Permis</a><span class="espace"></span>
        ${agenceFixe() ? tagAgence(agenceFixe()) : `<select id="choix-agence" aria-label="Agence">${options(['Toutes', ...CRM.AGENCES], S.agence)}</select>`}
        <div class="moi">${esc(S.moi.nom)}<small>${ROLES[S.moi.role] || ''}</small></div>
        <button class="btn btn-petit" data-action="deconnexion" style="background:#2a2a2a;border-color:#444;color:#fff">Quitter</button>
      </header>
      <nav class="nav">${liens.map(([v, l, n]) => `<a href="#${v}" class="${S.vue === v ? 'actif' : ''}">${ico(v)}<span>${l}</span>${n ? `<span class="pastille" title="${v === 'taches' ? 'tâches en retard' : 'à rappeler'}">${n}</span>` : ''}</a>`).join('')}</nav>
      <main class="contenu">${D.mode === 'demo' ? bandeauDemo() : ''}${VUES[S.vue] ? VUES[S.vue]() : VUES.tableau()}</main>
    </div>`;
    rendrePanneau();
  }

  function bandeauDemo() {
    return `<div class="bandeau-demo"><span><b>Mode démo</b> · toutes les fiches et tous les chiffres ici sont fictifs.</span><span class="espace" style="flex:1"></span>
      <button class="btn btn-petit" data-action="simuler">Simuler une demande du site</button>
      <button class="btn btn-petit" data-action="simuler-rdv">Simuler un RDV Cal.com</button>
      <button class="btn btn-petit" data-action="reinit">Remettre les exemples</button>
      <button class="btn btn-petit" data-action="vider">Tout vider</button></div>`;
  }

  /* ---------- Tableau de bord ---------- */
  function vueTableau() {
    const cs = contactsVisibles(), ts = tachesVisibles(), maint = Date.now();
    const lundi = debutSemaine(), lundiAvant = new Date(lundi - 7 * JOUR);
    const semaine = cs.filter((c) => new Date(c.cree_le) >= lundi).length;
    const avant = cs.filter((c) => new Date(c.cree_le) >= lundiAvant && new Date(c.cree_le) < lundi).length;
    const aRappeler = cs.filter((c) => c.etape === 'Nouveau');
    const retard = ts.filter((t) => !t.faite && new Date(t.echeance) < maint).length;
    const sur90 = cs.filter((c) => maint - new Date(c.cree_le) < 90 * JOUR);
    const inscrits90 = sur90.filter(estEleve).length;

    // Délai moyen avant le premier appel (demandes des 30 derniers jours)
    const premiersAppels = {};
    for (const a of S.acts) if (a.type === 'appel' && (!premiersAppels[a.contact_id] || a.cree_le < premiersAppels[a.contact_id])) premiersAppels[a.contact_id] = a.cree_le;
    const delais = cs.filter((c) => premiersAppels[c.id] && maint - new Date(c.cree_le) < 30 * JOUR).map((c) => new Date(premiersAppels[c.id]) - new Date(c.cree_le));
    const delaiMoyen = delais.length ? delais.reduce((a, b) => a + b, 0) / delais.length / 36e5 : null;

    const kpis = `<div class="grille kpis">
      <div class="carte kpi"><div class="lib">Demandes cette semaine</div><div class="val">${semaine}</div><div class="sous">${avant} la semaine dernière</div></div>
      <div class="carte kpi ${aRappeler.length ? 'alerte' : ''}"><div class="lib">À rappeler (Nouveau)</div><div class="val">${aRappeler.length}</div><div class="sous">${aRappeler.filter((c) => maint - new Date(c.cree_le) > JOUR).length} attendent depuis + de 24 h</div></div>
      <div class="carte kpi ${retard ? 'alerte' : ''}"><div class="lib">Tâches en retard</div><div class="val">${retard}</div><div class="sous">${ts.filter((t) => !t.faite).length} tâches ouvertes</div></div>
      <div class="carte kpi"><div class="lib">Taux d'inscription (90 j)</div><div class="val">${pct(inscrits90, sur90.length)}</div><div class="sous">${inscrits90} inscrits sur ${sur90.length} contacts</div></div>
      ${voitArgent() ? (() => { const m = moisDe(new Date()); const enc = paiementsVisibles().filter((p) => p.statut === 'paye' && moisDe(p.paye_le) === m).reduce((a, p) => a + Number(p.montant), 0); const ret = paiementsVisibles().filter((p) => p.statut === 'prevu' && p.date_prevue < aujourdhui()); return `<a class="carte kpi ${ret.length ? 'alerte' : ''}" href="#paiements" style="text-decoration:none"><div class="lib">Encaissé ce mois</div><div class="val">${euros(enc)}</div><div class="sous">${ret.length ? `<span class="en-retard">${ret.length} échéance${ret.length > 1 ? 's' : ''} en retard</span>` : 'aucune échéance en retard'}</div></a>`; })() : ''}
      <div class="carte kpi"><div class="lib">Délai moyen du 1er appel</div><div class="val">${delaiMoyen === null ? '–' : delaiMoyen < 1 ? Math.round(delaiMoyen * 60) + ' min' : Math.round(delaiMoyen) + ' h'}</div><div class="sous">sur les demandes des 30 derniers jours</div></div>
    </div>`;

    // Demandes par semaine (8 semaines) et par agence
    const semaines = [...Array(8)].map((_, i) => new Date(lundi - (7 - i) * 7 * JOUR));
    const series = CRM.AGENCES.filter((a) => filtreAgence(a)).map((a) => ({ a, vals: semaines.map((d) => cs.filter((c) => c.agence === a && new Date(c.cree_le) >= d && new Date(c.cree_le) < new Date(+d + 7 * JOUR)).length) }));
    const max = Math.max(1, ...series.flatMap((s) => s.vals));
    const W = 640, H = 220, bas = 190, haut = 24, larg = W / 8;
    const barres = semaines.map((d, i) => series.map((s, j) => {
      const bw = Math.min(26, (larg - 18) / series.length), x = i * larg + (larg - bw * series.length - 4 * (series.length - 1)) / 2 + j * (bw + 4);
      const h = (s.vals[i] / max) * (bas - haut), y = bas - h;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, s.vals[i] ? 2 : 0)}" rx="4" fill="var(--${s.a === 'Paris 5e' ? 'paris' : 'boissy'})"><title>${s.a} · semaine du ${d.toLocaleDateString('fr-FR')} : ${s.vals[i]}</title></rect>` + (s.vals[i] ? `<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="12" fill="var(--texte)" font-weight="600">${s.vals[i]}</text>` : '');
    }).join('') + `<text x="${i * larg + larg / 2}" y="${bas + 20}" text-anchor="middle" font-size="12" fill="var(--gris)">${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</text>`).join('');
    const graph = `<div class="carte graph"><h2>Demandes par semaine</h2><p class="muet petit" style="margin:2px 0 10px">Nouveaux contacts, toutes sources, semaines commençant le lundi.</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Demandes par semaine et par agence"><line x1="0" x2="${W}" y1="${bas}" y2="${bas}" stroke="var(--trait)"/>${barres}</svg>
      <div class="legende">${series.map((s) => `<span><i style="background:var(--${s.a === 'Paris 5e' ? 'paris' : 'boissy'})"></i>${s.a}</span>`).join('')}</div></div>`;

    // Par agence (30 jours)
    const sur30 = cs.filter((c) => maint - new Date(c.cree_le) < 30 * JOUR);
    const parAgence = `<div class="carte"><h2>Par agence · 30 derniers jours</h2><div class="table-defile"><table>
      <tr><th>Agence</th><th class="nombre">Demandes</th><th class="nombre">Inscrits</th><th class="nombre">Taux</th><th class="nombre">Perdus</th></tr>
      ${CRM.AGENCES.filter(filtreAgence).map((a) => { const l = sur30.filter((c) => c.agence === a), i = l.filter(estEleve).length; return `<tr><td>${tagAgence(a)}</td><td class="nombre">${l.length}</td><td class="nombre">${i}</td><td class="nombre">${pct(i, l.length)}</td><td class="nombre">${l.filter((c) => c.etape === 'Perdu').length}</td></tr>`; }).join('')}
    </table></div></div>`;

    // Par source (90 jours)
    const sources = CRM.SOURCES.map((s) => { const l = sur90.filter((c) => c.source === s); return { s, n: l.length, i: l.filter(estEleve).length }; }).filter((x) => x.n);
    const parSource = `<div class="carte"><h2>D'où viennent les élèves · 90 jours</h2><div class="table-defile"><table>
      <tr><th>Source</th><th class="nombre">Contacts</th><th class="nombre">Inscrits</th><th class="nombre">Taux</th></tr>
      ${sources.map((x) => `<tr><td>${esc(x.s)}</td><td class="nombre">${x.n}</td><td class="nombre">${x.i}</td><td class="nombre">${pct(x.i, x.n)}</td></tr>`).join('') || '<tr><td colspan="4" class="vide">Pas encore de données</td></tr>'}
    </table></div></div>`;

    // Entonnoir actuel
    const maxE = Math.max(1, ...CRM.ETAPES.map((e) => cs.filter((c) => c.etape === e).length));
    const entonnoir = `<div class="carte entonnoir"><h2>Où en sont les dossiers</h2>${CRM.ETAPES.map((e) => { const n = cs.filter((c) => c.etape === e).length; return `<div class="rang"><span>${esc(e)}</span><span class="jauge"><i style="width:${(n / maxE) * 100}%;${e === 'Perdu' ? 'background:var(--trait-fort)' : ''}"></i></span><b class="nombre" style="text-align:right">${n}</b></div>`; }).join('')}</div>`;

    // Tâches du jour
    const fin = new Date(debutJour().getTime() + JOUR);
    const duJour = ts.filter((t) => !t.faite && new Date(t.echeance) < fin).sort((a, b) => a.echeance.localeCompare(b.echeance));
    const taches = `<div class="carte"><h2>À faire aujourd'hui</h2>${duJour.length ? duJour.slice(0, 8).map(ligneTache).join('') : '<p class="vide">Rien en attente. Bravo !</p>'}${duJour.length > 8 ? `<a href="#taches">Voir les ${duJour.length} tâches</a>` : ''}</div>`;

    return `<div class="entete"><div><h1>Bonjour ${esc(S.moi.nom.split(' ')[0])}</h1><p class="muet">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${S.agence !== 'Toutes' || agenceFixe() ? ' · ' + esc(agenceFixe() || S.agence) : ' · 2 agences'}</p></div>
      <div class="outils">${S.moi.role !== 'moniteur' ? '<button class="btn btn-noir" data-action="nouveau">+ Nouveau contact</button>' : ''}${notifBouton()}</div></div>
      ${kpis}<div class="grille deux" style="margin-top:14px">${graph}${taches}</div>
      <div style="margin-top:14px">${vueParcours(cs)}</div>
      <div class="grille deux" style="margin-top:14px">${parAgence}${entonnoir}</div><div style="margin-top:14px">${vuePubs(cs)}</div><div style="margin-top:14px">${parSource}</div>`;
  }

  /* Parcours d'Adama : demande → RDV pris → venu au RDV → inscrit dans Klaxo (90 jours, par agence). */
  function vueParcours(cs) {
    const E = CRM.E, l = cs.filter((c) => Date.now() - new Date(c.cree_le) < 90 * JOUR);
    const ligne = (nom, g) => {
      const n = g.length, r = g.filter((c) => CRM.aAtteint(c, E.RDV)).length, v = g.filter((c) => CRM.aAtteint(c, E.VENU)).length, i = g.filter((c) => CRM.aAtteint(c, E.INSCRIT)).length;
      const abs = g.reduce((a, c) => a + (c.nb_absences || 0), 0);
      return `<tr><td>${nom}</td><td class="nombre">${n}</td><td class="nombre">${r} <span class="muet">(${pct(r, n)})</span></td><td class="nombre">${v} <span class="muet">(${pct(v, r)})</span></td><td class="nombre"><b>${i}</b> <span class="muet">(${pct(i, v)})</span></td><td class="nombre">${abs}</td><td class="nombre"><b>${pct(i, n)}</b></td></tr>`;
    };
    const ags = CRM.AGENCES.filter(filtreAgence);
    return `<div class="carte"><h2>Parcours : RDV → venue → inscription Klaxo</h2><p class="muet petit" style="margin:2px 0 10px">Demandes des 90 derniers jours. Entre parenthèses : le taux par rapport à l'étape d'avant.</p>
      <div class="table-defile"><table><tr><th>Agence</th><th class="nombre">Demandes</th><th class="nombre">RDV pris</th><th class="nombre">Venus au RDV</th><th class="nombre">Inscrits Klaxo</th><th class="nombre">Absences</th><th class="nombre">Demande → inscrit</th></tr>
      ${ags.map((a) => ligne(tagAgence(a), l.filter((c) => c.agence === a))).join('')}${ags.length > 1 ? ligne('<b>Total</b>', l) : ''}</table></div></div>`;
  }

  /* Publicités : demandes et inscriptions par canal, campagne ou annonce. */
  function vuePubs(cs) {
    const O = CRM.origine, g = S.pubGroupe, maint = Date.now();
    const l = cs.filter((c) => maint - new Date(c.cree_le) < S.pubJours * JOUR);
    const cle = (c) => g === 'canal' ? [O.canal(c)] : g === 'campagne' ? [O.canal(c), O.campagne(c)] : [O.canal(c), O.campagne(c), O.annonce(c)];
    const groupes = new Map();
    for (const c of l) { const k = cle(c), id = k.join('\u0001'); if (!groupes.has(id)) groupes.set(id, { k, n: 0, rdv: 0, v: 0, i: 0, p: 0 }); const x = groupes.get(id); x.n++; if (CRM.aAtteint(c, CRM.E.RDV)) x.rdv++; if (CRM.aAtteint(c, CRM.E.VENU)) x.v++; if (CRM.aAtteint(c, CRM.E.INSCRIT)) x.i++; if (c.etape === 'Perdu') x.p++; }
    const lignes = [...groupes.values()].sort((a, b) => b.n - a.n || b.i - a.i);
    const entetes = ['Canal', ...(g !== 'canal' ? ['Campagne'] : []), ...(g === 'annonce' ? ['Annonce'] : [])];
    const totalPub = l.filter((c) => /Ads$/.test(O.canal(c))), iPub = totalPub.filter(estEleve).length;
    return `<div class="carte"><div class="entete" style="margin-bottom:8px"><div><h2>Publicités : d'où viennent les demandes</h2>
        <p class="muet petit">Pubs payantes : <b>${totalPub.length}</b> demande${totalPub.length > 1 ? 's' : ''}, <b>${iPub}</b> inscrit${iPub > 1 ? 's' : ''} (${pct(iPub, totalPub.length)}). Origine = 1re visite connue.</p></div>
        <div class="outils"><select id="pub-groupe" aria-label="Regrouper par">${[['canal', 'Par canal'], ['campagne', 'Par campagne'], ['annonce', 'Par annonce']].map(([v, t]) => `<option value="${v}" ${g === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select id="pub-jours" aria-label="Période">${[[30, '30 jours'], [90, '90 jours'], [365, '12 mois']].map(([v, t]) => `<option value="${v}" ${S.pubJours === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="table-defile"><table><tr>${entetes.map((e) => `<th>${e}</th>`).join('')}<th class="nombre">Demandes</th><th class="nombre">RDV pris</th><th class="nombre">Venus</th><th class="nombre">Inscrits</th><th class="nombre">Taux</th><th class="nombre">Perdus</th></tr>
      ${lignes.map((x) => `<tr>${x.k.map((v, j) => `<td${j ? ' class="muet"' : ''} style="overflow-wrap:anywhere">${esc(v)}</td>`).join('')}<td class="nombre">${x.n}</td><td class="nombre">${x.rdv}</td><td class="nombre">${x.v}</td><td class="nombre"><b>${x.i}</b></td><td class="nombre">${pct(x.i, x.n)}</td><td class="nombre">${x.p}</td></tr>`).join('') || `<tr><td colspan="${entetes.length + 6}" class="vide">Pas de demande sur la période.</td></tr>`}
      </table></div>
      <p class="muet petit" style="margin:8px 0 0">Pour voir la campagne et l'annonce exactes, chaque pub doit avoir dans son lien <code>utm_campaign</code> et <code>utm_content</code> (voir GUIDE-MISE-EN-LIGNE.md).</p></div>`;
  }
  function notifBouton() {
    if (!('Notification' in window) || Notification.permission !== 'default') return '';
    return '<button class="btn" data-action="notifs">Activer les alertes</button>';
  }

  /* ---------- Pipeline ---------- */
  function vuePipeline() {
    const cs = contactsVisibles();
    const etapes = S.moi.role === 'moniteur' ? CRM.ETAPES_ELEVE : CRM.ETAPES;
    const ouvertes = new Map(); for (const t of S.taches) if (!t.faite) { const p = ouvertes.get(t.contact_id); if (!p || t.echeance < p.echeance) ouvertes.set(t.contact_id, t); }
    return `<div class="entete"><div><h1>Pipeline</h1><p class="muet">Glisser une fiche d'une colonne à l'autre, ou l'ouvrir pour changer l'étape.</p></div>
      <div class="outils">${S.moi.role !== 'moniteur' ? '<button class="btn btn-noir" data-action="nouveau">+ Nouveau contact</button>' : ''}</div></div>
      <div class="pipeline">${etapes.map((e) => { const l = cs.filter((c) => c.etape === e).sort((a, b) => b.etape_le.localeCompare(a.etape_le)); return `<div class="colonne" data-colonne="${esc(e)}"><h3>${esc(e)} <span>${l.length}</span></h3>${l.slice(0, 60).map((c) => { const t = ouvertes.get(c.id); return `<button class="fiche-mini" draggable="true" data-ouvrir="${c.id}"><b>${esc(nomComplet(c))}</b><span class="ligne">${tagAgence(c.agence)}${c.formule ? `<span>${esc(c.formule)}</span>` : ''}</span><span class="ligne">${t ? `<span class="${new Date(t.echeance) < new Date() ? 'retard' : ''}">⏰ ${esc(fmtQuand(t.echeance))}</span>` : `<span>${fmtDepuis(c.etape_le)}</span>`}</span></button>`; }).join('')}${l.length > 60 ? `<p class="muet petit">+ ${l.length - 60} autres (voir Contacts)</p>` : ''}</div>`; }).join('')}</div>`;
  }

  /* ---------- Contacts ---------- */
  function vueContacts() {
    const q = S.recherche.trim().toLowerCase(), qTel = q.replace(/\D/g, '');
    const l = contactsVisibles().filter((c) => (!S.filtreEtape || c.etape === S.filtreEtape) && (!S.filtreSource || c.source === S.filtreSource) && (!q || nomComplet(c).toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (qTel && (c.telephone || '').includes(qTel)))).sort((a, b) => b.cree_le.localeCompare(a.cree_le));
    return `<div class="entete"><div><h1>Contacts</h1><p class="muet">${l.length} fiche${l.length > 1 ? 's' : ''}</p></div>
      <div class="outils">${S.moi.role !== 'moniteur' ? '<button class="btn btn-noir" data-action="nouveau">+ Nouveau contact</button>' : ''}<button class="btn" data-action="csv">Exporter (Excel)</button>${S.moi.role === 'directeur' ? '<button class="btn" data-action="sauvegarde">Sauvegarder tout</button><button class="btn" data-action="restaurer">Restaurer…</button>' : ''}</div></div>
      <div class="outils" style="margin-bottom:12px"><input type="search" id="recherche" placeholder="Chercher un nom, un téléphone…" value="${esc(S.recherche)}" aria-label="Rechercher">
        <select id="filtre-etape" aria-label="Étape"><option value="">Toutes les étapes</option>${options(CRM.ETAPES, S.filtreEtape)}</select>
        <select id="filtre-source" aria-label="Source"><option value="">Toutes les sources</option>${options(CRM.SOURCES, S.filtreSource)}</select></div>
      <div class="carte" style="padding:6px"><div class="table-defile"><table>
        <tr><th>Nom</th><th>Téléphone</th><th>Formule</th><th>Agence</th><th>Étape</th><th>Source</th><th>Arrivé</th></tr>
        ${l.slice(0, 300).map((c) => `<tr class="clic" data-ouvrir="${c.id}"><td><b style="color:var(--encre)">${esc(nomComplet(c))}</b></td><td style="white-space:nowrap">${esc(telLisible(c.telephone))}</td><td>${esc(c.formule || '')}</td><td>${tagAgence(c.agence)}</td><td>${tagEtape(c.etape)}</td><td class="muet">${esc(c.source)}</td><td class="muet" style="white-space:nowrap">${fmtDepuis(c.cree_le)}</td></tr>`).join('') || '<tr><td colspan="7" class="vide">Aucun contact ne correspond.</td></tr>'}
      </table></div></div>`;
  }

  /* ---------- Tâches ---------- */
  function ligneTache(t) {
    const c = contactDe(t.contact_id), retard = !t.faite && new Date(t.echeance) < new Date();
    return `<div class="tache ${t.faite ? 'faite' : ''}"><input type="checkbox" data-cocher="${t.id}" ${t.faite ? 'checked' : ''} aria-label="Marquer comme fait"><div class="txt"><b>${esc(t.titre)}</b>
      <div class="meta"><span class="${retard ? 'en-retard' : ''}">${retard ? 'En retard · ' : ''}${esc(fmtQuand(t.echeance))}</span>${t.agence ? tagAgence(t.agence) : ''}${t.auto ? '<span class="tag">auto</span>' : ''}${c ? `<button class="btn-lien" data-ouvrir="${c.id}">${esc(nomComplet(c))}</button>${c.telephone ? ` <a href="tel:${esc(c.telephone)}">${esc(telLisible(c.telephone))}</a>` : ''}` : ''}</div></div></div>`;
  }
  function vueTaches() {
    const ts = tachesVisibles(), maint = new Date(), fin = new Date(debutJour().getTime() + JOUR);
    const ouv = ts.filter((t) => !t.faite).sort((a, b) => a.echeance.localeCompare(b.echeance));
    const groupes = [['En retard', ouv.filter((t) => new Date(t.echeance) < maint)], ["Aujourd'hui", ouv.filter((t) => new Date(t.echeance) >= maint && new Date(t.echeance) < fin)], ['À venir', ouv.filter((t) => new Date(t.echeance) >= fin)], ['Faites (7 derniers jours)', ts.filter((t) => t.faite && Date.now() - new Date(t.faite_le) < 7 * JOUR).sort((a, b) => b.faite_le.localeCompare(a.faite_le))]];
    return `<div class="entete"><div><h1>Tâches et rappels</h1><p class="muet">Les tâches « auto » sont créées par les workflows.</p></div><div class="outils"><button class="btn btn-noir" data-action="tache">+ Nouvelle tâche</button></div></div>
      <div class="carte">${groupes.map(([titre, l]) => `<h3 class="groupe-titre">${titre} · ${l.length}</h3>${l.length ? l.map(ligneTache).join('') : '<p class="muet petit" style="margin:4px 0">Rien.</p>'}`).join('')}</div>`;
  }

  /* ---------- Équipe (directeur, en ligne) ---------- */
  function vueEquipe() {
    if (S.moi.role !== 'directeur') return vueTableau();
    return `<div class="entete"><div><h1>Équipe</h1><p class="muet">Pour ajouter quelqu'un : Supabase > Authentication > Users > « Invite user », puis choisir ici son rôle et son agence.</p></div></div>
      <div class="carte" style="padding:6px"><div class="table-defile"><table><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Agence</th></tr>
      ${S.profils.map((p) => `<tr><td><input data-profil="${p.id}" data-champ="nom" value="${esc(p.nom)}" ${p.id === S.moi.id ? '' : ''}></td><td class="muet">${esc(p.email || '')}</td>
        <td><select data-profil="${p.id}" data-champ="role" ${p.id === S.moi.id ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${p.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><select data-profil="${p.id}" data-champ="agence"><option value="">${p.role === 'directeur' ? 'Les 2 agences' : 'Aucune (pas d\'accès)'}</option>${options(CRM.AGENCES, p.agence)}</select></td></tr>`).join('')}
      </table></div></div>`;
  }

  const VUES = { tableau: vueTableau, pipeline: vuePipeline, contacts: vueContacts, taches: vueTaches, offres: vueOffres, paiements: vuePaiements, equipe: vueEquipe };

  /* ---------- Fiche contact ---------- */
  function sectionOrigine(c) {
    const O = CRM.origine;
    const lignes = [['Canal', O.canal(c)], ['Campagne', c.utm_campaign], ['Annonce', c.utm_content], ['Mot-clé', c.utm_term], ['Source / support', [c.utm_source, c.utm_medium].filter(Boolean).join(' / ')], ['Venu de', c.site_precedent], ['Arrivé sur', c.page_arrivee], ['Clic Google Ads', c.gclid ? 'oui (gclid)' : ''], ['Clic Facebook', c.fbclid ? 'oui (fbclid)' : '']].filter(([, v]) => v);
    return `<section><h3>Origine</h3><table class="petit">${lignes.map(([k, v]) => `<tr><td class="muet" style="white-space:nowrap;padding:4px 10px 4px 0;border:0">${k}</td><td style="padding:4px 0;border:0;overflow-wrap:anywhere">${esc(v)}</td></tr>`).join('')}</table></section>`;
  }
  async function rendrePanneau() {
    const racine = document.getElementById('panneau-racine');
    if (!racine) return;
    const c = S.ouvert && contactDe(S.ouvert);
    if (!c) { racine.innerHTML = ''; racine.dataset.contact = ''; document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    const ts = S.taches.filter((t) => t.contact_id === c.id).sort((a, b) => Number(a.faite) - Number(b.faite) || a.echeance.localeCompare(b.echeance));
    const peutModifier = S.moi.role !== 'moniteur' || estEleve(c);
    const etapes = S.moi.role === 'moniteur' ? CRM.ETAPES_ELEVE : CRM.ETAPES;
    const ancien = racine.querySelector('.panneau');
    const deja = ancien && racine.dataset.contact === c.id; // même fiche : pas de nouvelle animation
    const defilement = deja ? ancien.scrollTop : 0;
    racine.dataset.contact = c.id;
    racine.classList.toggle('sans-anim', !!deja);
    racine.innerHTML = `<div class="voile" data-action="fermer"></div><aside class="panneau" role="dialog" aria-modal="true" aria-label="Fiche de ${esc(nomComplet(c))}">
      <header><div class="titre"><h2>${esc(nomComplet(c))}</h2><div class="actions" style="margin-top:6px">${tagAgence(c.agence)}${tagEtape(c.etape)}${c.raison_perte ? `<span class="tag">${esc(c.raison_perte)}</span>` : ''}${c.klaxo_id ? `<span class="tag">Klaxo n° ${esc(c.klaxo_id)}</span>` : ''}${tagOffre(c)}</div></div><button class="fermer" data-action="fermer" aria-label="Fermer">×</button></header>
      <section><div class="actions">
        ${c.telephone ? `<a class="btn btn-vert" href="tel:${esc(c.telephone)}">Appeler ${esc(telLisible(c.telephone))}</a><a class="btn" href="https://wa.me/${esc(telInter(c.telephone))}" target="_blank" rel="noopener">WhatsApp</a>` : '<span class="muet">Pas de téléphone</span>'}
        ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">E-mail</a>` : ''}
      </div>
      ${peutModifier ? `<p class="petit muet" style="margin:12px 0 6px">Après l'appel :</p><div class="actions"><button class="btn" data-appel="oui">A répondu</button><button class="btn" data-appel="non">Pas de réponse</button></div>` : ''}</section>
      <section><h3>Étape</h3><select id="etape-fiche" ${peutModifier ? '' : 'disabled'}>${options(etapes, c.etape)}</select>${c.rdv_le ? `<p class="petit" style="margin:8px 0 0">RDV : <b>${fmtJour(c.rdv_le)} à ${fmtHeure(c.rdv_le)}</b>${c.calcom_uid ? ' · pris en ligne (Cal.com)' : ''}</p>` : ''}
        ${c.etape === CRM.E.RDV && peutModifier ? `<p class="petit muet" style="margin:12px 0 6px">Le jour du RDV :</p><div class="actions"><button class="btn btn-vert" data-rdv="oui">Il est venu</button><button class="btn" data-rdv="non">Pas venu</button></div>` : ''}
        <p class="petit muet" style="margin:10px 0 0">${[c.rdv_pris_le && `RDV pris ${fmtJour(c.rdv_pris_le)}`, c.venu_le && `venu ${fmtJour(c.venu_le)}`, c.inscrit_le && `inscrit ${fmtJour(c.inscrit_le)}`, c.nb_absences && `<span class="en-retard">${c.nb_absences} absence${c.nb_absences > 1 ? 's' : ''}</span>`].filter(Boolean).join(' · ')}</p></section>
      ${voitArgent() ? sectionPaiements(c) : ''}
      <section><h3>Tâches</h3>${ts.length ? ts.map(ligneTache).join('') : '<p class="muet petit" style="margin:0">Aucune tâche.</p>'}<button class="btn btn-petit" style="margin-top:10px" data-action="tache-fiche">+ Tâche</button></section>
      <section><h3>Ajouter une note</h3><form id="form-note"><textarea name="note" placeholder="Ex. : passe en agence samedi avec sa mère" required></textarea><button class="btn btn-noir btn-petit" style="margin-top:8px">Enregistrer la note</button></form></section>
      <section><h3>Informations</h3><form id="form-infos" class="champs">
        <div class="champ"><label>Prénom</label><input name="prenom" value="${esc(c.prenom)}"></div><div class="champ"><label>Nom</label><input name="nom" value="${esc(c.nom)}"></div>
        <div class="champ"><label>Téléphone</label><input name="telephone" type="tel" value="${esc(telLisible(c.telephone))}"></div><div class="champ"><label>E-mail</label><input name="email" type="email" value="${esc(c.email || '')}"></div>
        <div class="champ"><label>Formule</label><select name="formule">${options(CRM.FORMULES, c.formule)}</select></div>
        <div class="champ"><label>Agence</label><select name="agence" ${agenceFixe() ? 'disabled' : ''}>${options(CRM.AGENCES, c.agence)}</select></div>
        <div class="champ"><label>Source</label><select name="source">${options(CRM.SOURCES, c.source)}</select></div>
        <div class="champ"><label>Code promo</label><input name="code_promo" value="${esc(c.code_promo || '')}" autocomplete="off" style="text-transform:uppercase"></div>
        <div class="champ"><label>N° élève Klaxo</label><input name="klaxo_id" value="${esc(c.klaxo_id || '')}" autocomplete="off"></div>
        <div class="champ" style="align-self:end"><button class="btn" ${peutModifier ? '' : 'disabled'}>Enregistrer</button></div>
      </form><p class="petit muet" style="margin:10px 0 0">Créé ${fmtDepuis(c.cree_le)}${c.page ? ` · page « ${esc(c.page)} »` : ''}</p>
      ${c.message ? `<p style="margin:8px 0 0;white-space:pre-wrap">« ${esc(c.message)} »</p>` : ''}</section>
      ${sectionOrigine(c)}
      <section><h3>Historique</h3><ul class="chrono" id="chrono"><li class="muet">Chargement…</li></ul></section>
      ${S.moi.role === 'directeur' ? '<section><button class="btn btn-rouge btn-petit" data-action="supprimer">Supprimer cette fiche</button></section>' : ''}
    </aside>`;
    const p = racine.querySelector('.panneau'); p.scrollTop = defilement;
    if (!deja) racine.querySelector('.fermer').focus();
    try {
      const acts = await D.activites(c.id);
      const ul = document.getElementById('chrono');
      if (ul && S.ouvert === c.id) ul.innerHTML = acts.map((a) => `<li class="t-${a.type}"><span class="quand">${fmtQuand(a.cree_le)}${a.auteur ? ' · ' + esc(a.auteur) : ''}</span><p>${esc(a.texte)}</p></li>`).join('') || '<li class="muet">Rien pour l\'instant.</li>';
    } catch (e) { erreur(e); }
  }

  /* ---------- Événements ---------- */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action],[data-ouvrir],[data-connexion-demo],[data-appel],[data-rdv],[data-offre],[data-encaisser],[data-suppr-paiement]');
    if (!el) return;
    if (el.dataset.connexionDemo) { S.moi = await D.connexionDemo(el.dataset.connexionDemo); return recharger(); }
    if (el.dataset.ouvrir) { S.ouvert = el.dataset.ouvrir; return rendrePanneau(); }
    const c = S.ouvert && contactDe(S.ouvert);
    if (el.dataset.appel) return noterAppel(c, el.dataset.appel === 'oui');
    if (el.dataset.rdv) return marquerRdv(c, el.dataset.rdv === 'oui');
    if (el.dataset.encaisser) return encaisser(el.dataset.encaisser);
    if (el.dataset.offre) { S.offreChoisie = el.dataset.offre; return rendre(); }
    if (el.dataset.supprPaiement) return supprimerPaiement(el.dataset.supprPaiement);
    switch (el.dataset.action) {
      case 'fermer': S.ouvert = null; if (location.hash.startsWith('#contact/')) history.replaceState(null, '', '#' + S.vue); return rendrePanneau();
      case 'nouveau': return nouveauContact();
      case 'tache': return nouvelleTache(null);
      case 'tache-fiche': return nouvelleTache(c);
      case 'simuler': return simulerDemande();
      case 'simuler-rdv': return simulerRdv();
      case 'reinit': if (confirm('Remettre les exemples fictifs ? Ce que vous avez saisi en démo sera effacé.')) { await D.reinitialiser(); S.ouvert = null; return recharger(); } return;
      case 'vider': if (confirm('Vider complètement la démo ?')) { await D.viderTout(); S.ouvert = null; return recharger(); } return;
      case 'csv': return exporterCSV();
      case 'paiement': return paiementRecu(c);
      case 'echeancier': return echeancier(c);
      case 'csv-paiements': return exporterPaiementsCSV();
      case 'offre-nouvelle': return editerOffre(null);
      case 'offre-modifier': return editerOffre(S.offres.find((o) => o.id === S.offreChoisie));
      case 'sauvegarde': return sauvegarderTout();
      case 'restaurer': return restaurer();
      case 'notifs': try { await Notification.requestPermission(); } catch (er) {} return rendre();
      case 'deconnexion': await D.deconnexion(); rappelFait = false; S.moi = null; S.ouvert = null; return rendre();
      case 'supprimer': if (c && confirm(`Supprimer définitivement la fiche de ${nomComplet(c)} et son historique ?`)) { await D.supprimerContact(c.id).catch(erreur); S.ouvert = null; return recharger(); } return;
      case 'oubli': {
        const email = document.getElementById('email').value;
        if (!email) return rendreConnexion("Tapez d'abord votre e-mail, puis recliquez.");
        try { await D.motDePasseOublie(email); rendreConnexion('Un e-mail vient de partir pour choisir un nouveau mot de passe.'); } catch (er) { rendreConnexion(er.message); }
      }
    }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'choix-agence') { S.agence = t.value; try { localStorage.setItem('crm-pp-agence', t.value); } catch (er) {} return rendre(); }
    if (t.id === 'filtre-etape') { S.filtreEtape = t.value; return rendre(); }
    if (t.id === 'pub-groupe') { S.pubGroupe = t.value; return rendre(); }
    if (t.id === 'pub-jours') { S.pubJours = Number(t.value); return rendre(); }
    if (t.id === 'filtre-source') { S.filtreSource = t.value; return rendre(); }
    if (t.id === 'etape-fiche') return changerEtape(contactDe(S.ouvert), t.value);
    if (t.dataset.cocher) { await D.majTache(t.dataset.cocher, { faite: t.checked, faite_le: t.checked ? new Date().toISOString() : null }).catch(erreur); return recharger(); }
    if (t.dataset.profil) { await D.majProfil(t.dataset.profil, { [t.dataset.champ]: t.value || null }).then(() => toast('Équipe mise à jour')).catch(erreur); return recharger(); }
  });

  let minuterie;
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'recherche') return;
    S.recherche = e.target.value; clearTimeout(minuterie);
    minuterie = setTimeout(() => { const pos = e.target.selectionStart; rendre(); const i = document.getElementById('recherche'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 180);
  });

  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id === 'form-connexion') {
      e.preventDefault();
      const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Connexion…';
      try { S.moi = await D.connexion(f.email.value.trim(), f.mdp.value); await demarrerEnLigne(); } catch (er) { rendreConnexion(er.message); }
    }
    if (f.id === 'form-prix') {
      e.preventDefault();
      const prix = f.prix.value.trim() ? lireMontant(f.prix.value) : null;
      if (prix !== null && !(prix >= 0)) return toast('Montant illisible');
      await D.majContact(S.ouvert, { prix_total: prix }).then(() => D.ajouterActivite({ contact_id: S.ouvert, type: 'note', texte: `Prix total : ${prix === null ? 'effacé' : euros(prix)}`, auteur: S.moi.nom })).then(() => toast('Prix enregistré')).catch(erreur);
      return recharger();
    }
    if (f.id === 'form-note') {
      e.preventDefault();
      await D.ajouterActivite({ contact_id: S.ouvert, type: 'note', texte: f.note.value.trim(), auteur: S.moi.nom }).catch(erreur);
      return recharger();
    }
    if (f.id === 'form-infos') {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      v.telephone = CRM.normaliserTel(v.telephone) || null; v.email = v.email || null; v.klaxo_id = (v.klaxo_id || '').trim() || null;
      v.code_promo = (v.code_promo || '').trim().toUpperCase() || null;
      const c0 = contactDe(S.ouvert), offre = v.code_promo && !c0.offre_id && CRM.offres.offrePour(S.offres, v.code_promo);
      // Code donné en agence ou au téléphone : on relie la fiche à l'offre (date limite comptée depuis aujourd'hui).
      if (offre) Object.assign(v, CRM.offres.liaisonOffre(offre, new Date().toISOString(), v.code_promo).champs);
      await D.majContact(S.ouvert, v).then(() => toast('Fiche enregistrée')).catch(erreur);
      if (offre) {
        await D.ajouterActivite({ contact_id: S.ouvert, type: 'note', texte: `Offre « ${offre.nom} » ajoutée (code ${v.code_promo}) · avant le ${fmtJour(v.offre_limite + 'T12:00')}`, auteur: S.moi.nom });
        if (!CRM.aAtteint(c0, CRM.E.VENU)) await creerTaches(c0, [CRM.offres.tacheOffre(c0, offre, v.offre_limite)]);
      }
      return recharger();
    }
  });

  // Glisser-déposer dans le pipeline
  let tire = null;
  document.addEventListener('dragstart', (e) => { const f = e.target.closest('.fiche-mini'); if (!f) return; tire = f.dataset.ouvrir; f.classList.add('tire'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tire); });
  document.addEventListener('dragend', (e) => { const f = e.target.closest && e.target.closest('.fiche-mini'); if (f) f.classList.remove('tire'); document.querySelectorAll('.survol').forEach((x) => x.classList.remove('survol')); });
  document.addEventListener('dragover', (e) => { const col = e.target.closest('[data-colonne]'); if (!col || !tire) return; e.preventDefault(); document.querySelectorAll('.survol').forEach((x) => x !== col && x.classList.remove('survol')); col.classList.add('survol'); });
  document.addEventListener('drop', (e) => { const col = e.target.closest('[data-colonne]'); if (!col || !tire) return; e.preventDefault(); const id = tire; tire = null; changerEtape(contactDe(id), col.dataset.colonne); });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ouvert && !document.querySelector('dialog[open]')) { S.ouvert = null; rendrePanneau(); } });

  function lireAdresse() {
    const h = location.hash.slice(1);
    if (h.startsWith('contact/')) { S.ouvert = h.slice(8); return; }
    S.vue = VUES[h] ? h : 'tableau';
  }
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#contact/')) S.ouvert = null; lireAdresse(); S.moi && rendre(); window.scrollTo(0, 0); });

  async function demarrerEnLigne() {
    if (D.doitChoisirMdp) {
      D.doitChoisirMdp = false;
      history.replaceState(null, '', location.pathname + '#tableau');
      const r = await demander('Choisissez votre mot de passe', `<p class="muet petit" style="margin:0">Au moins 8 caractères. Il servira à vous connecter au CRM.</p><div class="champ"><label>Nouveau mot de passe</label><input type="password" name="mdp" minlength="8" required autocomplete="new-password"></div>`);
      if (r) await D.changerMotDePasse(r.mdp).then(() => toast('Mot de passe enregistré')).catch(erreur);
    }
    if (S.moi.role !== 'directeur' && !S.moi.agence) {
      $app.innerHTML = `<div class="ecran-connexion"><div class="carte"><h1>Compte en attente</h1><p>Votre compte existe, mais Adama doit encore vous attribuer une agence (menu Équipe du CRM).</p><button class="btn" data-action="deconnexion">Se déconnecter</button></div></div>`;
      return;
    }
    D.surChangement((quoi, ligne) => { recharger().then(() => quoi === 'nouveau-contact' && alerteNouvelle(contactDe(ligne.id) || ligne)); });
    await recharger();
  }

  // Démarrage
  (async function () {
    try { S.agence = localStorage.getItem('crm-pp-agence') || 'Toutes'; } catch (e) {}
    lireAdresse();
    try {
      S.moi = await D.demarrer();
      if (!S.moi) return rendreConnexion();
      if (D.mode === 'supabase') await demarrerEnLigne(); else await recharger();
      setInterval(() => S.moi && !document.querySelector('dialog[open]') && !S.ouvert && rendre(), 60000); // met à jour « en retard »
    } catch (e) {
      $app.innerHTML = `<p class="chargement">Impossible de démarrer le CRM : ${esc(e.message)}<br>Vérifiez la connexion internet et le fichier config.js.</p>`;
    }
  })();
})();

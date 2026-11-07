/* CRM Premium Permis : accès aux données.
   - Si config.js contient l'adresse Supabase → vraies données en ligne.
   - Sinon → « mode démo » : données fictives gardées dans ce navigateur seulement. */
(function () {
  const CRM = window.CRM;
  const cfg = window.CRM_CONFIG || {};
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const maintenant = () => new Date().toISOString();
  const normaliserTel = (t = '') => {
    let d = String(t).replace(/[^\d+]/g, '');
    if (d.startsWith('+33')) d = '0' + d.slice(3);
    if (d.startsWith('0033')) d = '0' + d.slice(4);
    return d.replace(/\D/g, '');
  };

  const origineDe = (d) => Object.fromEntries(CRM.CHAMPS_ORIGINE.map((k) => [k, (d[k] || '').trim() || null]));

  /* ---------- Mode démo (navigateur) ---------- */
  const CLE = 'crm-premium-permis-demo';
  const PROFILS_DEMO = [
    { id: 'demo-directeur', nom: 'Adama', role: 'directeur', agence: null, email: 'démo' },
    { id: 'demo-boissy', nom: 'Secrétariat Boissy', role: 'secretaire', agence: 'Boissy', email: 'démo' },
    { id: 'demo-paris', nom: 'Secrétariat Paris 5e', role: 'secretaire', agence: 'Paris 5e', email: 'démo' },
    { id: 'demo-moniteur', nom: 'Moniteur Boissy', role: 'moniteur', agence: 'Boissy', email: 'démo' },
  ];

  // Origines inventées pour la démo (noms de campagnes préfixés « demo- »).
  const OFFRE_DEMO = { id: 'offre-black-friday-2026', nom: 'Black Friday 2026', code: 'BLACKPERMIS26', formulaire: 'black-friday', avantage: '100 € offerts sur le permis + paiement en 3 fois sans frais', debut: '2026-11-09', fin: '2026-12-01', delai_jours: 14, limite_fixe: '2026-12-01', actif: true, cree_le: '2026-11-07T00:00:00Z' };
  const ORIGINES_DEMO = [
    { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'demo-permis-b-boissy', utm_content: 'annonce-prix', gclid: 'demo', site_precedent: 'https://www.google.com/' },
    { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'demo-conduite-accompagnee', utm_content: 'video-moniteur', fbclid: 'demo', site_precedent: 'https://m.facebook.com/' },
    { site_precedent: 'https://www.google.com/' },
    { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'demo-permis-b-boissy', utm_content: 'annonce-financement', gclid: 'demo' },
    { site_precedent: 'accès direct' },
    { utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'demo-moto-printemps', utm_content: 'carrousel-moto', fbclid: 'demo' },
    { utm_source: 'google (gclid)', gclid: 'demo' },
    {},
  ];
  function exemplesFictifs() {
    // Prénoms inventés, numéros en 06 00 00 00 xx : rien de réel.
    const noms = ['Lina', 'Yanis', 'Sarah', 'Mehdi', 'Chloé', 'Rayan', 'Inès', 'Lucas', 'Aya', 'Noah', 'Jade', 'Adam', 'Léa', 'Ibrahim', 'Manon', 'Sami', 'Emma', 'Kenza', 'Hugo', 'Maël', 'Nora', 'Tom', 'Zoé', 'Bilal'];
    const s = { contacts: [], activites: [], taches: [], paiements: [], offres: [{ ...OFFRE_DEMO }], profils: PROFILS_DEMO };
    const J = 864e5;
    noms.forEach((p, i) => {
      const age = ((i * 37) % 56) * J + (i % 5) * 3600e3;
      const etape = CRM.ETAPES[[0, 0, 1, 2, 4, 5, 6, 1, 0, 3, 7, 8, 2, 5, 6, 0, 4, 8, 1, 5, 3, 6, 0, 2][i]];
      const c = {
        id: uid(), prenom: p, nom: '(démo)', telephone: '06000000' + String(10 + i), email: null,
        formule: CRM.FORMULES[i % 4], agence: CRM.AGENCES[i % 3 === 0 ? 1 : 0],
        source: CRM.SOURCES[[0, 0, 1, 2, 0, 3, 0, 4][i % 8]], page: 'accueil', message: null,
        etape, rdv_le: etape === CRM.E.RDV ? new Date(Date.now() + 2 * J).toISOString() : null,
        rdv_pris_le: CRM.rang(etape) >= 2 && etape !== 'Perdu' ? new Date(Date.now() - age * 0.8).toISOString() : null,
        venu_le: CRM.rang(etape) >= 3 && etape !== 'Perdu' ? new Date(Date.now() - age * 0.7).toISOString() : null,
        inscrit_le: CRM.rang(etape) >= 4 && etape !== 'Perdu' ? new Date(Date.now() - age * 0.6).toISOString() : null,
        klaxo_id: null, nb_absences: i % 7 === 2 ? 1 : 0,
        raison_perte: etape === 'Perdu' ? 'Trop cher' : null, responsable: null,
        cree_le: new Date(Date.now() - age).toISOString(), maj_le: new Date(Date.now() - age / 2).toISOString(),
        etape_le: new Date(Date.now() - age / 2).toISOString(),
        ...ORIGINES_DEMO[i % ORIGINES_DEMO.length],
      };
      if ([1, 4, 8, 12, 15, 21].includes(i)) {   // demandes fictives venues par le code Black Friday
        const jour = new Date(Date.now() - (i % 9) * J).toISOString();
        Object.assign(c, { source: 'Site : offre', cree_le: jour, ...CRM.offres.liaisonOffre(OFFRE_DEMO, jour, 'BLACKPERMIS26').champs });
      }
      s.contacts.push(c);
      s.activites.push({ id: uid(), contact_id: c.id, type: 'demande', texte: 'Exemple fictif créé par le mode démo', auteur: 'Démo', cree_le: c.cree_le });
      // Paiements fictifs pour les élèves inscrits (montants inventés, pour la démo seulement).
      if (CRM.ETAPES_ELEVE.includes(etape)) {
        c.prix_total = [1290, 1490, 990, 1190][i % 4];
        const paye = (n, jours, moyen) => s.paiements.push({ id: uid(), contact_id: c.id, montant: n, moyen, statut: 'paye', date_prevue: null, paye_le: new Date(Date.now() - jours * J).toISOString(), note: null, auteur: 'Démo', cree_le: c.cree_le });
        paye(Math.round(c.prix_total / 3), Math.min(50, age / J), 'Carte bancaire');
        if (i % 3) paye(Math.round(c.prix_total / 3), Math.min(20, age / J / 2), i % 2 ? 'Chèque' : 'Espèces');
        const prevu = { id: uid(), contact_id: c.id, montant: c.prix_total - Math.round(c.prix_total / 3) * (i % 3 ? 2 : 1), moyen: 'Carte bancaire', statut: 'prevu', date_prevue: new Date(Date.now() + ((i % 4) * 9 - 6) * J).toISOString().slice(0, 10), paye_le: null, note: null, auteur: 'Démo', cree_le: c.cree_le };
        s.paiements.push(prevu);
      }
      if (etape === 'Nouveau') s.taches.push({ id: uid(), contact_id: c.id, agence: c.agence, titre: `Rappeler ${p} (nouvelle demande du site)`, echeance: new Date(Date.parse(c.cree_le) + J).toISOString(), auto: true, faite: false, faite_le: null, assigne: null, cree_le: c.cree_le });
    });
    return s;
  }

  function lireDemo() {
    try { const s = JSON.parse(localStorage.getItem(CLE)); if (s && s.contacts) { s.paiements = s.paiements || []; s.offres = s.offres || [{ ...OFFRE_DEMO }]; for (const o of s.offres) if (o.id === OFFRE_DEMO.id && !o.limite_fixe) { o.limite_fixe = OFFRE_DEMO.limite_fixe; for (const c of s.contacts) if (c.offre_id === o.id) c.offre_limite = o.limite_fixe; } for (const c of s.contacts) c.etape = { RDV: 'RDV pris', Inscrit: 'Inscrit (Klaxo)' }[c.etape] || c.etape; return s; } } catch (e) { /* stockage indisponible */ }
    const s = exemplesFictifs(); ecrireDemo(s); return s;
  }
  function ecrireDemo(s) { try { localStorage.setItem(CLE, JSON.stringify(s)); } catch (e) { /* tant pis : la démo reste en mémoire */ } }

  const demo = {
    mode: 'demo',
    s: null,
    async demarrer() { this.s = lireDemo(); let id = null; try { id = sessionStorage.getItem(CLE + '-moi'); } catch (e) {} return this.s.profils.find((p) => p.id === id) || null; },
    profilsDemo: PROFILS_DEMO,
    async connexionDemo(id) { try { sessionStorage.setItem(CLE + '-moi', id); } catch (e) {} return this.s.profils.find((p) => p.id === id); },
    async deconnexion() { try { sessionStorage.removeItem(CLE + '-moi'); } catch (e) {} },
    async reinitialiser() { this.s = exemplesFictifs(); ecrireDemo(this.s); },
    async viderTout() { this.s = { contacts: [], activites: [], taches: [], paiements: [], offres: [{ ...OFFRE_DEMO }], profils: PROFILS_DEMO }; ecrireDemo(this.s); },
    async contacts() { return [...this.s.contacts]; },
    async creerContact(c) { const n = { id: uid(), prenom: '', nom: '', etape: 'Nouveau', cree_le: maintenant(), maj_le: maintenant(), etape_le: maintenant(), ...c }; this.s.contacts.push(n); ecrireDemo(this.s); return n; },
    async majContact(id, champs) { const c = this.s.contacts.find((x) => x.id === id); Object.assign(c, champs, { maj_le: maintenant() }); ecrireDemo(this.s); return c; },
    async supprimerContact(id) { this.s.contacts = this.s.contacts.filter((x) => x.id !== id); this.s.activites = this.s.activites.filter((a) => a.contact_id !== id); this.s.taches = this.s.taches.filter((t) => t.contact_id !== id); ecrireDemo(this.s); },
    async activites(contactId) { return this.s.activites.filter((a) => a.contact_id === contactId).sort((a, b) => b.cree_le.localeCompare(a.cree_le)); },
    async toutesActivites() { return [...this.s.activites]; },
    async ajouterActivite(a) { const n = { id: uid(), cree_le: maintenant(), ...a }; this.s.activites.push(n); ecrireDemo(this.s); return n; },
    async taches() { return [...this.s.taches]; },
    async creerTache(t) { const n = { id: uid(), faite: false, faite_le: null, auto: false, cree_le: maintenant(), ...t }; this.s.taches.push(n); ecrireDemo(this.s); return n; },
    async majTache(id, champs) { const t = this.s.taches.find((x) => x.id === id); Object.assign(t, champs); ecrireDemo(this.s); return t; },
    async supprimerTache(id) { this.s.taches = this.s.taches.filter((x) => x.id !== id); ecrireDemo(this.s); },
    async profils() { return [...this.s.profils]; },
    async majProfil() { /* pas d'équipe à gérer en démo */ },
    async paiements() { return [...this.s.paiements]; },
    async offres() { return [...this.s.offres]; },
    async creerOffre(o) { const n = { id: uid(), actif: true, cree_le: maintenant(), ...o }; this.s.offres.push(n); ecrireDemo(this.s); return n; },
    async majOffre(id, champs) { const o = this.s.offres.find((x) => x.id === id); Object.assign(o, champs); ecrireDemo(this.s); return o; },
    async creerPaiement(p) { const n = { id: uid(), statut: 'paye', cree_le: maintenant(), ...p }; this.s.paiements.push(n); ecrireDemo(this.s); return n; },
    async majPaiement(id, champs) { const p = this.s.paiements.find((x) => x.id === id); Object.assign(p, champs); ecrireDemo(this.s); return p; },
    async supprimerPaiement(id) { this.s.paiements = this.s.paiements.filter((x) => x.id !== id); this.s.taches = this.s.taches.filter((t) => t.paiement_id !== id); ecrireDemo(this.s); },
    async toutExporter() { return { offres: [...this.s.offres], contacts: [...this.s.contacts], activites: [...this.s.activites], taches: [...this.s.taches], paiements: [...this.s.paiements] }; },
    async toutRestaurer(b) {
      for (const t of ['offres', 'contacts', 'activites', 'paiements', 'taches']) {
        this.s[t] = this.s[t] || [];
        const ids = new Map(this.s[t].map((x, i) => [x.id, i]));
        for (const x of b[t] || []) { if (ids.has(x.id)) this.s[t][ids.get(x.id)] = x; else this.s[t].push(x); }
      }
      ecrireDemo(this.s);
    },
    surChangement() { /* rien en démo : la simulation appelle directement le rafraîchissement */ },

    /* Fait comme si le site venait d'envoyer un formulaire (même logique que la fonction Supabase). */
    async simulerDemande(d) {
      const tel = normaliserTel(d.telephone);
      const W = CRM.workflows, regle = W.regleFormulaire(d.formulaire, d);
      const agence = /paris/i.test(d.agence || '') ? 'Paris 5e' : 'Boissy';
      d = { ...d, formule: W.formuleDe(d) };
      let c = this.s.contacts.find((x) => tel && x.telephone === tel && !['Perdu', 'Permis obtenu'].includes(x.etape));
      if (!c) c = await this.creerContact({ prenom: d.prenom, nom: d.nom || '', telephone: tel || null, email: d.email || null, formule: d.formule || null, agence, source: regle.source, page: d.page, message: d.message || null, ...origineDe(d) });
      else if (!c.utm_source && !c.site_precedent) Object.assign(c, origineDe(d));
      const lignes = [`Demande « ${d.formulaire} » depuis la page ${d.page}`, regle.chaud && 'Prospect chaud', d.formule && `Formule : ${d.formule}`, d.centre && `Centre d'examen : ${d.centre}`, d.situation && `Situation : ${d.situation}`, d.code && `Code : ${d.code}`, d.debut && `Début souhaité : ${d.debut}`, d.code_promo && `Code promo : ${d.code_promo}`, regle.sansAgence && W.agenceInconnue(d) && 'Agence non précisée par le formulaire : rangé à Boissy, à corriger si besoin', d.message && `Message : ${d.message}`, d.utm_source && `Origine : source ${d.utm_source}${d.utm_campaign ? ' · campagne ' + d.utm_campaign : ''}${d.utm_content ? ' · annonce ' + d.utm_content : ''}`, !d.utm_source && d.site_precedent && `Origine : venu de ${d.site_precedent}`];
      await this.ajouterActivite({ contact_id: c.id, type: 'demande', texte: lignes.filter(Boolean).join('\n'), auteur: 'Site internet (simulation)' });
      await this.creerTache({ contact_id: c.id, agence: c.agence, ...CRM.workflows.tacheNouvelleDemande(c, d.formulaire, d) });
      const offre = (d.code_promo || d.formulaire === 'black-friday') && CRM.offres.offrePour(this.s.offres, d.code_promo, d.formulaire);
      if (offre && !c.offre_id) {
        const l = CRM.offres.liaisonOffre(offre, maintenant(), d.code_promo);
        Object.assign(c, l.champs); ecrireDemo(this.s);
        await this.ajouterActivite({ contact_id: c.id, type: 'note', texte: `Offre « ${offre.nom} » (${offre.avantage}) · doit passer en agence avant le ${new Date(l.limite + 'T12:00').toLocaleDateString('fr-FR')}${l.horsPeriode ? " · ⚠️ demande hors période de l'offre" : ''}`, auteur: 'CRM' });
        await this.creerTache({ contact_id: c.id, agence: c.agence, ...CRM.offres.tacheOffre(c, offre, l.limite) });
      }
      await this.ajouterActivite({ contact_id: c.id, type: 'email', texte: `Mode démo : en ligne, un e-mail partirait ici${regle.sansAgence && W.agenceInconnue(d) ? ' (adresse par défaut)' : " vers l'agence " + c.agence}.`, auteur: 'CRM' });
      return c;
    },

    /* Fait comme si Cal.com envoyait un rendez-vous (même logique que supabase/functions/rdv-calcom). */
    async simulerReservation(envoi) {
      const K = CRM.calcom, r = K.lireReservation(envoi), tel = normaliserTel(r.tel), RDV = CRM.E.RDV;
      const ouvert = (x) => !['Perdu', 'Permis obtenu'].includes(x.etape);
      let c = this.s.contacts.find((x) => x.calcom_uid && [r.uid, r.ancienUid].includes(x.calcom_uid))
        || this.s.contacts.find((x) => tel && x.telephone === tel && ouvert(x))
        || this.s.contacts.find((x) => r.email && (x.email || '').toLowerCase() === r.email && ouvert(x));
      const note = (type, texte) => this.ajouterActivite({ contact_id: c.id, type, texte, auteur: 'Cal.com (simulation)' });
      const fermer = (re) => this.s.taches.filter((t) => t.contact_id === c.id && !t.faite && re.test(t.titre)).forEach((t) => Object.assign(t, { faite: true, faite_le: maintenant() }));
      if (/CANCELLED|REJECTED/.test(r.evenement)) {
        if (!c) return null;
        const avant = c.rdv_le, recule = c.etape === RDV;
        Object.assign(c, { rdv_le: null, calcom_uid: null }, recule ? { etape: 'Rappelé', etape_le: maintenant() } : {});
        await note('etape', `RDV annulé en ligne${avant ? ` (il était prévu ${K.quandRdv(avant)})` : ''}${r.motif ? ` · motif : ${r.motif}` : ''}`);
        if (recule) await note('etape', `Étape : ${RDV} → Rappelé (RDV annulé)`);
        fermer(K.CONFIRMER);
        await this.creerTache({ contact_id: c.id, agence: c.agence, ...K.tacheRdvAnnule(c) });
        return c;
      }
      const deplace = r.evenement === 'BOOKING_RESCHEDULED', nouveau = !c;
      if (!c) c = await this.creerContact({ prenom: r.prenom, nom: r.nom, telephone: tel || null, email: r.email || null, formule: r.formule || null, agence: r.agence, source: 'Site : rendez-vous', page: r.page ? `Cal.com (page ${r.page})` : 'Cal.com', message: r.notes || null, ...r.origine });
      const ancienRdv = c.rdv_le, ancienne = c.etape, avance = CRM.rang(c.etape) < CRM.rang(RDV);
      Object.assign(c, { rdv_le: r.debut, calcom_uid: r.uid, rdv_pris_le: c.rdv_pris_le || maintenant() }, avance ? { etape: RDV, etape_le: maintenant() } : {});
      if (!c.nom && r.nom) c.nom = r.nom;
      if (!nouveau && !c.utm_source && !c.site_precedent) Object.assign(c, r.origine);
      const autreAgence = !nouveau && c.agence !== r.agence ? `⚠️ RDV pris à ${r.agence}, alors que la fiche est rangée à ${c.agence}` : '';
      if (deplace && ancienRdv) await note('etape', `RDV déplacé en ligne : ${K.quandRdv(ancienRdv)} → ${K.quandRdv(r.debut)}${r.motif ? ` (${r.motif})` : ''}`);
      else await note('demande', [`RDV pris en ligne (Cal.com) pour ${K.quandRdv(r.debut)}, agence ${r.agence}`, /inscri/i.test(r.but) ? "Prospect chaud (veut s'inscrire)" : r.but && `Motif : ${r.but}`, r.formule && `Formule : ${r.formule}`, r.formuleSite && `Bouton de tarif cliqué sur le site : ${r.formuleSite}`, r.page && `Réservé depuis la page ${r.page}${r.pagePrecedente ? ` (page précédente : ${r.pagePrecedente})` : ''}`, r.notes && `Message : ${r.notes}`, autreAgence, r.origine.utm_source && `Origine : source ${r.origine.utm_source}${r.origine.utm_campaign ? ' · campagne ' + r.origine.utm_campaign : ''}`].filter(Boolean).join('\n'));
      if (avance) await note('etape', `Étape : ${ancienne} → ${RDV} (réservé en ligne)`);
      if (c.offre_limite && r.debut.slice(0, 10) > c.offre_limite) await note('note', `⚠️ Ce RDV est après la date limite de l'offre (${new Date(c.offre_limite + 'T12:00').toLocaleDateString('fr-FR')})`);
      fermer(deplace ? K.CONFIRMER : new RegExp(`${K.AVANT_RDV.source}|${K.CONFIRMER.source}`));
      await this.creerTache({ contact_id: c.id, agence: c.agence, ...K.tacheConfirmerRdv(c, r.debut) });
      await note('email', `Mode démo : en ligne, un e-mail « ${deplace ? 'RDV déplacé' : 'Nouveau RDV'} » partirait vers l'agence ${r.agence}.`);
      return c;
    },
  };

  /* ---------- Mode en ligne (Supabase) ---------- */
  const enLigne = {
    mode: 'supabase',
    sb: null,
    moi: null,
    async demarrer() {
      // Arrivée par le lien d'invitation ou « mot de passe oublié » : il faudra choisir un mot de passe.
      this.doitChoisirMdp = /type=(invite|recovery)/.test(location.hash);
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
      this.sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      const { data } = await this.sb.auth.getSession();
      return data.session ? this.chargerMoi(data.session.user) : null;
    },
    async chargerMoi(user) {
      const { data } = await this.sb.from('profils').select('*').eq('id', user.id).maybeSingle();
      this.moi = data || { id: user.id, nom: user.email, email: user.email, role: 'secretaire', agence: null };
      return this.moi;
    },
    async connexion(email, mdp) {
      const { data, error } = await this.sb.auth.signInWithPassword({ email, password: mdp });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou mot de passe incorrect.' : error.message);
      return this.chargerMoi(data.user);
    },
    async motDePasseOublie(email) {
      const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
      if (error) throw error;
    },
    async changerMotDePasse(mdp) { const { error } = await this.sb.auth.updateUser({ password: mdp }); if (error) throw error; },
    async deconnexion() { await this.sb.auth.signOut(); },
    async q(promesse) { const { data, error } = await promesse; if (error) throw new Error(error.message); return data; },
    async contacts() { return this.q(this.sb.from('contacts').select('*').order('cree_le', { ascending: false }).limit(5000)); },
    async creerContact(c) { if (c.telephone) c.telephone = normaliserTel(c.telephone); return this.q(this.sb.from('contacts').insert(c).select().single()); },
    async majContact(id, champs) { return this.q(this.sb.from('contacts').update({ ...champs, maj_le: maintenant() }).eq('id', id).select().single()); },
    async supprimerContact(id) { return this.q(this.sb.from('contacts').delete().eq('id', id)); },
    async activites(contactId) { return this.q(this.sb.from('activites').select('*').eq('contact_id', contactId).order('cree_le', { ascending: false })); },
    async toutesActivites() { return this.q(this.sb.from('activites').select('contact_id,type,cree_le').gte('cree_le', new Date(Date.now() - 120 * 864e5).toISOString())); },
    async ajouterActivite(a) { return this.q(this.sb.from('activites').insert(a).select().single()); },
    async taches() { return this.q(this.sb.from('taches').select('*').or(`faite.eq.false,faite_le.gte.${new Date(Date.now() - 30 * 864e5).toISOString()}`).order('echeance')); },
    async creerTache(t) { return this.q(this.sb.from('taches').insert(t).select().single()); },
    async majTache(id, champs) { return this.q(this.sb.from('taches').update(champs).eq('id', id).select().single()); },
    async supprimerTache(id) { return this.q(this.sb.from('taches').delete().eq('id', id)); },
    async profils() { return this.q(this.sb.from('profils').select('*').order('nom')); },
    async majProfil(id, champs) { return this.q(this.sb.from('profils').update(champs).eq('id', id)); },
    // Paiements : si la table n'existe pas encore (paiements.sql pas lancé) ou si on est moniteur, liste vide.
    async paiements() { const { data, error } = await this.sb.from('paiements').select('*').order('cree_le').limit(10000); return error ? [] : data; },
    async creerPaiement(p) { return this.q(this.sb.from('paiements').insert(p).select().single()); },
    async offres() { const { data, error } = await this.sb.from('offres').select('*').order('debut', { ascending: false }); return error ? [] : data; },
    async creerOffre(o) { return this.q(this.sb.from('offres').insert(o).select().single()); },
    async majOffre(id, champs) { return this.q(this.sb.from('offres').update(champs).eq('id', id).select().single()); },
    async majPaiement(id, champs) { return this.q(this.sb.from('paiements').update(champs).eq('id', id).select().single()); },
    async supprimerPaiement(id) { return this.q(this.sb.from('paiements').delete().eq('id', id)); },
    // Lit une table en entier, par paquets de 1000 lignes (limite de Supabase).
    async toutLire(table) {
      const tout = [];
      for (let de = 0; ; de += 1000) {
        const lot = await this.q(this.sb.from(table).select('*').order('cree_le').range(de, de + 999));
        tout.push(...lot);
        if (lot.length < 1000) return tout;
      }
    },
    async toutExporter() {
      return { offres: await this.offres(), contacts: await this.toutLire('contacts'), activites: await this.toutLire('activites'), taches: await this.toutLire('taches'), paiements: await this.paiements(), profils: await this.toutLire('profils') };
    },
    async toutRestaurer(b) {
      // Les comptes de l'équipe ne se restaurent pas (ils dépendent des connexions) : liens vers un compte disparu → vidés.
      const membres = new Set((await this.profils()).map((p) => p.id));
      const net = (x, champ) => (x[champ] && !membres.has(x[champ]) ? { ...x, [champ]: null } : x);
      const lots = { offres: b.offres || [], contacts: (b.contacts || []).map((x) => net(x, 'responsable')), activites: b.activites || [], paiements: b.paiements || [], taches: (b.taches || []).map((x) => net(x, 'assigne')) };
      for (const t of ['offres', 'contacts', 'activites', 'paiements', 'taches']) {
        if (!lots[t].length) continue;
        for (let i = 0; i < lots[t].length; i += 500) await this.q(this.sb.from(t).upsert(lots[t].slice(i, i + 500)));
      }
    },
    surChangement(rappel) {
      this.sb.channel('crm')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, (p) => rappel('nouveau-contact', p.new))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'taches' }, () => rappel('taches'))
        .subscribe();
    },
  };

  CRM.donnees = cfg.supabaseUrl && cfg.supabaseAnonKey ? enLigne : demo;
  CRM.normaliserTel = normaliserTel;
})();

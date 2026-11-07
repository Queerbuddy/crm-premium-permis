// CRM Premium Permis : reçoit tous les formulaires du site (rappel-accueil, rappel,
// inscription, devis, contact, info-appli, liste-attente, chatbot)
// (Netlify Forms > Notifications > HTTP POST request) et les range dans le CRM.
//
// Ce que fait une nouvelle demande (workflow n° 1) :
//   1. crée la fiche (ou la retrouve si le même téléphone a déjà écrit) ;
//   2. note la demande dans l'historique ;
//   3. crée la tâche adaptée au formulaire (voir FORMULAIRES) pour l'agence choisie ;
//   4. envoie un e-mail à l'agence (si RESEND_API_KEY est renseigné).
//
// Réglages (Supabase > Edge Functions > Secrets) :
//   NETLIFY_WEBHOOK_SECRET  le même mot secret que dans Netlify (« JWS secret token »)
//   RESEND_API_KEY          facultatif : clé Resend pour les e-mails
//   EMAIL_BOISSY, EMAIL_PARIS  adresses qui reçoivent les alertes (sinon EMAIL_DEFAUT)
//   EMAIL_DEFAUT, EMAIL_EXPEDITEUR, CRM_URL   facultatifs
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Netlify signe chaque envoi : jeton JWT (HS256) dans l'en-tête X-Webhook-Signature,
// qui contient iss = "netlify" et l'empreinte sha256 du contenu.
async function signatureValide(jeton: string | null, corps: string): Promise<boolean> {
  const secret = env("NETLIFY_WEBHOOK_SECRET");
  if (!secret) return false; // sans secret on refuse tout, par sécurité
  if (!jeton) return false;
  const [h, p, s] = jeton.split(".");
  if (!h || !p || !s) return false;
  const cle = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  if (b64url(await crypto.subtle.sign("HMAC", cle, enc.encode(`${h}.${p}`))) !== s) return false;
  try {
    const claims = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    return claims.iss === "netlify" && claims.sha256 === hex(await crypto.subtle.digest("SHA-256", enc.encode(corps)));
  } catch {
    return false;
  }
}

const normaliserTel = (t = "") => {
  let d = String(t).replace(/[^\d+]/g, "");
  if (d.startsWith("+33")) d = "0" + d.slice(3);
  if (d.startsWith("0033")) d = "0" + d.slice(4);
  return d.replace(/\D/g, "");
};
const agenceDe = (a = "") => (/paris/i.test(a) ? "Paris 5e" : "Boissy");
// Une règle par formulaire du site (form_name Netlify).
// ⚠️ Même tableau dans workflows.js (mode démo) : changer les deux.
type Regle = { source: string; heures: number; chaud?: boolean; sansAgence?: boolean; ajuster?: (d: Record<string, string>) => Partial<Regle>; titre: (p: string, d: Record<string, string>) => string };
const DELAI_SELON_DEBUT: Record<string, number> = { "Dès que possible": 2, "Dans le mois": 24, "Dans 2 ou 3 mois": 72, "Je me renseigne": 72 };
const FORMULAIRES: Record<string, Regle> = {
  "rappel-accueil": { source: "Site : rappel", heures: 24, titre: (p) => `Rappeler ${p} (demande de rappel, accueil)` },
  "rappel": { source: "Site : rappel", heures: 24, titre: (p) => `Rappeler ${p} (demande de rappel)` },
  "inscription": { source: "Site : inscription", heures: 2, chaud: true, titre: (p) => `Prospect chaud : rappeler ${p} pour finaliser l'inscription` },
  "devis": { source: "Site : devis", heures: 4, chaud: true, titre: (p, d) => `Envoyer le devis${d.formule ? " " + d.formule : ""} à ${p}` },
  "contact": { source: "Site : question", heures: 24, titre: (p) => `Répondre à la question de ${p}` },
  "info-appli": { source: "Site : info appli", heures: 24, titre: (p) => `Répondre à ${p} (question sur l'appli)` },
  "liste-attente": {
    source: "Appli : liste d'attente", heures: 48, sansAgence: true,
    titre: (p, d) => /premium/i.test(d.situation ?? "") ? `Élève inscrit : vérifier l'accès de ${p} à l'appli`
      : /autre/i.test(d.situation ?? "") ? `${p} est dans une autre auto-école : lui présenter nos formules`
      : `${p} veut l'appli : lui proposer une inscription`,
  },
  // L'assistant du site : lead déjà qualifié, priorité selon « debut ».
  "chatbot": {
    source: "Site : assistant", heures: 24, sansAgence: true,
    ajuster: (d) => ({ heures: DELAI_SELON_DEBUT[d.debut] ?? 24, chaud: d.debut === "Dès que possible" }),
    titre: (p, d) => `${d.debut === "Dès que possible" ? "Prospect chaud : r" : "R"}appeler ${p} (assistant${d.permis ? ", " + d.permis : ""}${d.code ? ", code : " + d.code : ""}${d.debut ? ", " + d.debut.toLowerCase() : ""})`,
  },
  // Page offre-black-friday.html. Le code promo relie la demande à l'offre (table « offres »).
  "black-friday": {
    source: "Site : offre", heures: 24, chaud: true,
    titre: (p, d) => `Rappeler ${p} (offre ${(d.code_promo || "Black Friday").toUpperCase()}) pour fixer son passage en agence`,
  },
};
const jourFr = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const ajouterJours = (iso: string, n: number) => { const x = new Date(iso + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const agenceInconnue = (d: Record<string, string>) => !d.agence || /sais pas/i.test(d.agence);
// L'assistant envoie « permis » (ex. « Permis B manuelle », « Moto (A1 / A2) ») au lieu de « formule ».
const formuleDe = (d: Record<string, string>) =>
  d.formule || (d.permis ? d.permis.replace(/^Permis /, "").replace(/^Moto.*/, "Moto").replace(/^Autre.*/, "Je ne sais pas") : "");

// Champs d'origine (publicité) envoyés par tous les formulaires du site.
const CHAMPS_ORIGINE = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "page_arrivee", "site_precedent"];

function origineLisible(d: Record<string, string>) {
  const morceaux = [
    d.utm_source && `source ${d.utm_source}`, d.utm_medium && `support ${d.utm_medium}`,
    d.utm_campaign && `campagne ${d.utm_campaign}`, d.utm_content && `annonce ${d.utm_content}`, d.utm_term && `mot-clé ${d.utm_term}`,
    d.site_precedent && `venu de ${d.site_precedent}`, d.page_arrivee && `arrivé sur ${d.page_arrivee}`,
  ].filter(Boolean);
  return morceaux.length ? `Origine : ${morceaux.join(" · ")}` : "";
}

const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function envoyerEmail(agence: string, sujet: string, html: string) {
  const cle = env("RESEND_API_KEY");
  const a = (agence === "Paris 5e" ? env("EMAIL_PARIS") : agence === "Boissy" ? env("EMAIL_BOISSY") : "") || env("EMAIL_DEFAUT");
  if (!cle || !a) return "pas d'e-mail (réglage manquant)";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("EMAIL_EXPEDITEUR") || "CRM Premium Permis <onboarding@resend.dev>",
      to: a.split(",").map((x) => x.trim()),
      subject: sujet,
      html,
    }),
  });
  return r.ok ? `e-mail envoyé à ${a}` : `e-mail refusé (${r.status}) : ${await r.text()}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("CRM Premium Permis : en attente des formulaires.", { status: 200 });
  const corps = await req.text();
  if (!(await signatureValide(req.headers.get("x-webhook-signature"), corps))) {
    return new Response("signature invalide", { status: 401 });
  }

  let envoi: Record<string, any>;
  try {
    envoi = JSON.parse(corps);
  } catch {
    return new Response("contenu illisible", { status: 400 });
  }
  const d: Record<string, string> = { ...(envoi.data ?? {}) };
  const formulaire: string = envoi.form_name ?? d["form-name"] ?? "rappel";
  const base: Regle = FORMULAIRES[formulaire] ??
    { source: "Site : autre", heures: 24, titre: (p: string) => `Traiter la demande de ${p} (formulaire « ${formulaire} »)` };
  const regle: Regle = base.ajuster ? { ...base, ...base.ajuster(d) } : base;
  d.formule = formuleDe(d);
  const agence = agenceDe(d.agence);
  const tel = normaliserTel(d.telephone);
  // « rappel », « rappel-accueil », « liste-attente » envoient prenom ; la page contact envoie nom = « Prénom Nom ».
  const morceaux = (d.nom ?? "").trim().split(/\s+/);
  const prenom = (d.prenom ?? "").trim() || morceaux[0] || "";
  const nom = d.prenom ? "" : morceaux.slice(1).join(" ");
  const source = regle.source;
  const resume = [
    `Demande « ${formulaire} » depuis la page ${d.page ?? "?"}`,
    regle.chaud && "Prospect chaud",
    d.formule && `Formule : ${d.formule}`,
    d.centre && `Centre d'examen : ${d.centre}`,
    d.situation && `Situation : ${d.situation}`,
    d.code && `Code : ${d.code}`,
    d.debut && `Début souhaité : ${d.debut}`,
    d.code_promo && `Code promo : ${d.code_promo}`,
    d.contexte && `Contexte : ${d.contexte}`,
    regle.sansAgence && agenceInconnue(d) && "Agence non précisée par le formulaire : rangé à Boissy, à corriger si besoin",
    d.message && `Message : ${d.message}`,
    origineLisible(d),
  ].filter(Boolean).join("\n");
  const origine: Record<string, string | null> = {};
  for (const k of CHAMPS_ORIGINE) origine[k] = (d[k] ?? "").trim().slice(0, 300) || null;

  // Même téléphone déjà connu et dossier encore ouvert ? On complète la fiche existante.
  let contact: any = null;
  if (tel) {
    const { data } = await db.from("contacts").select("*").eq("telephone", tel)
      .not("etape", "in", '("Perdu","Permis obtenu")').order("cree_le", { ascending: false }).limit(1);
    contact = data?.[0] ?? null;
  }
  if (!contact) {
    const { data, error } = await db.from("contacts").insert({
      prenom, nom, telephone: tel || null, email: d.email || null, formule: d.formule || null,
      agence, source, page: d.page || null, message: d.message || null, ...origine,
    }).select().single();
    if (error) return new Response("erreur base : " + error.message, { status: 500 });
    contact = data;
  } else {
    // Fiche existante : on complète seulement l'origine manquante (la première pub reste celle qui compte).
    const complement: Record<string, string | null> = {};
    if (!contact.utm_source && !contact.site_precedent) Object.assign(complement, origine);
    await db.from("contacts").update({ maj_le: new Date().toISOString(), email: contact.email || d.email || null, ...complement })
      .eq("id", contact.id);
  }

  await db.from("activites").insert({ contact_id: contact.id, type: "demande", texte: resume, auteur: "Site internet" });

  // Offre / code promo : on retrouve l'offre par son code, sinon par le formulaire (si le visiteur a modifié le code).
  const code = (d.code_promo ?? "").trim().toUpperCase();
  if (code || formulaire === "black-friday") {
    const { data: offres } = await db.from("offres").select("*").eq("actif", true);
    const offre = (offres ?? []).find((o: any) => o.code === code) ?? (offres ?? []).find((o: any) => o.formulaire === formulaire);
    if (offre && !contact.offre_id) {
      const auj = new Date().toISOString().slice(0, 10);
      const limite = offre.limite_fixe ?? ajouterJours(auj, offre.delai_jours); // date fixe si l'offre en a une
      await db.from("contacts").update({ offre_id: offre.id, code_promo: code || null, offre_limite: limite }).eq("id", contact.id);
      contact.offre_id = offre.id;
      const horsPeriode = auj < offre.debut || auj > offre.fin;
      await db.from("activites").insert({
        contact_id: contact.id, type: "note", auteur: "CRM",
        texte: `Offre « ${offre.nom} » (${offre.avantage ?? ""})${code && code !== offre.code ? ` · code tapé : ${code} (différent de ${offre.code})` : ""}` +
          ` · doit passer en agence avant le ${jourFr(limite)}${horsPeriode ? " · ⚠️ demande hors période de l'offre" : ""}`,
      });
      // Workflow : rappel 3 jours avant la date limite si la personne n'est pas encore passée en agence.
      const rappel = new Date(ajouterJours(limite, -3) + "T10:00:00+01:00");
      await db.from("taches").insert({
        contact_id: contact.id, agence: contact.agence, auto: true,
        titre: `Offre ${offre.nom} : ${prenom || "le prospect"} doit passer en agence avant le ${jourFr(limite)}`,
        echeance: (rappel.getTime() > Date.now() ? rappel : new Date(Date.now() + 3600e3)).toISOString(),
      });
    }
  }
  await db.from("taches").insert({
    contact_id: contact.id, agence: contact.agence, auto: true,
    titre: regle.titre(prenom || "le prospect", d),
    echeance: new Date(Date.now() + regle.heures * 3600 * 1000).toISOString(),
  });

  const lien = env("CRM_URL") ? `${env("CRM_URL")}#contact/${contact.id}` : "";
  const resultatEmail = await envoyerEmail(
    regle.sansAgence && agenceInconnue(d) ? "" : contact.agence,
    `${regle.chaud ? "Prospect chaud · " : ""}${source} (${contact.agence}) : ${prenom} ${tel ? "· " + tel : ""}`,
    `<p><b>${esc(prenom)} ${esc(nom)}</b> a rempli le formulaire « ${esc(formulaire)} ».</p>
     <p>Téléphone : <a href="tel:${esc(tel)}">${esc(tel || "non donné")}</a><br>
     ${d.email ? `E-mail : ${esc(d.email)}<br>` : ""}${d.formule ? `Formule : ${esc(d.formule)}<br>` : ""}${d.centre ? `Centre : ${esc(d.centre)}<br>` : ""}${d.situation ? `Situation : ${esc(d.situation)}<br>` : ""}Agence : ${esc(contact.agence)}</p>
     ${d.message ? `<p>« ${esc(d.message)} »</p>` : ""}
     ${origineLisible(d) ? `<p>${esc(origineLisible(d))}</p>` : ""}
     <p>Tâche créée : « ${esc(regle.titre(prenom || "le prospect", d))} », pour dans ${regle.heures} h.${lien ? ` <a href="${lien}">Ouvrir la fiche</a>` : ""}</p>`,
  );
  await db.from("activites").insert({ contact_id: contact.id, type: "email", texte: resultatEmail, auteur: "CRM" });

  return new Response(JSON.stringify({ ok: true, contact: contact.id }), {
    headers: { "Content-Type": "application/json" },
  });
});

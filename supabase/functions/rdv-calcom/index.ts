// CRM Premium Permis : reçoit les rendez-vous pris sur Cal.com (un lien par agence)
// (Cal.com > Settings > Developer > Webhooks) et met la fiche à jour toute seule.
//
// Workflow 8 : rendez-vous en ligne
//   - RDV réservé  → fiche retrouvée (même téléphone ou e-mail) ou créée, étape « RDV pris »,
//                    date du RDV, rappels « Rappeler… » devenus inutiles fermés,
//                    tâche « Confirmer le RDV (la veille) », e-mail à l'agence ;
//   - RDV déplacé  → nouvelle date, tâche de confirmation déplacée ;
//   - RDV annulé   → date effacée, retour en « Rappelé », tâche « le rappeler pour un autre RDV ».
//   ⚠️ Même logique pour le mode démo dans workflows.js (CRM.calcom) : changer les deux.
//
// Réglages (Supabase > Edge Functions > Secrets) :
//   CALCOM_WEBHOOK_SECRET   le même mot secret que dans Cal.com (« Secret » du webhook)
//   RESEND_API_KEY, EMAIL_BOISSY, EMAIL_PARIS, EMAIL_DEFAUT, EMAIL_EXPEDITEUR, CRM_URL  (comme demande-site)
//
// Ce que la fonction lit dans l'envoi de Cal.com (rendez-vous unique « rendez-vous ») :
//   responses : name, email, attendeePhoneNumber (ou telephone), formule (« Permis B manuelle »…),
//               lieu (« Paris 5 » / « Boissy-Saint-Léger 94 » → agence), motif (« M'inscrire » = prospect chaud), notes ;
//               les listes à choix multiples (tableaux) sont acceptées aussi ;
//   metadata  : envoyé par le site : page, utm_*, gclid, fbclid, page_arrivee, site_precedent, page_precedente, formule_site.
//   L'origine est aussi cherchée dans les réponses et dans « tracking », au cas où Cal.com la range ailleurs.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Cal.com signe chaque envoi : empreinte HMAC-SHA256 (hexadécimal) du contenu, en-tête X-Cal-Signature-256.
async function signatureValide(signature: string | null, corps: string): Promise<boolean> {
  const secret = env("CALCOM_WEBHOOK_SECRET");
  if (!secret || !signature) return false; // sans secret on refuse tout, par sécurité
  const cle = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const attendu = hex(await crypto.subtle.sign("HMAC", cle, enc.encode(corps)));
  const recu = signature.trim().toLowerCase().replace(/^sha256=/, "");
  if (attendu.length !== recu.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ recu.charCodeAt(i);
  return diff === 0;
}

const normaliserTel = (t = "") => {
  let d = String(t).replace(/[^\d+]/g, "");
  if (d.startsWith("+33")) d = "0" + d.slice(3);
  if (d.startsWith("0033")) d = "0" + d.slice(4);
  return d.replace(/\D/g, "");
};
const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const jourFr = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

const RDV = "RDV pris";
const ETAPES = ["Nouveau", "Rappelé", RDV, "Venu au RDV", "Inscrit (Klaxo)", "Code", "Conduite", "Permis obtenu", "Perdu"];
const rang = (e: string) => ETAPES.indexOf(e);
const FORMULES = ["B manuelle", "B automatique", "Conduite accompagnée", "Moto", "Je ne sais pas"];
const CHAMPS_ORIGINE = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "page_arrivee", "site_precedent"];
// Rappels devenus inutiles quand le RDV est fixé (« Envoyer le devis » ou l'offre restent à faire).
const AVANT_RDV = /^(Rappeler|Relancer|Prospect chaud|Répondre)|sans réponse|n'est pas venu|RDV annulé/;
const CONFIRMER = /^Confirmer le RDV/;

// Les réponses Cal.com arrivent sous la forme { label, value } (ou directement la valeur).
const valeur = (x: any): string => {
  const v = x && typeof x === "object" && "value" in x ? x.value : x;
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => valeur(x)).filter(Boolean).join(", "); // MultiSelect : tableau
  if (typeof v === "object") return [v.firstName, v.lastName].filter(Boolean).join(" ") || String(v.value ?? "");
  return String(v).trim();
};

type Rdv = {
  evenement: string; uid: string; ancienUid: string; debut: string; prenom: string; nom: string;
  tel: string; email: string; agence: string; formule: string; notes: string; motif: string;
  but: string; page: string; formuleSite: string; pagePrecedente: string; lieu: string;
  origine: Record<string, string | null>;
};

function lireReservation(envoi: any): Rdv {
  const p = envoi.payload ?? {};
  const r: Record<string, any> = { ...(p.userFieldsResponses ?? {}), ...(p.responses ?? {}) };
  const invite = (p.attendees ?? [])[0] ?? {};
  const champ = (...noms: string[]) => noms.map((n) => valeur(r[n])).find(Boolean) ?? "";
  const nomV = r.name && typeof r.name === "object" && "value" in r.name ? r.name.value : r.name;
  const brut = (nomV && typeof nomV === "object" ? nomV : null) as any; // champ « nom » coupé en prénom + nom
  const complet = (valeur(r.name) || invite.name || "").trim();
  const prenom = (brut?.firstName ?? complet.split(/\s+/)[0] ?? "").trim();
  const nom = (brut?.lastName ?? complet.split(/\s+/).slice(1).join(" ")).trim();
  const meta: Record<string, any> = p.metadata ?? {};
  // Agence : question « lieu » (« Paris 5 » / « Boissy-Saint-Léger 94 »), sinon la page du site
  // où le RDV a été pris, sinon le nom du type de rendez-vous ; Boissy par défaut.
  const lieu = champ("lieu", "agence");
  const quoi = lieu || (meta.page ? String(meta.page) : "") ||
    [p.type, p.eventTitle, p.title, p.eventType?.slug].join(" ");
  const agence = /paris/i.test(quoi) ? "Paris 5e" : "Boissy";
  const f = champ("formule", "Formule");
  const origine: Record<string, string | null> = {};
  for (const k of CHAMPS_ORIGINE) {
    origine[k] = (champ(k) || valeur(p.tracking?.[k]) || valeur(p.metadata?.[k])).slice(0, 300) || null;
  }
  return {
    evenement: envoi.triggerEvent ?? "",
    uid: p.uid ?? p.bookingUid ?? "",
    ancienUid: p.rescheduleUid ?? p.fromReschedule ?? "",
    debut: p.startTime ?? "",
    prenom, nom,
    tel: normaliserTel(champ("telephone", "attendeePhoneNumber", "phone", "location_phone") || invite.phoneNumber || ""),
    email: (champ("email") || invite.email || "").toLowerCase(),
    agence,
    formule: formuleDe(f),
    notes: champ("notes", "message", "additionalNotes") || p.additionalNotes || "",
    motif: p.cancellationReason || champ("rescheduleReason") || "",
    but: champ("motif"), // « M'inscrire » / « Me renseigner »
    page: valeur(meta.page), formuleSite: valeur(meta.formule_site), pagePrecedente: valeur(meta.page_precedente),
    lieu, origine,
  };
}

// « Permis B manuelle », « Moto (A1 / A2) »… → formules du CRM.
function formuleDe(f: string) {
  if (!f) return "";
  const t = f.split(",")[0].replace(/^Permis\s+/i, "").trim();
  return FORMULES.find((x) => x.toLowerCase() === t.toLowerCase()) ??
    (/moto|scooter|a1|a2|125/i.test(t) ? "Moto" : /accompagn/i.test(t) ? "Conduite accompagnée" : /auto/i.test(t) ? "B automatique" : /manuel/i.test(t) ? "B manuelle" : "Je ne sais pas");
}

function origineLisible(o: Record<string, string | null>) {
  const m = [
    o.utm_source && `source ${o.utm_source}`, o.utm_medium && `support ${o.utm_medium}`,
    o.utm_campaign && `campagne ${o.utm_campaign}`, o.utm_content && `annonce ${o.utm_content}`, o.utm_term && `mot-clé ${o.utm_term}`,
    o.site_precedent && `venu de ${o.site_precedent}`, o.page_arrivee && `arrivé sur ${o.page_arrivee}`,
  ].filter(Boolean);
  return m.length ? `Origine : ${m.join(" · ")}` : "";
}

async function envoyerEmail(agence: string, sujet: string, html: string) {
  const cle = env("RESEND_API_KEY");
  const a = (agence === "Paris 5e" ? env("EMAIL_PARIS") : env("EMAIL_BOISSY")) || env("EMAIL_DEFAUT");
  if (!cle || !a) return "pas d'e-mail (réglage manquant)";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("EMAIL_EXPEDITEUR") || "CRM Premium Permis <onboarding@resend.dev>",
      to: a.split(",").map((x) => x.trim()), subject: sujet, html,
    }),
  });
  return r.ok ? `e-mail envoyé à ${a}` : `e-mail refusé (${r.status}) : ${await r.text()}`;
}

const note = (contact_id: string, type: string, texte: string) =>
  db.from("activites").insert({ contact_id, type, texte, auteur: "Cal.com" });
async function fermerTaches(contactId: string, test: RegExp) {
  const { data } = await db.from("taches").select("id,titre").eq("contact_id", contactId).eq("faite", false);
  const ids = (data ?? []).filter((t: any) => test.test(t.titre)).map((t: any) => t.id);
  if (ids.length) await db.from("taches").update({ faite: true, faite_le: new Date().toISOString() }).in("id", ids);
}
async function tacheConfirmer(c: any, debut: string) {
  const veille = Math.max(Date.now(), new Date(debut).getTime() - 24 * 3600e3);
  await db.from("taches").insert({
    contact_id: c.id, agence: c.agence, auto: true,
    titre: `Confirmer le RDV de ${c.prenom || "le prospect"} (la veille)`, echeance: new Date(veille).toISOString(),
  });
}

// Retrouve la fiche : d'abord par le n° de réservation Cal.com, puis par téléphone, puis par e-mail.
async function trouverContact(r: Rdv) {
  for (const uid of [r.uid, r.ancienUid].filter(Boolean)) {
    const { data } = await db.from("contacts").select("*").eq("calcom_uid", uid).limit(1);
    if (data?.[0]) return data[0];
  }
  const ouvert = (q: any) => q.not("etape", "in", '("Perdu","Permis obtenu")').order("cree_le", { ascending: false }).limit(1);
  if (r.tel) { const { data } = await ouvert(db.from("contacts").select("*").eq("telephone", r.tel)); if (data?.[0]) return data[0]; }
  if (r.email) { const { data } = await ouvert(db.from("contacts").select("*").ilike("email", r.email)); if (data?.[0]) return data[0]; }
  return null;
}

async function rdvPris(r: Rdv, deplace: boolean) {
  const chaud = /inscri/i.test(r.but);
  let c: any = await trouverContact(r);
  const nouveau = !c;
  if (!c) {
    const { data, error } = await db.from("contacts").insert({
      prenom: r.prenom, nom: r.nom, telephone: r.tel || null, email: r.email || null, formule: r.formule || null,
      agence: r.agence, source: "Site : rendez-vous", page: r.page ? `Cal.com (page ${r.page})` : "Cal.com", message: r.notes || null, ...r.origine,
    }).select().single();
    if (error) throw new Error(error.message);
    c = data;
  }
  const ancienRdv = c.rdv_le;
  const champs: Record<string, any> = { rdv_le: r.debut, calcom_uid: r.uid, maj_le: new Date().toISOString() };
  if (!c.nom && r.nom && !nouveau) champs.nom = r.nom;
  if (!c.telephone && r.tel) champs.telephone = r.tel;
  if (!c.email && r.email) champs.email = r.email;
  if (!c.formule && r.formule) champs.formule = r.formule;
  if (!nouveau && !c.utm_source && !c.site_precedent) Object.assign(champs, r.origine);
  if (!c.rdv_pris_le) champs.rdv_pris_le = new Date().toISOString();
  const avance = rang(c.etape) < rang(RDV);
  if (avance) Object.assign(champs, { etape: RDV, etape_le: new Date().toISOString() });
  await db.from("contacts").update(champs).eq("id", c.id);

  const autreAgence = !nouveau && c.agence !== r.agence ? `⚠️ RDV pris à ${r.agence}, alors que la fiche est rangée à ${c.agence}` : "";
  if (deplace && ancienRdv) {
    await note(c.id, "etape", `RDV déplacé en ligne : ${quand(ancienRdv)} → ${quand(r.debut)}${r.motif ? ` (${r.motif})` : ""}`);
  } else {
    await note(c.id, "demande", [
      `RDV pris en ligne (Cal.com) pour ${quand(r.debut)}, agence ${r.agence}`,
      chaud && "Prospect chaud (veut s'inscrire)", r.but && !chaud && `Motif : ${r.but}`,
      r.formule && `Formule : ${r.formule}`, r.formuleSite && `Bouton de tarif cliqué sur le site : ${r.formuleSite}`,
      r.page && `Réservé depuis la page ${r.page}${r.pagePrecedente ? ` (page précédente : ${r.pagePrecedente})` : ""}`, r.notes && `Message : ${r.notes}`, autreAgence, origineLisible(r.origine),
    ].filter(Boolean).join("\n"));
  }
  if (avance) await note(c.id, "etape", `Étape : ${c.etape} → ${RDV} (réservé en ligne)`);
  else if (!deplace && rang(c.etape) > rang(RDV) && c.etape !== "Perdu") await note(c.id, "note", `RDV pris alors que la fiche est déjà à l'étape « ${c.etape} »`);
  if (c.offre_limite && r.debut.slice(0, 10) > c.offre_limite) {
    await note(c.id, "note", `⚠️ Ce RDV est après la date limite de l'offre (${jourFr(c.offre_limite)})`);
  }

  await fermerTaches(c.id, deplace ? CONFIRMER : new RegExp(`${AVANT_RDV.source}|${CONFIRMER.source}`));
  await tacheConfirmer({ ...c, ...champs }, r.debut);

  const lien = env("CRM_URL") ? `${env("CRM_URL")}#contact/${c.id}` : "";
  const nomAff = `${esc(r.prenom || c.prenom)} ${esc(r.nom || c.nom || "")}`;
  const resultat = await envoyerEmail(
    r.agence,
    `${chaud && !deplace ? "Prospect chaud · " : ""}${deplace ? "RDV déplacé" : "Nouveau RDV"} (${r.agence}) : ${r.prenom || c.prenom} · ${quand(r.debut)}`,
    `<p><b>${nomAff}</b> ${deplace ? "a déplacé son" : "a pris"} rendez-vous en ligne : <b>${esc(quand(r.debut))}</b>, agence ${esc(r.agence)}.</p>
     <p>Téléphone : <a href="tel:${esc(r.tel || c.telephone || "")}">${esc(r.tel || c.telephone || "non donné")}</a><br>
     ${r.email ? `E-mail : ${esc(r.email)}<br>` : ""}${r.formule ? `Formule : ${esc(r.formule)}<br>` : ""}${r.formuleSite ? `Bouton de tarif : ${esc(r.formuleSite)}<br>` : ""}${r.but ? `Motif : ${esc(r.but)}<br>` : ""}${r.page ? `Réservé depuis la page : ${esc(r.page)}<br>` : ""}${nouveau ? "Nouvelle fiche" : "Fiche déjà connue"}</p>
     ${r.notes ? `<p>« ${esc(r.notes)} »</p>` : ""}${autreAgence ? `<p>${esc(autreAgence)}</p>` : ""}
     ${origineLisible(r.origine) ? `<p>${esc(origineLisible(r.origine))}</p>` : ""}
     ${lien ? `<p><a href="${lien}">Ouvrir la fiche</a></p>` : ""}`,
  );
  await note(c.id, "email", resultat);
  return c.id;
}

async function rdvAnnule(r: Rdv) {
  const c: any = await trouverContact(r);
  if (!c) return null; // RDV inconnu du CRM : rien à faire
  const champs: Record<string, any> = { rdv_le: null, calcom_uid: null, maj_le: new Date().toISOString() };
  const recule = c.etape === RDV;
  if (recule) Object.assign(champs, { etape: "Rappelé", etape_le: new Date().toISOString() });
  await db.from("contacts").update(champs).eq("id", c.id);
  await note(c.id, "etape", `RDV annulé en ligne${c.rdv_le ? ` (il était prévu ${quand(c.rdv_le)})` : ""}${r.motif ? ` · motif : ${r.motif}` : ""}`);
  if (recule) await note(c.id, "etape", `Étape : ${RDV} → Rappelé (RDV annulé)`);
  await fermerTaches(c.id, CONFIRMER);
  await db.from("taches").insert({
    contact_id: c.id, agence: c.agence, auto: true,
    titre: `RDV annulé : rappeler ${c.prenom || "le prospect"} pour en fixer un autre`,
    echeance: new Date(Date.now() + 2 * 3600e3).toISOString(),
  });
  const resultat = await envoyerEmail(c.agence, `RDV annulé (${c.agence}) : ${c.prenom}`,
    `<p><b>${esc(c.prenom)} ${esc(c.nom || "")}</b> a annulé son rendez-vous${c.rdv_le ? ` du ${esc(quand(c.rdv_le))}` : ""}.</p>
     ${r.motif ? `<p>Motif : « ${esc(r.motif)} »</p>` : ""}<p>Tâche créée : le rappeler sous 2 h.</p>`);
  await note(c.id, "email", resultat);
  return c.id;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("CRM Premium Permis : en attente des rendez-vous Cal.com.", { status: 200 });
  const corps = await req.text();
  if (!(await signatureValide(req.headers.get("x-cal-signature-256"), corps))) {
    return new Response("signature invalide", { status: 401 });
  }
  let envoi: any;
  try { envoi = JSON.parse(corps); } catch { return new Response("contenu illisible", { status: 400 }); }

  // Trace dans Supabase > Edge Functions > rdv-calcom > Logs, pour voir où Cal.com range chaque information.
  console.log("Cal.com", envoi.triggerEvent, JSON.stringify({ responses: envoi.payload?.responses, metadata: envoi.payload?.metadata, tracking: envoi.payload?.tracking, attendees: envoi.payload?.attendees }).slice(0, 4000));
  const r = lireReservation(envoi);
  try {
    let id: string | null = null;
    switch (r.evenement) {
      case "BOOKING_CREATED": case "BOOKING_REQUESTED": id = await rdvPris(r, false); break;
      case "BOOKING_RESCHEDULED": id = await rdvPris(r, true); break;
      case "BOOKING_CANCELLED": case "BOOKING_REJECTED": id = await rdvAnnule(r); break;
      default: return new Response(JSON.stringify({ ok: true, ignore: r.evenement || "test" }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, contact: id }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response("erreur base : " + (e as Error).message, { status: 500 });
  }
});

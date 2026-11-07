-- CRM Premium Permis : rendez-vous pris en ligne sur Cal.com (fonction « rdv-calcom »).
-- Supabase > SQL Editor > New query > coller tout > Run. Peut être relancé sans danger.
-- À lancer après schema.sql, paiements.sql, etapes-klaxo.sql et offres.sql.

-- N° de la réservation Cal.com : sert à retrouver la fiche quand le RDV est déplacé ou annulé.
alter table public.contacts add column if not exists calcom_uid text;
create index if not exists contacts_calcom_idx on public.contacts (calcom_uid);
create index if not exists contacts_email_idx on public.contacts (lower(email));

-- Mise à jour groupée du 7 nov. 2026 : paiements + parcours Klaxo + offres + Cal.com. Peut être relancé sans danger.

-- ===== paiements.sql =====
-- CRM Premium Permis : suivi des paiements (à lancer UNE fois, après schema.sql).
-- Supabase > SQL Editor > New query > coller tout > Run. Peut être relancé sans danger.

alter table public.contacts add column if not exists prix_total numeric(10,2);

create table if not exists public.paiements (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts on delete cascade,
  montant numeric(10,2) not null check (montant > 0),
  moyen text not null default 'Carte bancaire'
    check (moyen in ('Carte bancaire','Espèces','Chèque','Virement','CPF','Financement / aide','Autre')),
  statut text not null default 'paye' check (statut in ('prevu','paye')),
  date_prevue date,
  paye_le timestamptz,
  note text,
  auteur text,
  cree_le timestamptz not null default now()
);
create index if not exists paiements_contact_idx on public.paiements (contact_id);
create index if not exists paiements_statut_idx on public.paiements (statut, date_prevue);

-- Lien entre une échéance et sa tâche de rappel (la tâche se ferme quand l'échéance est encaissée).
alter table public.taches add column if not exists paiement_id uuid references public.paiements on delete cascade;

-- L'argent : directeur (tout) et secrétariat (son agence). Les moniteurs ne voient rien.
create or replace function public.peut_voir_argent(a text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils p where p.id = auth.uid()
    and (p.role = 'directeur' or (p.role = 'secretaire' and p.agence = a)))
$$;

alter table public.paiements enable row level security;
drop policy if exists paiements_lire on public.paiements;
create policy paiements_lire on public.paiements for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.peut_voir_argent(c.agence)));
drop policy if exists paiements_ecrire on public.paiements;
create policy paiements_ecrire on public.paiements for insert to authenticated
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.peut_voir_argent(c.agence)));
drop policy if exists paiements_modifier on public.paiements;
create policy paiements_modifier on public.paiements for update to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.peut_voir_argent(c.agence)));
drop policy if exists paiements_supprimer on public.paiements;
create policy paiements_supprimer on public.paiements for delete to authenticated using (public.est_directeur());

-- ===== etapes-klaxo.sql =====
-- CRM Premium Permis : nouveau parcours demandé par Adama
--   Nouveau → Rappelé → RDV pris → Venu au RDV → Inscrit (Klaxo) → Code → Conduite → Permis obtenu / Perdu
-- À lancer UNE fois dans Supabase > SQL Editor > New query > Run (si schema.sql a déjà été lancé).
-- Peut être relancé sans danger. Les fiches existantes sont converties (RDV → RDV pris, Inscrit → Inscrit (Klaxo)).

alter table public.contacts add column if not exists rdv_pris_le timestamptz;   -- date où le RDV a été pris
alter table public.contacts add column if not exists venu_le timestamptz;       -- date où il est venu au RDV
alter table public.contacts add column if not exists inscrit_le timestamptz;    -- date d'inscription dans Klaxo
alter table public.contacts add column if not exists klaxo_id text;             -- n° d'élève dans Klaxo
alter table public.contacts add column if not exists nb_absences int not null default 0; -- RDV manqués

alter table public.contacts drop constraint if exists contacts_etape_check;
update public.contacts set etape = 'RDV pris' where etape = 'RDV';
update public.contacts set etape = 'Inscrit (Klaxo)' where etape = 'Inscrit';
alter table public.contacts add constraint contacts_etape_check check (etape in
  ('Nouveau','Rappelé','RDV pris','Venu au RDV','Inscrit (Klaxo)','Code','Conduite','Permis obtenu','Perdu'));

-- Dates d'étape pour les fiches déjà avancées (pour les statistiques du parcours)
update public.contacts set rdv_pris_le = coalesce(rdv_pris_le, etape_le)
  where rdv_pris_le is null and etape in ('RDV pris','Venu au RDV','Inscrit (Klaxo)','Code','Conduite','Permis obtenu');
update public.contacts set venu_le = coalesce(venu_le, etape_le)
  where venu_le is null and etape in ('Venu au RDV','Inscrit (Klaxo)','Code','Conduite','Permis obtenu');
update public.contacts set inscrit_le = coalesce(inscrit_le, etape_le)
  where inscrit_le is null and etape in ('Inscrit (Klaxo)','Code','Conduite','Permis obtenu');

-- Les moniteurs voient les élèves à partir de l'inscription
create or replace function public.peut_voir(a text, e text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profils p
    where p.id = auth.uid()
      and (p.role = 'directeur'
           or (p.agence = a and (p.role = 'secretaire'
               or (p.role = 'moniteur' and (e is null or e in ('Inscrit (Klaxo)','Code','Conduite','Permis obtenu'))))))
  )
$$;

-- ===== offres.sql =====
-- CRM Premium Permis : offres et codes promo (Black Friday, puis les suivantes).
-- Supabase > SQL Editor > New query > coller tout > Run. Peut être relancé sans danger.

create table if not exists public.offres (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  code text not null unique,                 -- code promo, en MAJUSCULES
  formulaire text,                           -- formulaire du site lié (ex. black-friday), au cas où le code est modifié
  avantage text,                             -- ce que la personne obtient (affiché sur la fiche)
  debut date not null,
  fin date not null,
  delai_jours int not null default 14,       -- délai pour passer en agence après la demande…
  limite_fixe date,                          -- …sauf si une date limite fixe est donnée (prioritaire)
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

alter table public.offres add column if not exists limite_fixe date;

alter table public.contacts add column if not exists offre_id uuid references public.offres on delete set null;
alter table public.contacts add column if not exists code_promo text;
alter table public.contacts add column if not exists offre_limite date;   -- date limite pour passer en agence
create index if not exists contacts_offre_idx on public.contacts (offre_id);

alter table public.offres enable row level security;
drop policy if exists offres_lire on public.offres;
create policy offres_lire on public.offres for select to authenticated using (public.est_membre());
drop policy if exists offres_ecrire on public.offres;
create policy offres_ecrire on public.offres for all to authenticated
  using (public.est_directeur()) with check (public.est_directeur());

-- Première offre, règles données par Adama.
-- Date limite de passage en agence : le 1er décembre pour tout le monde (décision du 7 nov. 2026).
insert into public.offres (nom, code, formulaire, avantage, debut, fin, delai_jours, limite_fixe)
values ('Black Friday 2026', 'BLACKPERMIS26', 'black-friday',
        '100 € offerts sur le permis + paiement en 3 fois sans frais', '2026-11-09', '2026-12-01', 14, '2026-12-01')
on conflict (code) do update set limite_fixe = excluded.limite_fixe;
-- Fiches déjà reliées à une offre à date fixe : on aligne leur date limite.
update public.contacts c set offre_limite = o.limite_fixe
  from public.offres o where c.offre_id = o.id and o.limite_fixe is not null;

-- ===== calcom.sql =====
-- CRM Premium Permis : rendez-vous pris en ligne sur Cal.com (fonction « rdv-calcom »).
-- Supabase > SQL Editor > New query > coller tout > Run. Peut être relancé sans danger.
-- À lancer après schema.sql, paiements.sql, etapes-klaxo.sql et offres.sql.

-- N° de la réservation Cal.com : sert à retrouver la fiche quand le RDV est déplacé ou annulé.
alter table public.contacts add column if not exists calcom_uid text;
create index if not exists contacts_calcom_idx on public.contacts (calcom_uid);
create index if not exists contacts_email_idx on public.contacts (lower(email));

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

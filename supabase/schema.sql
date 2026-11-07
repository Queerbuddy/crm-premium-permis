-- CRM Premium Permis : base de données Supabase
-- À coller en une fois dans Supabase > SQL Editor > New query, puis « Run ».
-- On peut le relancer sans danger : il ne supprime aucune donnée.

create extension if not exists pgcrypto;

-- 1. Membres de l'équipe (un par compte de connexion)
create table if not exists public.profils (
  id uuid primary key references auth.users on delete cascade,
  nom text not null default '',
  email text,
  role text not null default 'secretaire' check (role in ('directeur','secretaire','moniteur')),
  agence text check (agence in ('Boissy','Paris 5e')),   -- vide = aucune agence (sauf directeur : tout)
  cree_le timestamptz not null default now()
);

-- Chaque compte créé dans Authentication reçoit automatiquement une fiche « profil ».
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, email, nom)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists apres_creation_compte on auth.users;
create trigger apres_creation_compte after insert on auth.users
  for each row execute function public.creer_profil();

-- 2. Prospects et élèves
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  prenom text not null default '',
  nom text not null default '',
  telephone text,
  email text,
  formule text,
  agence text not null default 'Boissy' check (agence in ('Boissy','Paris 5e')),
  source text not null default 'Site : rappel',
  page text,
  message text,
  etape text not null default 'Nouveau'
    check (etape in ('Nouveau','Rappelé','RDV pris','Venu au RDV','Inscrit (Klaxo)','Code','Conduite','Permis obtenu','Perdu')),
  rdv_le timestamptz,
  rdv_pris_le timestamptz,
  venu_le timestamptz,
  inscrit_le timestamptz,
  klaxo_id text,
  nb_absences int not null default 0,
  raison_perte text,
  responsable uuid references public.profils(id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  etape_le timestamptz not null default now()
);
create index if not exists contacts_agence_idx on public.contacts (agence, etape);
create index if not exists contacts_tel_idx on public.contacts (telephone);

-- 3. Historique (demandes, appels, notes, changements d'étape…)
create table if not exists public.activites (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts on delete cascade,
  type text not null default 'note' check (type in ('demande','note','appel','etape','tache','email')),
  texte text not null default '',
  auteur text,
  cree_le timestamptz not null default now()
);
create index if not exists activites_contact_idx on public.activites (contact_id, cree_le desc);

-- 4. Tâches et rappels
create table if not exists public.taches (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts on delete cascade,
  titre text not null,
  echeance timestamptz not null default now() + interval '1 day',
  agence text check (agence in ('Boissy','Paris 5e')),
  assigne uuid references public.profils(id) on delete set null,
  auto boolean not null default false,
  faite boolean not null default false,
  faite_le timestamptz,
  cree_le timestamptz not null default now()
);
create index if not exists taches_ouvertes_idx on public.taches (faite, echeance);

-- 5. Qui voit quoi
--   directeur : tout ; secrétaire : son agence ; moniteur : les élèves inscrits de son agence.
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
create or replace function public.est_directeur() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'directeur')
$$;

create or replace function public.est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid()
                 and (role = 'directeur' or agence is not null))
$$;

alter table public.profils   enable row level security;
alter table public.contacts  enable row level security;
alter table public.activites enable row level security;
alter table public.taches    enable row level security;

drop policy if exists profils_lire on public.profils;
create policy profils_lire on public.profils for select to authenticated
  using (id = auth.uid() or public.est_membre());
drop policy if exists profils_modifier on public.profils;
create policy profils_modifier on public.profils for update to authenticated
  using (public.est_directeur()) with check (public.est_directeur());

drop policy if exists contacts_lire on public.contacts;
create policy contacts_lire on public.contacts for select to authenticated using (public.peut_voir(agence, etape));
drop policy if exists contacts_creer on public.contacts;
create policy contacts_creer on public.contacts for insert to authenticated with check (public.peut_voir(agence, etape));
drop policy if exists contacts_modifier on public.contacts;
create policy contacts_modifier on public.contacts for update to authenticated
  using (public.peut_voir(agence, etape)) with check (public.peut_voir(agence));
drop policy if exists contacts_supprimer on public.contacts;
create policy contacts_supprimer on public.contacts for delete to authenticated using (public.est_directeur());

drop policy if exists activites_tout on public.activites;
create policy activites_tout on public.activites for all to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and public.peut_voir(c.agence, c.etape)))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and public.peut_voir(c.agence, c.etape)));

drop policy if exists taches_tout on public.taches;
create policy taches_tout on public.taches for all to authenticated
  using (public.peut_voir(agence) or assigne = auth.uid())
  with check (public.peut_voir(agence) or assigne = auth.uid());

-- 6. Mises à jour en direct (notification dans le CRM quand une demande arrive)
do $$ begin
  alter publication supabase_realtime add table public.contacts, public.taches;
exception when others then null; end $$;

-- 7. Origine du prospect (publicité) : champs envoyés par tous les formulaires du site.
--    On garde la PREMIÈRE origine connue (si la personne revient par une autre pub, c'est noté dans l'historique).
alter table public.contacts add column if not exists utm_source text;
alter table public.contacts add column if not exists utm_medium text;
alter table public.contacts add column if not exists utm_campaign text;
alter table public.contacts add column if not exists utm_content text;
alter table public.contacts add column if not exists utm_term text;
alter table public.contacts add column if not exists gclid text;
alter table public.contacts add column if not exists fbclid text;
alter table public.contacts add column if not exists page_arrivee text;
alter table public.contacts add column if not exists site_precedent text;
create index if not exists contacts_campagne_idx on public.contacts (utm_source, utm_campaign);

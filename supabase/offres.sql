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

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

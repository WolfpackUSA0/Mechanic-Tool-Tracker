
create extension if not exists "pgcrypto";

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text unique,
  role text not null check (role in ('admin','supervisor','tech','auditor')) default 'tech',
  active boolean default true,
  qr text,
  created_at timestamptz default now()
);

create table if not exists aircraft (
  id uuid primary key default gen_random_uuid(),
  tail_number text unique not null,
  hangar text default 'Hangar A',
  status text default 'active',
  lead_user text,
  crew jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists toolboxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qr text unique,
  status text default 'IN',
  tail_number text,
  checked_out_by text,
  return_requested boolean default false,
  return_approved_by text,
  return_approved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qr text unique,
  status text default 'IN',
  tail_number text,
  toolbox_id uuid references toolboxes(id) on delete set null,
  checked_out_by text,
  uses int default 0,
  last_known jsonb,
  created_at timestamptz default now()
);

create table if not exists consumables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in ('Wire','Liquid','Hardware')) default 'Hardware',
  unit text default 'pcs',
  qty numeric default 0,
  min_qty numeric default 0,
  qr text unique,
  created_at timestamptz default now()
);

create table if not exists consumable_usage (
  id uuid primary key default gen_random_uuid(),
  consumable_id uuid references consumables(id) on delete cascade,
  amount numeric not null,
  unit text not null,
  tail_number text,
  used_by text,
  used_at timestamptz default now()
);

create table if not exists discrepancies (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid references tools(id) on delete set null,
  tool_name text,
  type text,
  aircraft text,
  reported_by text,
  resolved boolean default false,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists aircraft_logs (
  id uuid primary key default gen_random_uuid(),
  tail_number text,
  user_name text,
  message text,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  aircraft text,
  text text,
  from_user text,
  read_by jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists scan_history (
  id uuid primary key default gen_random_uuid(),
  qr text,
  type text,
  action text,
  user_name text,
  aircraft text,
  created_at timestamptz default now()
);

create table if not exists audit_history (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  action text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  report_hash text,
  closed_by text,
  pdf_path text,
  snapshot jsonb,
  signature jsonb,
  closed_at timestamptz default now()
);

alter table app_users enable row level security;
alter table aircraft enable row level security;
alter table toolboxes enable row level security;
alter table tools enable row level security;
alter table consumables enable row level security;
alter table consumable_usage enable row level security;
alter table discrepancies enable row level security;
alter table aircraft_logs enable row level security;
alter table messages enable row level security;
alter table scan_history enable row level security;
alter table audit_history enable row level security;
alter table reports enable row level security;

create or replace function public.current_shop_role()
returns text language sql security definer set search_path = public as $$
  select coalesce((select role from public.app_users where auth_id = auth.uid() and active = true limit 1), 'tech');
$$;

create policy "users read own and managers read all" on app_users
for select using (auth_id = auth.uid() or public.current_shop_role() in ('admin','supervisor','auditor'));
create policy "admins manage users" on app_users
for all using (public.current_shop_role() = 'admin') with check (public.current_shop_role() = 'admin');

create policy "authenticated read aircraft" on aircraft for select using (auth.role() = 'authenticated');
create policy "managers manage aircraft" on aircraft for all using (public.current_shop_role() in ('admin','supervisor')) with check (public.current_shop_role() in ('admin','supervisor'));

create policy "authenticated read tools" on tools for select using (auth.role() = 'authenticated');
create policy "authenticated update tools" on tools for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "managers insert tools" on tools for insert with check (public.current_shop_role() in ('admin','supervisor'));
create policy "admins delete tools" on tools for delete using (public.current_shop_role() = 'admin');

create policy "authenticated read boxes" on toolboxes for select using (auth.role() = 'authenticated');
create policy "authenticated update boxes" on toolboxes for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "managers insert boxes" on toolboxes for insert with check (public.current_shop_role() in ('admin','supervisor'));
create policy "admins delete boxes" on toolboxes for delete using (public.current_shop_role() = 'admin');

create policy "authenticated read consumables" on consumables for select using (auth.role() = 'authenticated');
create policy "managers manage consumables" on consumables for all using (public.current_shop_role() in ('admin','supervisor')) with check (public.current_shop_role() in ('admin','supervisor'));

create policy "authenticated insert usage" on consumable_usage for insert with check (auth.role() = 'authenticated');
create policy "authenticated read usage" on consumable_usage for select using (auth.role() = 'authenticated');

create policy "authenticated manage discrepancies" on discrepancies for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated aircraft logs" on aircraft_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated messages" on messages for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated scan history" on scan_history for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated audit insert" on audit_history for insert with check (auth.role() = 'authenticated');
create policy "managers read audit" on audit_history for select using (public.current_shop_role() in ('admin','supervisor','auditor'));
create policy "managers reports" on reports for all using (public.current_shop_role() in ('admin','supervisor','auditor')) with check (public.current_shop_role() in ('admin','supervisor'));

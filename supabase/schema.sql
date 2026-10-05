-- Pixel Plaza database
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.usernames (
  username text primary key,
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  recipient text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

alter table public.usernames enable row level security;
alter table public.chat_messages enable row level security;
alter table public.direct_messages enable row level security;

-- Anyone may check which names are already reserved.
drop policy if exists "public can read usernames" on public.usernames;
create policy "public can read usernames"
on public.usernames for select
to anon, authenticated
using (true);

-- Chat/DM rows are intentionally public to browser clients in this simple version.
-- For a production app, replace this with authenticated-user policies.
drop policy if exists "public can read chat" on public.chat_messages;
create policy "public can read chat"
on public.chat_messages for select
to anon, authenticated
using (true);

drop policy if exists "public can insert chat" on public.chat_messages;
create policy "public can insert chat"
on public.chat_messages for insert
to anon, authenticated
with check (char_length(body) between 1 and 300);

drop policy if exists "public can read dms" on public.direct_messages;
create policy "public can read dms"
on public.direct_messages for select
to anon, authenticated
using (true);

drop policy if exists "public can insert dms" on public.direct_messages;
create policy "public can insert dms"
on public.direct_messages for insert
to anon, authenticated
with check (char_length(body) between 1 and 300);

-- Atomic name reservation. Two people trying the same name cannot both win
-- because username is the primary key.
create or replace function public.reserve_username(
  requested_username text,
  requested_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text;
begin
  clean_name := regexp_replace(trim(requested_username), '\s+', ' ', 'g');

  if clean_name !~ '^[A-Za-z0-9_ -]{2,18}$' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Use 2–18 letters, numbers, spaces, _ or - only.'
    );
  end if;

  if lower(clean_name) in ('admin','moderator','system','support','owner') then
    return jsonb_build_object('ok', false, 'error', 'That name is reserved.');
  end if;

  insert into public.usernames(username, client_id)
  values (lower(clean_name), requested_client_id);

  return jsonb_build_object('ok', true, 'username', clean_name);

exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'That username is already being used.'
    );
end;
$$;

revoke all on function public.reserve_username(text, uuid) from public;
grant execute on function public.reserve_username(text, uuid) to anon, authenticated;

-- Realtime publication for database-backed chat history.
alter table public.chat_messages replica identity full;
alter table public.direct_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;

-- Cleanup helper. The browser calls this when a user leaves.
create or replace function public.release_username(
  requested_username text,
  requested_client_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.usernames
  where username = lower(trim(requested_username))
    and client_id = requested_client_id;
  return found;
end;
$$;

revoke all on function public.release_username(text, uuid) from public;
grant execute on function public.release_username(text, uuid) to anon, authenticated;

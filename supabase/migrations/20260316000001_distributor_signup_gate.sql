-- Distributor signup code gate (backwards compatible, additive only)

create table if not exists public.distributor_signup_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  is_active boolean not null default true,
  max_uses integer not null default 1 check (max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  note text null,
  last_used_at timestamptz null,
  constraint distributor_signup_codes_uses_lte_max check (uses_count <= max_uses)
);

create unique index if not exists idx_distributor_signup_codes_code
  on public.distributor_signup_codes(code);

create table if not exists public.distributor_signup_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.distributor_signup_codes(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text null,
  redeemed_at timestamptz not null default now(),
  ip text null,
  user_agent text null
);

create unique index if not exists idx_distributor_signup_code_redemptions_user_unique
  on public.distributor_signup_code_redemptions(user_id);

create index if not exists idx_distributor_signup_code_redemptions_user_id
  on public.distributor_signup_code_redemptions(user_id);

create index if not exists idx_distributor_signup_code_redemptions_code_id
  on public.distributor_signup_code_redemptions(code_id);

alter table public.profiles
  add column if not exists distributor_code_id uuid null references public.distributor_signup_codes(id) on delete set null,
  add column if not exists distributor_code_redeemed_at timestamptz null;

alter table public.distributor_signup_codes enable row level security;
alter table public.distributor_signup_code_redemptions enable row level security;

drop policy if exists "service role manages distributor signup codes" on public.distributor_signup_codes;
create policy "service role manages distributor signup codes"
on public.distributor_signup_codes
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages distributor signup code redemptions" on public.distributor_signup_code_redemptions;
create policy "service role manages distributor signup code redemptions"
on public.distributor_signup_code_redemptions
for all
to service_role
using (true)
with check (true);

drop policy if exists "users can read their own distributor signup code redemptions" on public.distributor_signup_code_redemptions;
create policy "users can read their own distributor signup code redemptions"
on public.distributor_signup_code_redemptions
for select
to authenticated
using (auth.uid() = user_id);

revoke all on table public.distributor_signup_codes from anon, authenticated;
revoke all on table public.distributor_signup_code_redemptions from anon;
grant select on table public.distributor_signup_code_redemptions to authenticated;
grant all on table public.distributor_signup_codes to service_role;
grant all on table public.distributor_signup_code_redemptions to service_role;

create or replace function public.normalize_distributor_signup_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  NEW.code := upper(trim(coalesce(NEW.code, '')));
  if NEW.code = '' then
    raise exception 'Signup code cannot be empty';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_normalize_distributor_signup_code on public.distributor_signup_codes;
create trigger trg_normalize_distributor_signup_code
before insert or update of code on public.distributor_signup_codes
for each row
execute function public.normalize_distributor_signup_code();

create or replace function public.generate_distributor_signup_code(p_length integer default 16)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_length integer := greatest(12, least(coalesce(p_length, 16), 40));
  v_raw text;
begin
  v_raw := upper(encode(gen_random_bytes(((v_length + 1) / 2)::integer), 'hex'));
  return substring(v_raw from 1 for v_length);
end;
$$;

revoke all on function public.generate_distributor_signup_code(integer) from public;
grant execute on function public.generate_distributor_signup_code(integer) to service_role;

create or replace function public.validate_distributor_signup_code(p_signup_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.distributor_signup_codes c
    where c.code = upper(trim(coalesce(p_signup_code, '')))
      and c.is_active = true
      and (c.expires_at is null or c.expires_at > now())
      and c.uses_count < c.max_uses
  );
$$;

revoke all on function public.validate_distributor_signup_code(text) from public;
grant execute on function public.validate_distributor_signup_code(text) to anon, authenticated;

create or replace function public.redeem_distributor_signup_code(
  p_signup_code text,
  p_email text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_signup_code text := upper(trim(coalesce(p_signup_code, '')));
  v_existing_code_id uuid;
  v_code public.distributor_signup_codes%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_signup_code = '' then
    raise exception 'Distributor signup code is required';
  end if;

  select r.code_id
    into v_existing_code_id
  from public.distributor_signup_code_redemptions r
  where r.user_id = v_user_id
  limit 1;

  if v_existing_code_id is not null then
    update public.profiles
      set role = 'distributor',
          distributor_code_id = coalesce(distributor_code_id, v_existing_code_id),
          distributor_code_redeemed_at = coalesce(distributor_code_redeemed_at, v_now)
    where id = v_user_id;

    return jsonb_build_object(
      'ok', true,
      'status', 'already_redeemed',
      'code_id', v_existing_code_id
    );
  end if;

  select c.*
    into v_code
  from public.distributor_signup_codes c
  where c.code = v_signup_code
  for update;

  if v_code.id is null
     or v_code.is_active is not true
     or (v_code.expires_at is not null and v_code.expires_at <= v_now)
     or v_code.uses_count >= v_code.max_uses then
    raise exception 'Invalid or expired signup code';
  end if;

  update public.distributor_signup_codes
    set uses_count = uses_count + 1,
        last_used_at = v_now
  where id = v_code.id;

  insert into public.distributor_signup_code_redemptions (
    code_id,
    user_id,
    email,
    redeemed_at,
    ip,
    user_agent
  )
  values (
    v_code.id,
    v_user_id,
    nullif(trim(coalesce(p_email, '')), ''),
    v_now,
    nullif(trim(coalesce(p_ip, '')), ''),
    nullif(trim(coalesce(p_user_agent, '')), '')
  );

  update public.profiles
    set role = 'distributor',
        distributor_code_id = v_code.id,
        distributor_code_redeemed_at = v_now
  where id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'redeemed',
    'code_id', v_code.id
  );
exception
  when unique_violation then
    select r.code_id
      into v_existing_code_id
    from public.distributor_signup_code_redemptions r
    where r.user_id = v_user_id
    limit 1;

    if v_existing_code_id is not null then
      return jsonb_build_object(
        'ok', true,
        'status', 'already_redeemed',
        'code_id', v_existing_code_id
      );
    end if;

    raise;
end;
$$;

revoke all on function public.redeem_distributor_signup_code(text, text, text, text) from public;
grant execute on function public.redeem_distributor_signup_code(text, text, text, text) to authenticated;

create or replace function public.enforce_distributor_signup_redemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.role = 'distributor'
     and NEW.distributor_code_id is null then
    if TG_OP = 'INSERT' then
      raise exception 'Distributor signup code redemption is required';
    end if;

    if TG_OP = 'UPDATE' and coalesce(OLD.role, '') <> 'distributor' then
      raise exception 'Distributor signup code redemption is required';
    end if;
  end if;

  if NEW.role = 'distributor'
     and TG_OP = 'UPDATE'
     and coalesce(OLD.role, '') <> 'distributor'
     and not exists (
       select 1
       from public.distributor_signup_code_redemptions r
       where r.user_id = NEW.id
         and r.code_id = NEW.distributor_code_id
     ) then
    raise exception 'Distributor signup code redemption is required';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_distributor_signup_redemption on public.profiles;
create trigger trg_enforce_distributor_signup_redemption
before insert or update of role, distributor_code_id on public.profiles
for each row
execute function public.enforce_distributor_signup_redemption();

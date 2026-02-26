-- Harden email_events into a durable outbox + add trigger-based email enqueue for orders.
-- This removes reliance on dashboard-only webhook wiring and ensures multi-tenant delivery.

alter table public.email_events
  add column if not exists status text not null default 'pending',
  add column if not exists event_type text,
  add column if not exists order_id uuid references public.orders(id) on delete cascade,
  add column if not exists distributor_id uuid references public.profiles(id) on delete set null,
  add column if not exists vendor_id uuid references public.profiles(id) on delete set null,
  add column if not exists to_email text,
  add column if not exists subject text,
  add column if not exists html text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.email_events
set
  event_type = coalesce(
    event_type,
    case
      when event_key like 'order_created:%' then 'ORDER_PLACED'
      when event_key like 'order_placed:%' then 'ORDER_PLACED'
      when event_key like 'order_accepted:%' then 'ORDER_ACCEPTED'
      else 'LEGACY'
    end
  ),
  order_id = coalesce(
    order_id,
    case
      when split_part(event_key, ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(event_key, ':', 2)::uuid
      else null
    end
  ),
  status = coalesce(status, 'sent'),
  sent_at = coalesce(sent_at, created_at),
  updated_at = coalesce(updated_at, now())
where
  event_type is null
  or order_id is null
  or status is null
  or sent_at is null
  or updated_at is null;

-- Legacy rows only had event_key; mark them as already processed to avoid resending historical events.
update public.email_events
set
  status = 'sent',
  sent_at = coalesce(sent_at, created_at)
where to_email is null
  and status = 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_events_status_check'
      and conrelid = 'public.email_events'::regclass
  ) then
    alter table public.email_events
      add constraint email_events_status_check
      check (status in ('pending', 'processing', 'sent', 'failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_events_attempts_check'
      and conrelid = 'public.email_events'::regclass
  ) then
    alter table public.email_events
      add constraint email_events_attempts_check
      check (attempts >= 0);
  end if;
end $$;

create unique index if not exists email_events_event_order_recipient_uidx
  on public.email_events (event_type, order_id, lower(to_email))
  where event_type is not null
    and order_id is not null
    and to_email is not null;

create index if not exists email_events_status_created_at_idx
  on public.email_events (status, created_at);

create index if not exists email_events_order_event_idx
  on public.email_events (order_id, event_type);

alter table public.email_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_events'
      and policyname = 'service_role_all_email_events'
  ) then
    create policy "service_role_all_email_events"
      on public.email_events
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

create or replace function public.set_email_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_email_events_updated_at on public.email_events;
create trigger set_email_events_updated_at
before update on public.email_events
for each row
execute function public.set_email_events_updated_at();

create or replace function public.normalize_email_text(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_email, ''))), '')
$$;

create or replace function public.enqueue_order_placed_email_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_has_business_profiles boolean := to_regclass('public.business_profiles') is not null;
  v_dist_email text;
  v_dist_name text;
  v_vendor_email text;
  v_vendor_name text;
  v_subject text;
  v_event_key text;
begin
  select *
    into v_order
  from public.orders
  where id = p_order_id;

  if v_order.id is null then
    return;
  end if;

  -- Only vendor-originated orders should emit ORDER_PLACED emails.
  if coalesce(lower(v_order.created_by_role), 'vendor') <> 'vendor' then
    return;
  end if;

  if v_has_business_profiles then
    select
      public.normalize_email_text(coalesce(p.notification_email, p.email, bp.email)),
      nullif(trim(coalesce(bp.business_name, p.display_name, p.email)), '')
      into v_dist_email, v_dist_name
    from public.profiles p
    left join public.business_profiles bp on bp.user_id = p.id
    where p.id = v_order.distributor_id;

    select
      public.normalize_email_text(coalesce(p.email, bp.email)),
      nullif(trim(coalesce(bp.business_name, p.display_name, p.email)), '')
      into v_vendor_email, v_vendor_name
    from public.profiles p
    left join public.business_profiles bp on bp.user_id = p.id
    where p.id = v_order.vendor_id;
  else
    select
      public.normalize_email_text(coalesce(p.notification_email, p.email)),
      nullif(trim(coalesce(p.display_name, p.email)), '')
      into v_dist_email, v_dist_name
    from public.profiles p
    where p.id = v_order.distributor_id;

    select
      public.normalize_email_text(p.email),
      nullif(trim(coalesce(p.display_name, p.email)), '')
      into v_vendor_email, v_vendor_name
    from public.profiles p
    where p.id = v_order.vendor_id;
  end if;

  v_dist_name := coalesce(v_dist_name, v_dist_email, 'Distributor');
  v_vendor_name := coalesce(v_vendor_name, v_vendor_email, 'Vendor');
  v_subject := format('New order from %s', v_vendor_name);

  if not exists (
    select 1
    from public.notifications n
    where n.user_id = v_order.distributor_id
      and n.type = 'order_created'
      and n.ref_type = 'order'
      and n.ref_id = v_order.id
  ) then
    insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
    values (
      v_order.distributor_id,
      'order_created',
      'New Order Received',
      format('You have received a new order from %s.', v_vendor_name),
      'order',
      v_order.id
    );
  end if;

  if v_dist_email is null then
    v_event_key := format('order_placed:%s:missing-distributor-email', v_order.id::text);

    insert into public.email_events (
      event_key,
      event_type,
      status,
      order_id,
      distributor_id,
      vendor_id,
      to_email,
      subject,
      payload,
      last_error
    )
    values (
      v_event_key,
      'ORDER_PLACED',
      'failed',
      v_order.id,
      v_order.distributor_id,
      v_order.vendor_id,
      null,
      v_subject,
      jsonb_build_object(
        'order_id', v_order.id,
        'distributor_id', v_order.distributor_id,
        'vendor_id', v_order.vendor_id,
        'distributor_name', v_dist_name,
        'vendor_name', v_vendor_name,
        'vendor_email', v_vendor_email,
        'order_path', '/distributor/orders/' || v_order.id::text
      ),
      format('Distributor recipient email is missing for distributor_id=%s', v_order.distributor_id::text)
    )
    on conflict (event_key) do update
      set status = excluded.status,
          last_error = excluded.last_error,
          payload = excluded.payload;

    return;
  end if;

  v_event_key := format('order_placed:%s:%s', v_order.id::text, v_dist_email);

  insert into public.email_events (
    event_key,
    event_type,
    status,
    order_id,
    distributor_id,
    vendor_id,
    to_email,
    subject,
    payload
  )
  values (
    v_event_key,
    'ORDER_PLACED',
    'pending',
    v_order.id,
    v_order.distributor_id,
    v_order.vendor_id,
    v_dist_email,
    v_subject,
    jsonb_build_object(
      'order_id', v_order.id,
      'distributor_id', v_order.distributor_id,
      'vendor_id', v_order.vendor_id,
      'distributor_name', v_dist_name,
      'vendor_name', v_vendor_name,
      'vendor_email', v_vendor_email,
      'order_path', '/distributor/orders/' || v_order.id::text
    )
  )
  on conflict (event_key) do nothing;
end;
$$;

create or replace function public.enqueue_order_accepted_email_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_has_business_profiles boolean := to_regclass('public.business_profiles') is not null;
  v_dist_email text;
  v_dist_name text;
  v_vendor_email text;
  v_vendor_name text;
  v_subject text;
  v_event_key text;
begin
  select *
    into v_order
  from public.orders
  where id = p_order_id;

  if v_order.id is null then
    return;
  end if;

  if lower(coalesce(v_order.status, '')) not in ('accepted', 'approved', 'confirmed') then
    return;
  end if;

  if v_has_business_profiles then
    select
      public.normalize_email_text(coalesce(p.email, bp.email)),
      nullif(trim(coalesce(bp.business_name, p.display_name, p.email)), '')
      into v_dist_email, v_dist_name
    from public.profiles p
    left join public.business_profiles bp on bp.user_id = p.id
    where p.id = v_order.distributor_id;

    select
      public.normalize_email_text(coalesce(p.notification_email, p.email, bp.email)),
      nullif(trim(coalesce(bp.business_name, p.display_name, p.email)), '')
      into v_vendor_email, v_vendor_name
    from public.profiles p
    left join public.business_profiles bp on bp.user_id = p.id
    where p.id = v_order.vendor_id;
  else
    select
      public.normalize_email_text(p.email),
      nullif(trim(coalesce(p.display_name, p.email)), '')
      into v_dist_email, v_dist_name
    from public.profiles p
    where p.id = v_order.distributor_id;

    select
      public.normalize_email_text(coalesce(p.notification_email, p.email)),
      nullif(trim(coalesce(p.display_name, p.email)), '')
      into v_vendor_email, v_vendor_name
    from public.profiles p
    where p.id = v_order.vendor_id;
  end if;

  v_dist_name := coalesce(v_dist_name, v_dist_email, 'Distributor');
  v_vendor_name := coalesce(v_vendor_name, v_vendor_email, 'Vendor');
  v_subject := 'Your order was accepted';

  if not exists (
    select 1
    from public.notifications n
    where n.user_id = v_order.vendor_id
      and n.type = 'order_accepted'
      and n.ref_type = 'order'
      and n.ref_id = v_order.id
  ) then
    insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
    values (
      v_order.vendor_id,
      'order_accepted',
      'Order Accepted',
      format('Great news! Your recent order has been accepted by %s.', v_dist_name),
      'order',
      v_order.id
    );
  end if;

  if v_vendor_email is null then
    v_event_key := format('order_accepted:%s:missing-vendor-email', v_order.id::text);

    insert into public.email_events (
      event_key,
      event_type,
      status,
      order_id,
      distributor_id,
      vendor_id,
      to_email,
      subject,
      payload,
      last_error
    )
    values (
      v_event_key,
      'ORDER_ACCEPTED',
      'failed',
      v_order.id,
      v_order.distributor_id,
      v_order.vendor_id,
      null,
      v_subject,
      jsonb_build_object(
        'order_id', v_order.id,
        'distributor_id', v_order.distributor_id,
        'vendor_id', v_order.vendor_id,
        'distributor_name', v_dist_name,
        'distributor_email', v_dist_email,
        'vendor_name', v_vendor_name,
        'order_path', '/vendor/orders/' || v_order.id::text
      ),
      format('Vendor recipient email is missing for vendor_id=%s', v_order.vendor_id::text)
    )
    on conflict (event_key) do update
      set status = excluded.status,
          last_error = excluded.last_error,
          payload = excluded.payload;

    return;
  end if;

  v_event_key := format('order_accepted:%s:%s', v_order.id::text, v_vendor_email);

  insert into public.email_events (
    event_key,
    event_type,
    status,
    order_id,
    distributor_id,
    vendor_id,
    to_email,
    subject,
    payload
  )
  values (
    v_event_key,
    'ORDER_ACCEPTED',
    'pending',
    v_order.id,
    v_order.distributor_id,
    v_order.vendor_id,
    v_vendor_email,
    v_subject,
    jsonb_build_object(
      'order_id', v_order.id,
      'distributor_id', v_order.distributor_id,
      'vendor_id', v_order.vendor_id,
      'distributor_name', v_dist_name,
      'distributor_email', v_dist_email,
      'vendor_name', v_vendor_name,
      'order_path', '/vendor/orders/' || v_order.id::text
    )
  )
  on conflict (event_key) do nothing;
end;
$$;

create or replace function public.enqueue_order_placed_email_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_order_placed_email_for_order(new.id);
  return new;
end;
$$;

create or replace function public.enqueue_order_accepted_email_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text := lower(coalesce(old.status, ''));
  v_new_status text := lower(coalesce(new.status, ''));
begin
  if v_new_status in ('accepted', 'approved', 'confirmed')
     and v_old_status not in ('accepted', 'approved', 'confirmed') then
    perform public.enqueue_order_accepted_email_for_order(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_order_placed_email on public.orders;
create trigger trg_enqueue_order_placed_email
after insert on public.orders
for each row
execute function public.enqueue_order_placed_email_trigger();

drop trigger if exists trg_enqueue_order_accepted_email on public.orders;
create trigger trg_enqueue_order_accepted_email
after update of status on public.orders
for each row
execute function public.enqueue_order_accepted_email_trigger();

revoke all on function public.enqueue_order_placed_email_for_order(uuid) from public;
revoke all on function public.enqueue_order_accepted_email_for_order(uuid) from public;
grant execute on function public.enqueue_order_placed_email_for_order(uuid) to service_role;
grant execute on function public.enqueue_order_accepted_email_for_order(uuid) to service_role;

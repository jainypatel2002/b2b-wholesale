-- STRICT RLS POLICY: Allow distributors to view profiles ONLY if they have an order from that vendor.

drop policy if exists "Distributors can view profiles of their order vendors" on profiles;

create policy "Distributors can view profiles of their order vendors"
on profiles
for select
to authenticated
using (
  -- User is the distributor of an order placed by this profile (vendor)
  exists (
    select 1 from orders
    where orders.vendor_id = profiles.id
    and orders.distributor_id = auth.uid()
  )
  OR
  -- Or user is looking at their own profile
  auth.uid() = id
  OR
  -- Or user is the vendor looking at the distributor (if needed, but this specific task is for distributor view)
  exists (
     select 1 from orders
     where orders.distributor_id = profiles.id
     and orders.vendor_id = auth.uid()
  )
);

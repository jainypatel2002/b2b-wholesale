-- FIX: Allow all authenticated users to read profiles.
-- Previous policy was too restrictive: it only allowed reading profiles *after* an invoice existed.
-- This prevented Distributors from seeing the list of Vendors to CREATE a new invoice.

-- Drop previous restrictive policies
drop policy if exists "Distributors can view profiles of their invoice vendors" on profiles;
drop policy if exists "Invoice counterparts can view profiles" on profiles;
drop policy if exists "Authenticated users can view profiles" on profiles;

-- Create a permissive policy for authenticated users to view all profiles
-- This is necessary for features like "Select Vendor" dropdowns to work properly.
create policy "Authenticated users can view profiles"
on profiles
for select
to authenticated
using ( true );

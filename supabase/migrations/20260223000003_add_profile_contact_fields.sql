-- Add missing contact fields to profiles table
-- These are required for professional invoice rendering and linking.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists location_address text;

-- Add comment for documentation
comment on column public.profiles.phone is 'Contact phone number for distributors/vendors';
comment on column public.profiles.location_address is 'Full business or warehouse address';

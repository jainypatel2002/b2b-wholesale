-- Ensure vendor can see their own link to distributor
drop policy if exists "dv: vendor sees their link" on public.distributor_vendors;
create policy "dv: vendor sees their link" on public.distributor_vendors
for select using (auth.uid() = vendor_id);

-- Ensure vendor can see products of the linked distributor
drop policy if exists "products: vendor read via link" on public.products;
create policy "products: vendor read via link" on public.products
for select using (
  active = true and exists (
    select 1 from public.distributor_vendors dv
    where dv.vendor_id = auth.uid() and dv.distributor_id = products.distributor_id
  )
);

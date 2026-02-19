-- Allow distributors to update their own products (needed for soft delete)
drop policy if exists "Distributor can update their own products" on products;
create policy "Distributor can update their own products"
on products
for update
to authenticated
using (distributor_id = auth.uid())
with check (distributor_id = auth.uid());

-- Allow distributors to update their own categories (needed for soft delete)
drop policy if exists "Distributor can update their own categories" on categories;
create policy "Distributor can update their own categories"
on categories
for update
to authenticated
using (distributor_id = auth.uid())
with check (distributor_id = auth.uid());

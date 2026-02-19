
-- 20260221_soft_delete_policies.sql

-- Allow DISTRIBUTOR to update deleted_at on ORDERS
-- (Existing policies might allow update, but let's be explicit and ensure deleted_at is covered)
create policy "orders: distributor soft delete"
on orders for update
to authenticated
using (
    auth.uid() = distributor_id
)
with check (
    auth.uid() = distributor_id
);

-- Allow VENDOR to update deleted_at on ORDERS
create policy "orders: vendor soft delete"
on orders for update
to authenticated
using (
    auth.uid() = vendor_id
)
with check (
    auth.uid() = vendor_id
);


-- Allow DISTRIBUTOR to update deleted_at on INVOICES
create policy "invoices: distributor soft delete"
on invoices for update
to authenticated
using (
    auth.uid() = distributor_id
)
with check (
    auth.uid() = distributor_id
);

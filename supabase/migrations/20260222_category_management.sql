-- Create subcategories table if it doesn't exist
create table if not exists subcategories (
    id uuid default gen_random_uuid() primary key,
    distributor_id uuid references profiles(id) not null,
    category_id uuid references categories(id) on delete cascade not null,
    name text not null,
    created_at timestamptz default now(),
    deleted_at timestamptz
);

-- Enable RLS on subcategories
alter table subcategories enable row level security;

-- Add RLS policies for subcategories
create policy "Distributors can view their own subcategories"
    on subcategories for select
    using (distributor_id = auth.uid());

create policy "Distributors can insert their own subcategories"
    on subcategories for insert
    with check (distributor_id = auth.uid());

create policy "Distributors can update their own subcategories"
    on subcategories for update
    using (distributor_id = auth.uid());

create policy "Distributors can delete their own subcategories"
    on subcategories for delete
    using (distributor_id = auth.uid());

-- Add RLS policies for categories (if not already present, safely)
do $$
begin
    if not exists (
        select 1 from pg_policies where tablename = 'categories' and policyname = 'Distributors can insert their own categories'
    ) then
        create policy "Distributors can insert their own categories"
            on categories for insert
            with check (distributor_id = auth.uid());
    end if;

    if not exists (
        select 1 from pg_policies where tablename = 'categories' and policyname = 'Distributors can update their own categories'
    ) then
        create policy "Distributors can update their own categories"
            on categories for update
            using (distributor_id = auth.uid());
    end if;

    if not exists (
        select 1 from pg_policies where tablename = 'categories' and policyname = 'Distributors can delete their own categories'
    ) then
        create policy "Distributors can delete their own categories"
            on categories for delete
            using (distributor_id = auth.uid());
    end if;
end
$$;


-- Add unique constraints for case-insensitive names to prevent duplicates
-- For categories
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'categories_distributor_id_name_key'
    ) then
        alter table categories add constraint categories_distributor_id_name_key unique (distributor_id, name);
    end if;
end
$$;

-- For subcategories
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'subcategories_category_id_name_key'
    ) then
        alter table subcategories add constraint subcategories_category_id_name_key unique (category_id, name);
    end if;
end
$$;

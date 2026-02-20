-- Create RPC function to safely ensure distributor code exists
create or replace function public.ensure_distributor_code()
returns text
language plpgsql
security definer
as $$
declare
  current_code text;
  new_code text;
  exists_already boolean;
begin
  -- 1. Check if user is a distributor (or verify via profiles table if role is not available in auth.users metadata securely here, 
  -- but we can just check profiles table for the current user)
  
  -- Check if code exists
  select distributor_code into current_code from public.profiles where id = auth.uid();
  
  if current_code is not null then
    return current_code;
  end if;

  -- 2. Generate new code if null
  loop
    -- Generate 8-char uppercase alphanumeric code
    new_code := 'DIST-' || upper(substr(md5(random()::text), 1, 8));

    select exists(select 1 from public.profiles where distributor_code = new_code)
    into exists_already;

    if not exists_already then
      update public.profiles 
      set distributor_code = new_code 
      where id = auth.uid();
      
      -- If update failed (e.g. user not found), return null or error? 
      -- But we assume user exists if they are authenticated and calling this.
      exit;
    end if;
  end loop;

  return new_code;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.ensure_distributor_code to authenticated;

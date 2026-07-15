-- Run once in Supabase SQL Editor, then replace the email below.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end;
$$;

update public.profiles
set role = 'admin'
where id = (
  select id
  from auth.users
  where lower(email) = lower('YOUR_ADMIN_EMAIL')
);

-- The result must be exactly one row.
select u.email, p.display_name, p.role
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('YOUR_ADMIN_EMAIL');

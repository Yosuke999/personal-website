-- Yosuke Travel Atlas · initial schema
-- Run this file in Supabase SQL Editor after creating a project.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('member', 'admin');
create type public.province_status as enum ('visited', 'planned', 'unplanned');
create type public.comment_target as enum ('story', 'province', 'wall', 'plan');
create type public.verdict_type as enum ('worth_it', 'depends', 'not_recommended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_path text,
  role public.user_role not null default 'member',
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provinces (
  code text primary key,
  name text unique not null,
  status public.province_status not null default 'unplanned',
  intro text,
  cover_path text,
  expected_at text,
  updated_at timestamptz not null default now()
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  province_code text not null references public.provinces(code),
  title text not null,
  slug text unique not null,
  cover_path text,
  traveled_at date not null,
  city_spots text[] not null default '{}',
  body text not null default '',
  verdict public.verdict_type,
  rating smallint check (rating between 1 and 5),
  pros text[] not null default '{}',
  cons text[] not null default '{}',
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.story_photos (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  storage_path text not null,
  caption_title text,
  caption_story text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.place_ratings (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  place_name text not null,
  verdict public.verdict_type not null,
  rating smallint not null check (rating between 1 and 5),
  pros text[] not null default '{}',
  cons text[] not null default '{}',
  note text,
  created_at timestamptz not null default now()
);

create table public.travel_wishes (
  id uuid primary key default gen_random_uuid(),
  province_code text not null references public.provinces(code) on delete cascade,
  place_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.comment_target not null,
  target_id text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comment_images (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.story_likes (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  target_url text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and not is_blocked); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.profiles(id, display_name) values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))); return new; end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  -- SQL Editor and trusted server-side jobs have no authenticated user id and
  -- must be able to bootstrap the first owner. Browser users still need admin.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end; $$;

create trigger protect_profile_role before update on public.profiles
for each row execute procedure public.protect_profile_role();

create or replace function public.enforce_comment_image_quota()
returns trigger language plpgsql security definer set search_path = public
as $$
declare target public.comment_target; target_key text; comment_author uuid; image_count integer;
begin
  select target_type, target_id, author_id into target, target_key, comment_author
  from public.comments where id = new.comment_id;
  if comment_author is null or comment_author <> new.owner_id then
    raise exception 'Comment images can only be added by the comment author';
  end if;
  if target = 'story' then
    select count(*) into image_count from public.comment_images ci
    join public.comments c on c.id = ci.comment_id
    where c.target_type = 'story' and c.target_id = target_key and c.author_id = new.owner_id;
  else
    select count(*) into image_count from public.comment_images where comment_id = new.comment_id;
  end if;
  if image_count >= 2 then raise exception 'Comment image limit exceeded'; end if;
  return new;
end; $$;

create trigger enforce_comment_image_quota before insert on public.comment_images
for each row execute procedure public.enforce_comment_image_quota();

alter table public.profiles enable row level security;
alter table public.provinces enable row level security;
alter table public.stories enable row level security;
alter table public.story_photos enable row level security;
alter table public.place_ratings enable row level security;
alter table public.travel_wishes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_images enable row level security;
alter table public.story_likes enable row level security;
alter table public.notifications enable row level security;

create policy "members read profiles" on public.profiles for select to authenticated using (not is_blocked or id = auth.uid() or public.is_admin());
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid() and not is_blocked) with check (id = auth.uid());
create policy "admin manages profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "members read provinces" on public.provinces for select to authenticated using (true);
create policy "admin manages provinces" on public.provinces for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "members read published stories" on public.stories for select to authenticated using (is_published or public.is_admin());
create policy "admin manages stories" on public.stories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "members read story photos" on public.story_photos for select to authenticated using (true);
create policy "admin manages story photos" on public.story_photos for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "members read ratings" on public.place_ratings for select to authenticated using (true);
create policy "admin manages ratings" on public.place_ratings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "members read wishes" on public.travel_wishes for select to authenticated using (true);
create policy "admin manages wishes" on public.travel_wishes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "members read comments" on public.comments for select to authenticated using (true);
create policy "members create comments" on public.comments for insert to authenticated with check (author_id = auth.uid() and not exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_blocked));
create policy "owner or admin updates comments" on public.comments for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy "owner or admin deletes comments" on public.comments for delete to authenticated using (author_id = auth.uid() or public.is_admin());
create policy "members read comment images" on public.comment_images for select to authenticated using (true);
create policy "owner adds comment images" on public.comment_images for insert to authenticated with check (owner_id = auth.uid());
create policy "owner or admin deletes comment images" on public.comment_images for delete to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "members read likes" on public.story_likes for select to authenticated using (true);
create policy "members add own likes" on public.story_likes for insert to authenticated with check (user_id = auth.uid());
create policy "members remove own likes" on public.story_likes for delete to authenticated using (user_id = auth.uid());
create policy "users read own notifications" on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "system or admin creates notifications" on public.notifications for insert to authenticated with check (public.is_admin() or actor_id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('travel-media', 'travel-media', false, 15728640, array['image/jpeg','image/png','image/webp']),
  ('comment-media', 'comment-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "authenticated read private media" on storage.objects for select to authenticated using (bucket_id in ('avatars','travel-media','comment-media'));
create policy "users upload own avatar" on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users update own avatar" on storage.objects for update to authenticated using (bucket_id='avatars' and owner_id=auth.uid()::text);
create policy "users upload comment media" on storage.objects for insert to authenticated with check (bucket_id='comment-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users delete own comment media" on storage.objects for delete to authenticated using (bucket_id='comment-media' and owner_id=auth.uid()::text);
create policy "admin manages travel media" on storage.objects for all to authenticated using (bucket_id='travel-media' and public.is_admin()) with check (bucket_id='travel-media' and public.is_admin());

-- After your first signup, promote the owner once in SQL Editor:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_EMAIL');

-- Run once in Supabase SQL Editor after the initial schema and governance scripts.
-- Blocks stale sessions from acting after an account is disabled, hides draft media,
-- and prevents browser clients from forging notification rows.

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and not is_blocked
  );
$$;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles for select to authenticated
using ((public.is_active_member() and not is_blocked) or id = auth.uid() or public.is_admin());

drop policy if exists "members read provinces" on public.provinces;
create policy "members read provinces" on public.provinces for select to authenticated
using (public.is_active_member());

drop policy if exists "members read published stories" on public.stories;
create policy "members read published stories" on public.stories for select to authenticated
using ((public.is_active_member() and is_published) or public.is_admin());

drop policy if exists "members read story photos" on public.story_photos;
create policy "members read story photos" on public.story_photos for select to authenticated
using (
  public.is_admin() or (
    public.is_active_member() and exists(
      select 1 from public.stories s where s.id = story_id and s.is_published
    )
  )
);

drop policy if exists "members read ratings" on public.place_ratings;
create policy "members read ratings" on public.place_ratings for select to authenticated
using (
  public.is_admin() or (
    public.is_active_member() and exists(
      select 1 from public.stories s where s.id = story_id and s.is_published
    )
  )
);

drop policy if exists "members read wishes" on public.travel_wishes;
create policy "members read wishes" on public.travel_wishes for select to authenticated
using (public.is_active_member());

drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments for select to authenticated
using (public.is_active_member());

drop policy if exists "members create comments" on public.comments;
create policy "members create comments" on public.comments for insert to authenticated
with check (author_id = auth.uid() and public.is_active_member());

drop policy if exists "owner or admin updates comments" on public.comments;
create policy "owner or admin updates comments" on public.comments for update to authenticated
using ((author_id = auth.uid() and public.is_active_member()) or public.is_admin())
with check ((author_id = auth.uid() and public.is_active_member()) or public.is_admin());

drop policy if exists "owner or admin deletes comments" on public.comments;
create policy "owner or admin deletes comments" on public.comments for delete to authenticated
using ((author_id = auth.uid() and public.is_active_member()) or public.is_admin());

drop policy if exists "members read comment images" on public.comment_images;
create policy "members read comment images" on public.comment_images for select to authenticated
using (public.is_active_member());

drop policy if exists "owner adds comment images" on public.comment_images;
create policy "owner adds comment images" on public.comment_images for insert to authenticated
with check (owner_id = auth.uid() and public.is_active_member());

drop policy if exists "owner or admin deletes comment images" on public.comment_images;
create policy "owner or admin deletes comment images" on public.comment_images for delete to authenticated
using ((owner_id = auth.uid() and public.is_active_member()) or public.is_admin());

drop policy if exists "members read likes" on public.story_likes;
create policy "members read likes" on public.story_likes for select to authenticated
using (
  public.is_active_member() and exists(
    select 1 from public.stories s where s.id = story_id and s.is_published
  )
);

drop policy if exists "members add own likes" on public.story_likes;
create policy "members add own likes" on public.story_likes for insert to authenticated
with check (
  user_id = auth.uid() and public.is_active_member() and exists(
    select 1 from public.stories s where s.id = story_id and s.is_published
  )
);

drop policy if exists "members remove own likes" on public.story_likes;
create policy "members remove own likes" on public.story_likes for delete to authenticated
using (user_id = auth.uid() and public.is_active_member());

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select to authenticated
using (recipient_id = auth.uid() and public.is_active_member());

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications for update to authenticated
using (recipient_id = auth.uid() and public.is_active_member())
with check (recipient_id = auth.uid() and public.is_active_member());

drop policy if exists "system or admin creates notifications" on public.notifications;

drop policy if exists "authenticated read private media" on storage.objects;
create policy "authenticated read private media" on storage.objects for select to authenticated
using (
  public.is_active_member() and (
    bucket_id in ('avatars', 'comment-media') or (
      bucket_id = 'travel-media' and (
        public.is_admin()
        or exists(select 1 from public.stories s where s.is_published and s.cover_path = name)
        or exists(
          select 1 from public.story_photos sp
          join public.stories s on s.id = sp.story_id
          where s.is_published and sp.storage_path = name
        )
      )
    )
  )
);

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar" on storage.objects for insert to authenticated
with check (public.is_active_member() and bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar" on storage.objects for update to authenticated
using (public.is_active_member() and bucket_id = 'avatars' and owner_id = auth.uid()::text);

drop policy if exists "users upload comment media" on storage.objects;
create policy "users upload comment media" on storage.objects for insert to authenticated
with check (public.is_active_member() and bucket_id = 'comment-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own comment media" on storage.objects;
create policy "users delete own comment media" on storage.objects for delete to authenticated
using (public.is_active_member() and bucket_id = 'comment-media' and owner_id = auth.uid()::text);

-- Run once in Supabase SQL Editor.
drop policy if exists "users delete own comment media" on storage.objects;
drop policy if exists "owner or admin deletes comment media" on storage.objects;
create policy "owner or admin deletes comment media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'comment-media'
  and (owner_id = auth.uid()::text or public.is_admin())
);

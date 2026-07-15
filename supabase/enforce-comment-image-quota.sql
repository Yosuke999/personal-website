-- Run once in Supabase SQL Editor.
create or replace function public.enforce_comment_image_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.comment_target;
  target_key text;
  comment_author uuid;
  image_count integer;
begin
  select target_type, target_id, author_id
  into target, target_key, comment_author
  from public.comments
  where id = new.comment_id;

  if comment_author is null or comment_author <> new.owner_id then
    raise exception 'Comment images can only be added by the comment author';
  end if;

  if target = 'story' then
    select count(*) into image_count
    from public.comment_images ci
    join public.comments c on c.id = ci.comment_id
    where c.target_type = 'story'
      and c.target_id = target_key
      and c.author_id = new.owner_id;
  else
    select count(*) into image_count
    from public.comment_images
    where comment_id = new.comment_id;
  end if;

  if image_count >= 2 then
    raise exception 'Comment image limit exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_comment_image_quota on public.comment_images;
create trigger enforce_comment_image_quota
before insert on public.comment_images
for each row execute procedure public.enforce_comment_image_quota();

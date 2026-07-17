-- Run once in Supabase SQL Editor.
-- Prevents orphan comments and removes story-linked comments/notifications
-- when a story is deleted.

create or replace function public.validate_comment_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_target public.comment_target;
  parent_target_id text;
begin
  if new.target_type = 'wall' then
    if new.target_id <> 'wall' then
      raise exception 'Invalid wall comment target';
    end if;
  elsif new.target_type = 'story' then
    perform 1 from public.stories
    where id::text = new.target_id and is_published;
    if not found then
      raise exception 'Story comment target does not exist or is not published';
    end if;
  elsif new.target_type = 'province' then
    perform 1 from public.provinces
    where name = new.target_id and status = 'visited';
    if not found then
      raise exception 'Province comment target is not available';
    end if;
  elsif new.target_type = 'plan' then
    perform 1 from public.provinces
    where name = new.target_id and status = 'planned';
    if not found then
      raise exception 'Plan comment target is not available';
    end if;
  end if;

  if new.parent_id is not null then
    select target_type, target_id
    into parent_target, parent_target_id
    from public.comments
    where id = new.parent_id;

    if not found
      or parent_target is distinct from new.target_type
      or parent_target_id is distinct from new.target_id then
      raise exception 'Reply target must match the parent comment';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_comment_target_before_write on public.comments;
create trigger validate_comment_target_before_write
before insert or update of target_type, target_id, parent_id on public.comments
for each row execute procedure public.validate_comment_target();

create or replace function public.cleanup_deleted_story_relations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.comments
  where target_type = 'story' and target_id = old.id::text;

  delete from public.notifications
  where target_url = '/story/' || old.id::text;

  return old;
end;
$$;

drop trigger if exists cleanup_story_relations_before_delete on public.stories;
create trigger cleanup_story_relations_before_delete
before delete on public.stories
for each row execute procedure public.cleanup_deleted_story_relations();

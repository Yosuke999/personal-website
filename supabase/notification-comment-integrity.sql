-- Run once in Supabase SQL Editor.
-- Links comment/reply notifications to their source comment so deletion cascades.

alter table public.notifications
add column if not exists comment_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_comment_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
    add constraint notifications_comment_id_fkey
    foreign key (comment_id)
    references public.comments(id)
    on delete cascade;
  end if;
end;
$$;

create index if not exists notifications_comment_id_idx
on public.notifications(comment_id);

-- Legacy comment notifications cannot be safely linked after their source
-- comments were deleted. Remove them once during this migration.
delete from public.notifications
where kind in ('comment', 'reply')
  and comment_id is null;

create or replace function public.create_comment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  recipient uuid;
  destination text;
begin
  select display_name into actor_name
  from public.profiles
  where id = new.author_id;

  destination := case new.target_type
    when 'story' then '/story/' || new.target_id
    when 'wall' then '/wall'
    else '/province/' || new.target_id
  end;

  if new.parent_id is not null then
    select author_id into recipient
    from public.comments
    where id = new.parent_id;

    if recipient is not null and recipient <> new.author_id then
      insert into public.notifications(
        recipient_id,
        actor_id,
        kind,
        target_url,
        message,
        comment_id
      )
      values(
        recipient,
        new.author_id,
        'reply',
        destination,
        actor_name || ' 回复了你的留言',
        new.id
      );
    end if;
  else
    insert into public.notifications(
      recipient_id,
      actor_id,
      kind,
      target_url,
      message,
      comment_id
    )
    select
      id,
      new.author_id,
      'comment',
      destination,
      actor_name || ' 发表了新留言',
      new.id
    from public.profiles
    where role = 'admin'
      and not is_blocked
      and id <> new.author_id;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_after_comment on public.comments;
create trigger notify_after_comment
after insert on public.comments
for each row execute procedure public.create_comment_notifications();

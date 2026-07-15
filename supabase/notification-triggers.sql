-- Run once in Supabase SQL Editor.
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
  select display_name into actor_name from public.profiles where id = new.author_id;
  destination := case new.target_type
    when 'story' then '/story/' || new.target_id
    when 'wall' then '/wall'
    else '/province/' || new.target_id
  end;

  if new.parent_id is not null then
    select author_id into recipient from public.comments where id = new.parent_id;
    if recipient is not null and recipient <> new.author_id then
      insert into public.notifications(recipient_id, actor_id, kind, target_url, message)
      values(recipient, new.author_id, 'reply', destination, actor_name || ' 回复了你的留言');
    end if;
  else
    insert into public.notifications(recipient_id, actor_id, kind, target_url, message)
    select id, new.author_id, 'comment', destination, actor_name || ' 发表了新留言'
    from public.profiles
    where role = 'admin' and not is_blocked and id <> new.author_id;
  end if;
  return new;
end;
$$;

create or replace function public.create_like_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor_name text;
begin
  select display_name into actor_name from public.profiles where id = new.user_id;
  insert into public.notifications(recipient_id, actor_id, kind, target_url, message)
  select id, new.user_id, 'like', '/story/' || new.story_id, actor_name || ' 喜欢了你的旅行故事'
  from public.profiles
  where role = 'admin' and not is_blocked and id <> new.user_id;
  return new;
end;
$$;

drop trigger if exists notify_after_comment on public.comments;
create trigger notify_after_comment after insert on public.comments
for each row execute procedure public.create_comment_notifications();

drop trigger if exists notify_after_like on public.story_likes;
create trigger notify_after_like after insert on public.story_likes
for each row execute procedure public.create_like_notifications();

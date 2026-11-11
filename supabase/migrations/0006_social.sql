-- Social: friends, direct messages, a feed with photos, blocks and reports.

create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated;

-- ---------- tables ----------
create table public.blocks (
  blocker uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index blocks_blocked_idx on public.blocks (blocked);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index friendships_pair_idx on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_requester_idx on public.friendships (requester);
create index friendships_addressee_idx on public.friendships (addressee);

create table public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  started_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  a_read_at timestamptz,
  b_read_at timestamptz,
  last_at timestamptz not null default now(),
  last_body text not null default '',
  last_sender uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index dm_threads_b_idx on public.dm_threads (user_b);
create index dm_threads_started_idx on public.dm_threads (started_by);
create index dm_threads_sender_idx on public.dm_threads (last_sender);

create table public.dm_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  game_id uuid references public.games(id) on delete set null,
  created_at timestamptz not null default now()
);
create index dm_messages_thread_idx on public.dm_messages (thread_id, id desc);
create index dm_messages_sender_idx on public.dm_messages (sender_id, created_at desc);
create index dm_messages_game_idx on public.dm_messages (game_id);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 1000),
  photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  sport text references public.sports(id),
  place text check (place is null or char_length(place) <= 80),
  visibility text not null default 'public' check (visibility in ('public', 'friends')),
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or photo_path is not null)
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);
create index posts_sport_idx on public.posts (sport);
create unique index posts_photo_idx on public.posts (photo_path) where photo_path is not null;

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  player_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, player_id)
);
create index post_likes_player_idx on public.post_likes (player_id);

create table public.post_comments (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, id);
create index post_comments_author_idx on public.post_comments (author_id);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'user', 'message')),
  target_id text not null check (char_length(target_id) <= 64),
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now()
);
create index reports_reporter_idx on public.reports (reporter);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('ping','community','join','spot','result','league','booking','message','friend','feed'));
alter table public.notifications
  add column thread_id uuid references public.dm_threads(id) on delete cascade,
  add column post_id uuid references public.posts(id) on delete cascade;
create index notifications_thread_idx on public.notifications (thread_id);
create index notifications_post_idx on public.notifications (post_id);
create unique index notifications_msg_idx on public.notifications (player_id, thread_id) where kind = 'message' and read_at is null;
create unique index notifications_feed_idx on public.notifications (player_id, post_id) where kind = 'feed' and read_at is null;

-- ---------- helpers for policies (own schema, not exposed through the API) ----------
create function app.is_blocked(a uuid, b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) in (a, b) and exists (select 1 from public.blocks x where (x.blocker = a and x.blocked = b) or (x.blocker = b and x.blocked = a));
$$;
create function app.is_friend(a uuid, b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) in (a, b) and exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)));
$$;
revoke all on function app.is_blocked(uuid, uuid), app.is_friend(uuid, uuid) from public, anon;
grant execute on function app.is_blocked(uuid, uuid), app.is_friend(uuid, uuid) to authenticated;

-- ---------- access ----------
alter table public.blocks enable row level security;
alter table public.friendships enable row level security;
alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.reports enable row level security;
revoke all on public.blocks, public.friendships, public.dm_threads, public.dm_messages, public.posts, public.post_likes, public.post_comments, public.reports from anon, authenticated;

grant select, delete on public.blocks to authenticated;
grant insert (blocked) on public.blocks to authenticated;
grant select, delete on public.friendships to authenticated;
grant insert (addressee) on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;
grant select on public.dm_threads to authenticated;
grant insert (user_a, user_b) on public.dm_threads to authenticated;
grant update (a_read_at, b_read_at) on public.dm_threads to authenticated;
grant select on public.dm_messages to authenticated;
grant insert (thread_id, body, game_id) on public.dm_messages to authenticated;
grant select, delete on public.posts to authenticated;
grant insert (body, photo_path, sport, place, visibility) on public.posts to authenticated;
grant select, delete on public.post_likes to authenticated;
grant insert (post_id) on public.post_likes to authenticated;
grant select, delete on public.post_comments to authenticated;
grant insert (post_id, body) on public.post_comments to authenticated;
grant insert (target_type, target_id, reason) on public.reports to authenticated;

create policy "see own blocks" on public.blocks for select to authenticated using ((select auth.uid()) = blocker);
create policy "block someone" on public.blocks for insert to authenticated with check ((select auth.uid()) = blocker);
create policy "unblock" on public.blocks for delete to authenticated using ((select auth.uid()) = blocker);

create policy "see own friendships" on public.friendships for select to authenticated using ((select auth.uid()) in (requester, addressee));
create policy "ask to be friends" on public.friendships for insert to authenticated
  with check ((select auth.uid()) = requester and status = 'pending' and not app.is_blocked(requester, addressee));
create policy "accept a request" on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee and status = 'pending') with check ((select auth.uid()) = addressee);
create policy "end or cancel" on public.friendships for delete to authenticated using ((select auth.uid()) in (requester, addressee));

create policy "see own threads" on public.dm_threads for select to authenticated using ((select auth.uid()) in (user_a, user_b));
create policy "start a thread" on public.dm_threads for insert to authenticated
  with check ((select auth.uid()) in (user_a, user_b) and not app.is_blocked(user_a, user_b));
create policy "mark read" on public.dm_threads for update to authenticated
  using ((select auth.uid()) in (user_a, user_b)) with check ((select auth.uid()) in (user_a, user_b));

create policy "read thread messages" on public.dm_messages for select to authenticated
  using (exists (select 1 from public.dm_threads t where t.id = thread_id and (select auth.uid()) in (t.user_a, t.user_b)));
create policy "send a message" on public.dm_messages for insert to authenticated
  with check ((select auth.uid()) = sender_id and exists (select 1 from public.dm_threads t where t.id = thread_id and (select auth.uid()) in (t.user_a, t.user_b) and not app.is_blocked(t.user_a, t.user_b)));

create policy "see posts" on public.posts for select to authenticated
  using ((select auth.uid()) = author_id or (not app.is_blocked(author_id, (select auth.uid())) and (visibility = 'public' or app.is_friend(author_id, (select auth.uid())))));
create policy "write a post" on public.posts for insert to authenticated
  with check ((select auth.uid()) = author_id and (photo_path is null or photo_path like (select auth.uid())::text || '/%'));
create policy "delete own post" on public.posts for delete to authenticated using ((select auth.uid()) = author_id);

create policy "see likes" on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
create policy "like a post" on public.post_likes for insert to authenticated
  with check ((select auth.uid()) = player_id and exists (select 1 from public.posts p where p.id = post_id));
create policy "unlike" on public.post_likes for delete to authenticated using ((select auth.uid()) = player_id);

create policy "see comments" on public.post_comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id) and not app.is_blocked(author_id, (select auth.uid())));
create policy "comment" on public.post_comments for insert to authenticated
  with check ((select auth.uid()) = author_id and exists (select 1 from public.posts p where p.id = post_id));
create policy "delete a comment" on public.post_comments for delete to authenticated
  using ((select auth.uid()) = author_id or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

create policy "file a report" on public.reports for insert to authenticated with check ((select auth.uid()) = reporter);

-- ---------- logic ----------
create function private.friend_before_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.friendships where requester = new.requester and status = 'pending') >= 40 then
    raise exception 'You have too many pending friend requests';
  end if;
  return new;
end $$;
create trigger friend_before_insert before insert on public.friendships for each row execute function private.friend_before_insert();

create function private.friend_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'accepted' and auth.uid() = old.addressee then
    new.requester := old.requester; new.addressee := old.addressee;
    return new;
  end if;
  raise exception 'Only the person who was asked can accept';
end $$;
create trigger friend_guard before update on public.friendships for each row execute function private.friend_guard();

create function private.friend_notify() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (player_id, kind, body) values (new.addressee, 'friend', private.first_name(new.requester) || ' wants to be friends');
  elsif new.status = 'accepted' and old.status = 'pending' then
    insert into public.notifications (player_id, kind, body) values (new.requester, 'friend', private.first_name(new.addressee) || ' accepted your friend request');
  end if;
  return null;
end $$;
create trigger friend_notify after insert or update on public.friendships for each row execute function private.friend_notify();

create function private.block_cleanup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships where (requester = new.blocker and addressee = new.blocked) or (requester = new.blocked and addressee = new.blocker);
  return null;
end $$;
create trigger block_cleanup after insert on public.blocks for each row execute function private.block_cleanup();

create function private.thread_before_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.dm_threads where started_by = new.started_by and created_at > now() - interval '1 day') >= 15 then
    raise exception 'You have started a lot of conversations today. Try again tomorrow';
  end if;
  return new;
end $$;
create trigger thread_before_insert before insert on public.dm_threads for each row execute function private.thread_before_insert();

create function private.thread_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = old.user_a and auth.uid() is distinct from old.user_b then new.b_read_at := old.b_read_at;
  elsif auth.uid() = old.user_b then new.a_read_at := old.a_read_at;
  end if;
  return new;
end $$;
create trigger thread_guard before update on public.dm_threads for each row when (auth.uid() is not null) execute function private.thread_guard();

create function private.message_before_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.dm_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Slow down a little';
  end if;
  return new;
end $$;
create trigger message_before_insert before insert on public.dm_messages for each row execute function private.message_before_insert();

create function private.message_after_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.dm_threads; other uuid;
begin
  select * into t from public.dm_threads where id = new.thread_id;
  other := case when t.user_a = new.sender_id then t.user_b else t.user_a end;
  update public.dm_threads set last_at = new.created_at, last_body = left(new.body, 120), last_sender = new.sender_id,
    a_read_at = case when user_a = new.sender_id then new.created_at else a_read_at end,
    b_read_at = case when user_b = new.sender_id then new.created_at else b_read_at end
  where id = new.thread_id;
  insert into public.notifications (player_id, kind, body, thread_id)
  values (other, 'message', private.first_name(new.sender_id) || ': ' || left(new.body, 80), new.thread_id)
  on conflict do nothing;
  return null;
end $$;
create trigger message_after_insert after insert on public.dm_messages for each row execute function private.message_after_insert();

create function private.post_before_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.posts where author_id = new.author_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That is a lot of posts for one day';
  end if;
  return new;
end $$;
create trigger post_before_insert before insert on public.posts for each row execute function private.post_before_insert();

create function private.comment_after_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
  select author_id into a from public.posts where id = new.post_id;
  if a is not null and a <> new.author_id then
    insert into public.notifications (player_id, kind, body, post_id)
    values (a, 'feed', private.first_name(new.author_id) || ' commented on your post: ' || left(new.body, 60), new.post_id)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger comment_after_insert after insert on public.post_comments for each row execute function private.comment_after_insert();

alter publication supabase_realtime add table public.friendships, public.dm_threads, public.dm_messages, public.posts, public.post_likes, public.post_comments;

-- The Wire: core schema. Sport-agnostic: nothing here names a specific sport except the seed rows.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------- tables ----------
create table public.sports (
  id text primary key,
  name text not null,
  short text not null,
  size smallint not null check (size between 2 and 30),
  levels text[] not null,
  enabled boolean not null default false,
  sort smallint not null default 0
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  level smallint not null default 1 check (level between 0 and 3),
  area text not null default 'Lexington' check (char_length(area) <= 60),
  lat double precision not null default 42.447 check (lat between -90 and 90),
  lng double precision not null default -71.225 check (lng between -180 and 180),
  sports text[] not null default '{paddle}',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- private to the player: never readable by anyone else
create table public.player_settings (
  id uuid primary key references public.profiles(id) on delete cascade,
  age_band smallint not null default 1 check (age_band between 0 and 3),
  days smallint[] not null default '{0,1,2,3,4,5,6}',
  radius smallint not null default 15 check (radius between 1 and 100),
  updated_at timestamptz not null default now()
);

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  type text not null check (type in ('club','league','pickup')),
  area text not null check (char_length(area) <= 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  sports text[] not null default '{paddle}',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index communities_created_by_idx on public.communities (created_by);

create table public.memberships (
  community_id uuid not null references public.communities(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, player_id)
);
create index memberships_player_idx on public.memberships (player_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  sport text not null references public.sports(id),
  host_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  place text not null check (char_length(place) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  starts_at timestamptz not null,
  duration_min smallint not null default 90 check (duration_min between 30 and 240),
  spots smallint not null check (spots between 2 and 30),
  level_min smallint not null default 0 check (level_min between 0 and 3),
  level_max smallint not null default 3 check (level_max between 0 and 3),
  kind text not null check (kind in ('broadcast','scheduled')),
  note text not null default '' check (char_length(note) <= 500),
  recurring text check (recurring is null or recurring = 'weekly'),
  age_band smallint check (age_band is null or age_band between 0 and 3),
  created_at timestamptz not null default now(),
  check (level_min <= level_max)
);
create index games_starts_idx on public.games (starts_at);
create index games_host_idx on public.games (host_id);
create index games_community_idx on public.games (community_id);
create index games_sport_idx on public.games (sport);

create table public.rsvps (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('in','maybe','out')),
  reason text check (reason is null or char_length(reason) <= 40),
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index rsvps_player_idx on public.rsvps (player_id);

create table public.messages (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 500),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_game_idx on public.messages (game_id);
create index messages_player_idx on public.messages (player_id);

create table public.watchers (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  primary key (game_id, player_id)
);
create index watchers_player_idx on public.watchers (player_id);

create table public.notifications (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid references public.games(id) on delete cascade,
  kind text not null check (kind in ('ping','community','join','spot')),
  wave smallint,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index notifications_player_idx on public.notifications (player_id, created_at desc);
create index notifications_game_idx on public.notifications (game_id);
create index notifications_unpushed_idx on public.notifications (id) where pushed_at is null;
create unique index notifications_once_idx on public.notifications (player_id, game_id, kind) where kind in ('ping','community');

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_player_idx on public.push_subscriptions (player_id);

-- ---------- access ----------
alter table public.sports enable row level security;
alter table public.profiles enable row level security;
alter table public.player_settings enable row level security;
alter table public.communities enable row level security;
alter table public.memberships enable row level security;
alter table public.games enable row level security;
alter table public.rsvps enable row level security;
alter table public.messages enable row level security;
alter table public.watchers enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.sports to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.player_settings to authenticated;
grant select, insert, update on public.communities to authenticated;
grant select, insert, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.games to authenticated;
grant select, insert, update on public.rsvps to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, delete on public.watchers to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- signed-in players can see the shared directory (sports, players, communities, games)
create policy "read sports" on public.sports for select to authenticated using (true);

create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "insert own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "read own settings" on public.player_settings for select to authenticated using ((select auth.uid()) = id);
create policy "insert own settings" on public.player_settings for insert to authenticated with check ((select auth.uid()) = id);
create policy "update own settings" on public.player_settings for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "read communities" on public.communities for select to authenticated using (true);
create policy "create community" on public.communities for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "edit own community" on public.communities for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);

create policy "read memberships" on public.memberships for select to authenticated using (true);
create policy "join community" on public.memberships for insert to authenticated with check ((select auth.uid()) = player_id);
create policy "leave community" on public.memberships for delete to authenticated using ((select auth.uid()) = player_id);

create policy "read games" on public.games for select to authenticated using (true);
create policy "host a game" on public.games for insert to authenticated with check ((select auth.uid()) = host_id);
create policy "edit own game" on public.games for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
create policy "cancel own game" on public.games for delete to authenticated using ((select auth.uid()) = host_id);

create policy "read rsvps" on public.rsvps for select to authenticated using (true);
create policy "rsvp as self" on public.rsvps for insert to authenticated with check ((select auth.uid()) = player_id);
create policy "change own rsvp" on public.rsvps for update to authenticated using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);

create policy "read messages" on public.messages for select to authenticated using (true);
create policy "post as self" on public.messages for insert to authenticated with check ((select auth.uid()) = player_id and not is_system);

create policy "read own watches" on public.watchers for select to authenticated using ((select auth.uid()) = player_id);
create policy "watch a game" on public.watchers for insert to authenticated with check ((select auth.uid()) = player_id);
create policy "stop watching" on public.watchers for delete to authenticated using ((select auth.uid()) = player_id);

-- players see their own alerts; a host can also see who was pinged for their game
create policy "read own alerts" on public.notifications for select to authenticated
  using ((select auth.uid()) = player_id or exists (select 1 from public.games g where g.id = game_id and g.host_id = (select auth.uid())));
create policy "mark own alerts read" on public.notifications for update to authenticated using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);

create policy "read own push subs" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = player_id);
create policy "add own push sub" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = player_id);
create policy "update own push sub" on public.push_subscriptions for update to authenticated using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);
create policy "remove own push sub" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = player_id);

-- ---------- logic (private schema: not reachable through the API) ----------
create function private.miles(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 3958.8 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

create function private.when_label(ts timestamptz) returns text language sql stable set search_path = '' as $$
  select case
    when (ts at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date then 'today'
    when (ts at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date + 1 then 'tomorrow'
    else to_char(ts at time zone 'America/New_York', 'Dy Mon FMDD') end
    || ' at ' || to_char(ts at time zone 'America/New_York', 'FMHH12:MI AM');
$$;

create function private.first_name(pid uuid) returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(split_part(trim(p.name), ' ', 1), ''), 'Someone') from public.profiles p where p.id = pid;
$$;

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 60)) on conflict do nothing;
  insert into public.player_settings (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- The matching rules. Safe to call repeatedly: each player is pinged at most once per game.
create function private.ping_game(gid uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare
  g public.games; open_spots int; n int;
  local_now timestamp := now() at time zone 'America/New_York';
  day_start timestamptz := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
begin
  select * into g from public.games where id = gid;
  if not found or g.kind <> 'broadcast' or g.starts_at <= now() then return 0; end if;
  select g.spots - count(*) into open_spots from public.rsvps r where r.game_id = gid and r.status = 'in';
  if open_spots <= 0 then return 0; end if;
  -- quiet hours 9 PM to 7 AM, unless the game starts within two hours
  if (extract(hour from local_now) >= 21 or extract(hour from local_now) < 7) and g.starts_at - now() > interval '2 hours' then return 0; end if;

  insert into public.notifications (player_id, game_id, kind, wave, body)
  select p.id, gid, 'ping', case when sh.shared then 1 else 2 end,
    private.first_name(g.host_id) || ' wants to play at ' || g.place || ' ' || private.when_label(g.starts_at) || '. ' || open_spots || case when open_spots = 1 then ' spot open.' else ' spots open.' end
  from public.profiles p
  join public.player_settings s on s.id = p.id
  cross join lateral (select exists (
    select 1 from public.memberships m1 join public.memberships m2 on m1.community_id = m2.community_id
    where m1.player_id = p.id and m2.player_id = g.host_id) as shared) sh
  where p.id <> g.host_id and p.onboarded
    and g.sport = any (p.sports)
    and private.miles(p.lat, p.lng, g.lat, g.lng) <= s.radius
    and greatest(p.level - 1, 0) <= g.level_max and least(p.level + 1, 3) >= g.level_min
    and extract(dow from g.starts_at at time zone 'America/New_York')::int = any (s.days)
    and (g.age_band is null or s.age_band = g.age_band)
    -- wave 1 is the host's communities; everyone else waits 15 minutes
    and (sh.shared or g.created_at <= now() - interval '15 minutes')
    and not exists (select 1 from public.rsvps r where r.game_id = gid and r.player_id = p.id)
    and not exists (select 1 from public.notifications x where x.game_id = gid and x.player_id = p.id and x.kind = 'ping')
    -- never more than 3 pings a day
    and (select count(*) from public.notifications x where x.player_id = p.id and x.kind = 'ping' and x.created_at >= day_start) < 3
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create function private.on_game_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rsvps (game_id, player_id, status) values (new.id, new.host_id, 'in') on conflict do nothing;
  if new.kind = 'broadcast' then
    perform private.ping_game(new.id);
  elsif new.community_id is not null then
    insert into public.notifications (player_id, game_id, kind, body)
    select m.player_id, new.id, 'community',
      private.first_name(new.host_id) || ' scheduled a game at ' || new.place || ' ' || private.when_label(new.starts_at) || '. Are you in?'
    from public.memberships m where m.community_id = new.community_id and m.player_id <> new.host_id
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_game_created after insert on public.games for each row execute function private.on_game_created();

create function private.before_rsvp() returns trigger language plpgsql security definer set search_path = '' as $$
declare g public.games; taken int;
begin
  select * into g from public.games where id = new.game_id;
  if not found then raise exception 'Game not found'; end if;
  if g.starts_at + g.duration_min * interval '1 minute' < now() then raise exception 'That game is over'; end if;
  new.updated_at := now();
  if new.status <> 'out' then new.reason := null; end if;
  if new.status = 'in' and (tg_op = 'INSERT' or old.status <> 'in') then
    perform pg_advisory_xact_lock(hashtextextended(new.game_id::text, 0));
    select count(*) into taken from public.rsvps r where r.game_id = new.game_id and r.status = 'in' and r.player_id <> new.player_id;
    if taken >= g.spots then raise exception 'That game is full'; end if;
  end if;
  return new;
end $$;
create trigger before_rsvp before insert or update on public.rsvps for each row execute function private.before_rsvp();

create function private.after_rsvp() returns trigger language plpgsql security definer set search_path = '' as $$
declare g public.games; who text := private.first_name(new.player_id); was text := case when tg_op = 'UPDATE' then old.status else null end;
begin
  select * into g from public.games where id = new.game_id;
  if new.status = 'in' and was is distinct from 'in' and new.player_id <> g.host_id then
    insert into public.notifications (player_id, game_id, kind, body) values (g.host_id, g.id, 'join', who || ' joined your game at ' || g.place);
  elsif new.status = 'out' and was = 'in' then
    insert into public.messages (game_id, player_id, body, is_system)
    values (g.id, null, who || ' dropped out' || coalesce(' (' || nullif(new.reason, '') || ')', ''), true);
    insert into public.notifications (player_id, game_id, kind, body)
    select w.player_id, g.id, 'spot', 'A spot opened at ' || g.place || ' ' || private.when_label(g.starts_at)
    from public.watchers w where w.game_id = g.id and w.player_id <> new.player_id;
    if new.player_id <> g.host_id then
      insert into public.notifications (player_id, game_id, kind, body) values (g.host_id, g.id, 'spot', who || ' dropped out of your game at ' || g.place);
    end if;
  end if;
  return new;
end $$;
create trigger after_rsvp after insert or update on public.rsvps for each row execute function private.after_rsvp();

-- hand new alerts to the push sender (best effort: an alert is never lost if push is down)
create function private.kick_push() returns trigger language plpgsql security definer set search_path = '' as $$
declare u text; s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_hook_secret';
  if u is not null and s is not null then
    perform net.http_post(url := u, headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', s), body := '{}'::jsonb);
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger kick_push after insert on public.notifications for each statement execute function private.kick_push();

-- every minute: later ping waves, and roll weekly games forward
create function private.run_pings() returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.games where kind = 'broadcast' and starts_at > now() and created_at > now() - interval '3 days' loop
    perform private.ping_game(r.id);
  end loop;

  with rolled as (
    update public.games set starts_at = ((starts_at at time zone 'America/New_York')
        + (floor(extract(epoch from (now() - starts_at)) / 604800) + 1) * interval '7 days') at time zone 'America/New_York'
    where recurring = 'weekly' and starts_at + duration_min * interval '1 minute' < now()
    returning id, host_id
  ), cleared as (
    delete from public.rsvps r using rolled where r.game_id = rolled.id and r.player_id <> rolled.host_id
  )
  delete from public.watchers w using rolled where w.game_id = rolled.id;
end $$;

-- used only by the push sender (service role)
create function public.push_config() returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_object_agg(name, decrypted_secret) from vault.decrypted_secrets where name in ('push_hook_secret', 'vapid_private_key', 'vapid_public_key');
$$;
revoke all on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

select cron.schedule('wire-pings', '* * * * *', 'select private.run_pings()');

alter publication supabase_realtime add table public.games, public.rsvps, public.messages, public.notifications, public.memberships;

insert into public.sports (id, name, short, size, levels, enabled, sort) values
  ('paddle', 'Paddle tennis', 'Paddle', 4, '{Beginner,Intermediate,Advanced,Open}', true, 1),
  ('pickleball', 'Pickleball', 'Pickleball', 4, '{Beginner,Intermediate,Advanced,Open}', false, 2),
  ('tennis', 'Tennis', 'Tennis', 2, '{Beginner,Intermediate,Advanced,Open}', false, 3);

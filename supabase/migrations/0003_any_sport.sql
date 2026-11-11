-- Any sport: per-sport levels, richer sport config, shared venues, faster same-day pings.

-- ---------- sport config ----------
alter table public.sports
  add column sizes smallint[] not null default '{2,4}',
  add column durations smallint[] not null default '{60,90,120}',
  add column duration_labels text[],
  add column place_word text not null default 'place';

alter table public.games drop constraint games_duration_min_check;
alter table public.games add constraint games_duration_min_check check (duration_min between 30 and 360);

-- ---------- one level per sport per player ----------
create table public.player_sports (
  player_id uuid not null references public.profiles(id) on delete cascade,
  sport_id text not null references public.sports(id),
  level smallint not null default 1 check (level between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (player_id, sport_id)
);
create index player_sports_sport_idx on public.player_sports (sport_id);

insert into public.player_sports (player_id, sport_id, level)
select p.id, s, p.level from public.profiles p, unnest(p.sports) s
where exists (select 1 from public.sports x where x.id = s)
on conflict do nothing;

alter table public.profiles drop column level, drop column sports;

alter table public.player_sports enable row level security;
grant select, insert, update, delete on public.player_sports to authenticated;
create policy "read player sports" on public.player_sports for select to authenticated using (true);
create policy "add own sport" on public.player_sports for insert to authenticated with check ((select auth.uid()) = player_id);
create policy "change own level" on public.player_sports for update to authenticated using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);
create policy "drop own sport" on public.player_sports for delete to authenticated using ((select auth.uid()) = player_id);

-- ---------- venues: courses, courts, fields ----------
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  sports text[] not null default '{}',
  area text not null check (char_length(area) <= 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  booking_url text check (booking_url is null or (booking_url ~ '^https://' and char_length(booking_url) <= 300)),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index venues_name_area_idx on public.venues (lower(name), area);
create index venues_created_by_idx on public.venues (created_by);

alter table public.games add column venue_id uuid references public.venues(id) on delete set null;
create index games_venue_idx on public.games (venue_id);

alter table public.venues enable row level security;
grant select, insert on public.venues to authenticated;
grant update (sports) on public.venues to authenticated;
create policy "read venues" on public.venues for select to authenticated using (true);
create policy "add a venue" on public.venues for insert to authenticated with check ((select auth.uid()) = created_by);
-- anyone can mark a venue as used for another sport, but only add to the list
create policy "tag venue sports" on public.venues for update to authenticated using (true) with check (true);

create function private.venue_sports_add_only() returns trigger language plpgsql set search_path = '' as $$
begin
  if not (new.sports @> old.sports) then raise exception 'Sports can only be added to a venue'; end if;
  return new;
end $$;
create trigger venue_sports_add_only before update on public.venues for each row execute function private.venue_sports_add_only();

-- ---------- the sports ----------
update public.sports set sizes = '{2,4}', place_word = 'court', enabled = true where id in ('paddle', 'pickleball', 'tennis');
update public.sports set sizes = '{2}' where id = 'tennis';
update public.sports set size = 2 where id = 'tennis';

insert into public.sports (id, name, short, size, levels, enabled, sort, sizes, durations, duration_labels, place_word) values
  ('golf', 'Golf', 'Golf', 4, '{"Just learning","Shoots 100+","Shoots 90s","Shoots 80s or better"}', true, 0, '{2,3,4}', '{120,270}', '{"9 holes","18 holes"}', 'course'),
  ('softball', 'Softball', 'Softball', 12, '{Beginner,Intermediate,Advanced,Open}', true, 4, '{8,10,12,14,18}', '{90,120}', null, 'field'),
  ('basketball', 'Basketball', 'Basketball', 10, '{Beginner,Intermediate,Advanced,Open}', true, 5, '{2,4,6,8,10}', '{60,90,120}', null, 'court'),
  ('soccer', 'Soccer', 'Soccer', 10, '{Beginner,Intermediate,Advanced,Open}', true, 6, '{6,8,10,12,14,22}', '{60,90}', null, 'field'),
  ('volleyball', 'Volleyball', 'Volleyball', 6, '{Beginner,Intermediate,Advanced,Open}', true, 7, '{4,6,8,12}', '{60,90,120}', null, 'court')
on conflict (id) do nothing;

-- ---------- matching: per-sport level, venue-aware, quicker second wave for same-day games ----------
create or replace function private.ping_game(gid uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare
  g public.games; sp public.sports; open_spots int; n int; delay interval;
  local_now timestamp := now() at time zone 'America/New_York';
  day_start timestamptz := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
begin
  select * into g from public.games where id = gid;
  if not found or g.kind <> 'broadcast' or g.starts_at <= now() then return 0; end if;
  select * into sp from public.sports where id = g.sport;
  select g.spots - count(*) into open_spots from public.rsvps r where r.game_id = gid and r.status = 'in';
  if open_spots <= 0 then return 0; end if;
  if (extract(hour from local_now) >= 21 or extract(hour from local_now) < 7) and g.starts_at - now() > interval '2 hours' then return 0; end if;
  -- a game starting within five hours cannot wait 15 minutes for its second wave
  delay := case when g.starts_at - g.created_at < interval '5 hours' then interval '3 minutes' else interval '15 minutes' end;

  insert into public.notifications (player_id, game_id, kind, wave, body)
  select p.id, gid, 'ping', case when sh.shared then 1 else 2 end,
    private.first_name(g.host_id) || ' wants to play ' || sp.short || ' at ' || g.place || ' ' || private.when_label(g.starts_at) || '. ' || open_spots || case when open_spots = 1 then ' spot open.' else ' spots open.' end
  from public.profiles p
  join public.player_settings s on s.id = p.id
  join public.player_sports ps on ps.player_id = p.id and ps.sport_id = g.sport
  cross join lateral (select exists (
    select 1 from public.memberships m1 join public.memberships m2 on m1.community_id = m2.community_id
    where m1.player_id = p.id and m2.player_id = g.host_id) as shared) sh
  where p.id <> g.host_id and p.onboarded
    and private.miles(p.lat, p.lng, g.lat, g.lng) <= s.radius
    and greatest(ps.level - 1, 0) <= g.level_max and least(ps.level + 1, 3) >= g.level_min
    and extract(dow from g.starts_at at time zone 'America/New_York')::int = any (s.days)
    and (g.age_band is null or s.age_band = g.age_band)
    and (sh.shared or g.created_at <= now() - delay)
    and not exists (select 1 from public.rsvps r where r.game_id = gid and r.player_id = p.id)
    and not exists (select 1 from public.notifications x where x.game_id = gid and x.player_id = p.id and x.kind = 'ping')
    and (select count(*) from public.notifications x where x.player_id = p.id and x.kind = 'ping' and x.created_at >= day_start) < 3
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

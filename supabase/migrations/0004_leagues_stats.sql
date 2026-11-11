-- Leagues, confirmed results, stats, golf rounds. Also closes a grant gap on venues / player_sports.

-- New tables must not inherit blanket grants for the API roles.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
revoke all on public.venues, public.player_sports from anon, authenticated;
grant select on public.venues to authenticated;
grant insert (name, sports, area, lat, lng, booking_url, created_by) on public.venues to authenticated;
grant update (sports, booking_url) on public.venues to authenticated;
grant select, insert, update, delete on public.player_sports to authenticated;

create or replace function private.venue_sports_add_only() returns trigger language plpgsql set search_path = '' as $$
begin
  if not (new.sports @> old.sports) then raise exception 'Sports can only be added to a venue'; end if;
  if new.booking_url is distinct from old.booking_url and auth.uid() is distinct from old.created_by then
    raise exception 'Only the person who added this place can change its link';
  end if;
  return new;
end $$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('ping','community','join','spot','result','league','booking'));

-- ---------- leagues ----------
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  sport text not null references public.sports(id),
  area text not null check (char_length(area) <= 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  description text not null default '' check (char_length(description) <= 500),
  mode text not null default 'teams' check (mode in ('teams','solo')),
  win_pts smallint not null default 2 check (win_pts between 0 and 10),
  tie_pts smallint not null default 1 check (tie_pts between 0 and 10),
  status text not null default 'open' check (status in ('open','active','done')),
  commissioner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index leagues_commissioner_idx on public.leagues (commissioner_id);
create index leagues_sport_idx on public.leagues (sport);

create table public.league_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  captain_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index league_teams_name_idx on public.league_teams (league_id, lower(name));
create index league_teams_captain_idx on public.league_teams (captain_id);

create table public.team_members (
  team_id uuid not null references public.league_teams(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id)
);
create unique index team_members_one_team_idx on public.team_members (league_id, player_id);
create index team_members_player_idx on public.team_members (player_id);

alter table public.games add column league_id uuid references public.leagues(id) on delete cascade;
create index games_league_idx on public.games (league_id);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  home_team uuid not null references public.league_teams(id) on delete cascade,
  away_team uuid not null references public.league_teams(id) on delete cascade,
  starts_at timestamptz not null,
  place text not null check (char_length(place) between 1 and 80),
  game_id uuid references public.games(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','pending','confirmed','disputed')),
  home_score smallint check (home_score between 0 and 999),
  away_score smallint check (away_score between 0 and 999),
  reported_by uuid references public.profiles(id) on delete set null,
  reported_side text check (reported_side in ('home','away')),
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (home_team <> away_team)
);
create index fixtures_league_idx on public.fixtures (league_id, starts_at);
create index fixtures_home_idx on public.fixtures (home_team);
create index fixtures_away_idx on public.fixtures (away_team);
create index fixtures_game_idx on public.fixtures (game_id);
create index fixtures_reported_idx on public.fixtures (reported_by);
create index fixtures_confirmed_idx on public.fixtures (confirmed_by);

-- results for casual games (no league needed): one side reports, the other side confirms
create table public.game_results (
  game_id uuid primary key references public.games(id) on delete cascade,
  side_a uuid[] not null check (cardinality(side_a) between 1 and 15),
  side_b uuid[] not null check (cardinality(side_b) between 1 and 15),
  score_a smallint not null check (score_a between 0 and 999),
  score_b smallint not null check (score_b between 0 and 999),
  status text not null default 'pending' check (status in ('pending','confirmed','disputed')),
  reported_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index game_results_reported_idx on public.game_results (reported_by);
create index game_results_confirmed_idx on public.game_results (confirmed_by);

-- golf (and any stroke sport): a round you played, optionally vouched for by someone in the same game
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  sport text not null default 'golf' references public.sports(id),
  game_id uuid references public.games(id) on delete set null,
  venue_name text check (venue_name is null or char_length(venue_name) <= 80),
  played_on date not null,
  holes smallint not null check (holes in (9, 18)),
  strokes smallint not null check (strokes between 9 and 250),
  attested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index rounds_player_idx on public.rounds (player_id, played_on desc);
create index rounds_game_idx on public.rounds (game_id);
create index rounds_attested_idx on public.rounds (attested_by);
create index rounds_sport_idx on public.rounds (sport);

-- ---------- access ----------
alter table public.leagues enable row level security;
alter table public.league_teams enable row level security;
alter table public.team_members enable row level security;
alter table public.fixtures enable row level security;
alter table public.game_results enable row level security;
alter table public.rounds enable row level security;

revoke all on public.leagues, public.league_teams, public.team_members, public.fixtures, public.game_results, public.rounds from anon, authenticated;
grant select, insert, delete on public.leagues to authenticated;
grant update (name, description, status, win_pts, tie_pts) on public.leagues to authenticated;
grant select, delete on public.league_teams to authenticated;
grant insert (league_id, name, captain_id) on public.league_teams to authenticated;
grant update (name) on public.league_teams to authenticated;
grant select, delete on public.team_members to authenticated;
grant insert (team_id, player_id) on public.team_members to authenticated;
grant select, delete on public.fixtures to authenticated;
grant insert (league_id, home_team, away_team, starts_at, place) on public.fixtures to authenticated;
grant update (starts_at, place, home_score, away_score, status) on public.fixtures to authenticated;
grant select, delete on public.game_results to authenticated;
grant insert (game_id, side_a, side_b, score_a, score_b) on public.game_results to authenticated;
grant update (status) on public.game_results to authenticated;
grant select, delete on public.rounds to authenticated;
grant insert (sport, game_id, venue_name, played_on, holes, strokes) on public.rounds to authenticated;
grant update (attested_by) on public.rounds to authenticated;

create policy "read leagues" on public.leagues for select to authenticated using (true);
create policy "start a league" on public.leagues for insert to authenticated with check ((select auth.uid()) = commissioner_id);
create policy "run own league" on public.leagues for update to authenticated using ((select auth.uid()) = commissioner_id) with check ((select auth.uid()) = commissioner_id);
create policy "delete own league" on public.leagues for delete to authenticated using ((select auth.uid()) = commissioner_id);

create policy "read teams" on public.league_teams for select to authenticated using (true);
create policy "create team" on public.league_teams for insert to authenticated
  with check ((select auth.uid()) = captain_id and exists (select 1 from public.leagues l where l.id = league_id and (l.status = 'open' or l.commissioner_id = (select auth.uid()))));
create policy "rename team" on public.league_teams for update to authenticated
  using ((select auth.uid()) = captain_id or exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid())))
  with check ((select auth.uid()) = captain_id or exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid())));
create policy "remove team" on public.league_teams for delete to authenticated
  using ((select auth.uid()) = captain_id or exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid())));

create policy "read members" on public.team_members for select to authenticated using (true);
create policy "join a team" on public.team_members for insert to authenticated
  with check (
    ((select auth.uid()) = player_id and exists (select 1 from public.leagues l where l.id = league_id and (l.status = 'open' or l.commissioner_id = (select auth.uid()))))
    or exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid())));
create policy "leave or remove" on public.team_members for delete to authenticated
  using ((select auth.uid()) = player_id
    or exists (select 1 from public.league_teams t where t.id = team_id and t.captain_id = (select auth.uid()))
    or exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid())));

create policy "read fixtures" on public.fixtures for select to authenticated using (true);
create policy "schedule fixtures" on public.fixtures for insert to authenticated
  with check (exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid())));
create policy "report or confirm" on public.fixtures for update to authenticated
  using (exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid()))
    or exists (select 1 from public.team_members tm where tm.player_id = (select auth.uid()) and tm.team_id in (home_team, away_team)))
  with check (exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid()))
    or exists (select 1 from public.team_members tm where tm.player_id = (select auth.uid()) and tm.team_id in (home_team, away_team)));
create policy "remove fixtures" on public.fixtures for delete to authenticated
  using (exists (select 1 from public.leagues l where l.id = league_id and l.commissioner_id = (select auth.uid())));

create policy "read results" on public.game_results for select to authenticated using (true);
create policy "report a result" on public.game_results for insert to authenticated with check ((select auth.uid()) = reported_by);
create policy "settle a result" on public.game_results for update to authenticated
  using ((select auth.uid()) = any (side_a) or (select auth.uid()) = any (side_b))
  with check ((select auth.uid()) = any (side_a) or (select auth.uid()) = any (side_b));
create policy "retract own result" on public.game_results for delete to authenticated using ((select auth.uid()) = reported_by and status <> 'confirmed');

create policy "read rounds" on public.rounds for select to authenticated using (true);
create policy "log own round" on public.rounds for insert to authenticated with check ((select auth.uid()) = player_id);
create policy "vouch for a round" on public.rounds for update to authenticated
  using (game_id is not null and player_id <> (select auth.uid()) and exists (select 1 from public.rsvps r where r.game_id = rounds.game_id and r.player_id = (select auth.uid()) and r.status = 'in'))
  with check (attested_by = (select auth.uid()) or attested_by is null);
create policy "delete own round" on public.rounds for delete to authenticated using ((select auth.uid()) = player_id);

-- ---------- logic ----------
create or replace function private.on_game_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.league_id is not null then return new; end if;
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

create or replace function private.before_rsvp() returns trigger language plpgsql security definer set search_path = '' as $$
declare g public.games; taken int;
begin
  select * into g from public.games where id = new.game_id;
  if not found then raise exception 'Game not found'; end if;
  if g.starts_at + g.duration_min * interval '1 minute' < now() then raise exception 'That game is over'; end if;
  if g.league_id is not null
     and not exists (select 1 from public.team_members tm where tm.league_id = g.league_id and tm.player_id = new.player_id)
     and not exists (select 1 from public.leagues l where l.id = g.league_id and l.commissioner_id = new.player_id) then
    raise exception 'Only league members can respond to this game';
  end if;
  new.updated_at := now();
  if new.status <> 'out' then new.reason := null; end if;
  if new.status = 'in' and (tg_op = 'INSERT' or old.status <> 'in') then
    perform pg_advisory_xact_lock(hashtextextended(new.game_id::text, 0));
    select count(*) into taken from public.rsvps r where r.game_id = new.game_id and r.status = 'in' and r.player_id <> new.player_id;
    if taken >= g.spots then raise exception 'That game is full'; end if;
  end if;
  return new;
end $$;

create function private.member_fix() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select t.league_id into new.league_id from public.league_teams t where t.id = new.team_id;
  if new.league_id is null then raise exception 'Team not found'; end if;
  return new;
end $$;
create trigger member_fix before insert on public.team_members for each row execute function private.member_fix();

create function private.fixture_side(fid uuid, pid uuid) returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.fixtures f join public.team_members tm on tm.team_id = f.home_team where f.id = fid and tm.player_id = pid) then 'home'
    when exists (select 1 from public.fixtures f join public.team_members tm on tm.team_id = f.away_team where f.id = fid and tm.player_id = pid) then 'away'
  end;
$$;

create function private.fixture_before_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.league_teams t where t.league_id = new.league_id and t.id in (new.home_team, new.away_team)) <> 2 then
    raise exception 'Both teams must be in this league';
  end if;
  return new;
end $$;
create trigger fixture_before_insert before insert on public.fixtures for each row execute function private.fixture_before_insert();

create function private.fixture_after_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare l public.leagues; s public.sports; gid uuid; n int; h text; a text; dur int;
begin
  select * into l from public.leagues where id = new.league_id;
  select * into s from public.sports where id = l.sport;
  select name into h from public.league_teams where id = new.home_team;
  select name into a from public.league_teams where id = new.away_team;
  select count(*) into n from public.team_members where team_id in (new.home_team, new.away_team);
  dur := case when 90 = any (s.durations) then 90 else s.durations[array_length(s.durations, 1)] end;
  insert into public.games (sport, host_id, place, lat, lng, starts_at, duration_min, spots, kind, league_id, note)
  values (l.sport, l.commissioner_id, new.place, l.lat, l.lng, new.starts_at, dur, least(30, greatest(2, n)), 'scheduled', l.id, left(l.name || ': ' || h || ' vs ' || a, 500))
  returning id into gid;
  update public.fixtures set game_id = gid where id = new.id;
  insert into public.notifications (player_id, game_id, kind, body)
  select tm.player_id, gid, 'league', h || ' vs ' || a || ' at ' || new.place || ' ' || private.when_label(new.starts_at) || '. Are you in?'
  from public.team_members tm where tm.team_id in (new.home_team, new.away_team)
  on conflict do nothing;
  return null;
end $$;
create trigger fixture_after_insert after insert on public.fixtures for each row execute function private.fixture_after_insert();

create function private.fixture_after_delete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.game_id is not null then delete from public.games where id = old.game_id; end if;
  return null;
end $$;
create trigger fixture_after_delete after delete on public.fixtures for each row execute function private.fixture_after_delete();

create function private.fixture_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); is_c boolean; side text;
begin
  select coalesce(l.commissioner_id = me, false) into is_c from public.leagues l where l.id = new.league_id;
  if (new.starts_at is distinct from old.starts_at or new.place is distinct from old.place) and not is_c then
    raise exception 'Only the commissioner can change the schedule';
  end if;
  if new.home_score is distinct from old.home_score or new.away_score is distinct from old.away_score or new.status is distinct from old.status then
    side := private.fixture_side(old.id, me);
    if not is_c and side is null then raise exception 'You are not part of this game'; end if;
    if new.status in ('pending', 'confirmed') and (new.home_score is null or new.away_score is null) then raise exception 'Enter both scores'; end if;
    if new.status = 'scheduled' then
      if not is_c then raise exception 'Only the commissioner can clear a result'; end if;
      new.home_score := null; new.away_score := null; new.reported_by := null; new.reported_side := null; new.confirmed_by := null;
    elsif new.status = 'pending' then
      if old.status = 'confirmed' and not is_c then raise exception 'That result is already confirmed'; end if;
      new.reported_by := me; new.reported_side := side; new.confirmed_by := null;
    else
      if is_c then
        new.confirmed_by := me;
        if new.reported_by is null then new.reported_by := me; end if;
      else
        if old.status <> 'pending' then raise exception 'There is nothing to confirm'; end if;
        if side = old.reported_side then raise exception 'The other team has to confirm'; end if;
        if new.home_score is distinct from old.home_score or new.away_score is distinct from old.away_score then
          raise exception 'Scores cannot change while confirming';
        end if;
        new.confirmed_by := me;
      end if;
      if new.status = 'disputed' then new.confirmed_by := null; end if;
    end if;
  end if;
  return new;
end $$;
create trigger fixture_guard before update on public.fixtures for each row execute function private.fixture_guard();

create function private.fixture_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare l public.leagues; h text; a text;
begin
  if new.status = old.status and new.home_score is not distinct from old.home_score and new.away_score is not distinct from old.away_score then return null; end if;
  select * into l from public.leagues where id = new.league_id;
  select name into h from public.league_teams where id = new.home_team;
  select name into a from public.league_teams where id = new.away_team;
  if new.status = 'pending' then
    insert into public.notifications (player_id, game_id, kind, body)
    select tm.player_id, new.game_id, 'result', private.first_name(new.reported_by) || ' reported ' || h || ' ' || new.home_score || ', ' || a || ' ' || new.away_score || '. Confirm it?'
    from public.team_members tm
    where tm.team_id in (new.home_team, new.away_team) and tm.player_id <> new.reported_by
      and (new.reported_side is null or tm.team_id = (case new.reported_side when 'home' then new.away_team else new.home_team end));
  elsif new.status = 'disputed' then
    insert into public.notifications (player_id, game_id, kind, body)
    select distinct x, new.game_id, 'result', 'The result for ' || h || ' vs ' || a || ' was disputed.'
    from unnest(array[l.commissioner_id, new.reported_by]) x where x is not null;
  elsif new.status = 'confirmed' and new.reported_by is not null and new.reported_by is distinct from new.confirmed_by then
    insert into public.notifications (player_id, game_id, kind, body)
    values (new.reported_by, new.game_id, 'result', 'Confirmed: ' || h || ' ' || new.home_score || ', ' || a || ' ' || new.away_score);
  end if;
  return null;
end $$;
create trigger fixture_notify after update on public.fixtures for each row execute function private.fixture_notify();

create function private.result_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare g public.games; me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    select * into g from public.games where id = new.game_id;
    if not found then raise exception 'Game not found'; end if;
    if g.league_id is not null then raise exception 'League games are scored from the league page'; end if;
    if g.starts_at > now() then raise exception 'The game has not started yet'; end if;
    if not (me = any (new.side_a) or me = any (new.side_b)) then raise exception 'You have to be one of the players'; end if;
    if new.side_a && new.side_b then raise exception 'A player cannot be on both sides'; end if;
    if exists (select 1 from unnest(new.side_a || new.side_b) x where not exists (select 1 from public.rsvps r where r.game_id = new.game_id and r.player_id = x and r.status = 'in')) then
      raise exception 'Everyone listed has to have been In for this game';
    end if;
    new.reported_by := me; new.status := 'pending'; new.confirmed_by := null;
  else
    if old.status <> 'pending' then raise exception 'That result is already settled'; end if;
    if new.status = 'pending' then raise exception 'Choose confirm or dispute'; end if;
    if not ((me = any (old.side_a) and old.reported_by = any (old.side_b)) or (me = any (old.side_b) and old.reported_by = any (old.side_a))) then
      raise exception 'Someone from the other side has to confirm';
    end if;
    new.confirmed_by := case when new.status = 'confirmed' then me end;
  end if;
  return new;
end $$;
create trigger result_guard before insert or update on public.game_results for each row execute function private.result_guard();

create function private.result_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare g public.games; sp text; mine smallint; theirs smallint;
begin
  select * into g from public.games where id = new.game_id;
  select short into sp from public.sports where id = g.sport;
  if new.reported_by = any (new.side_a) then mine := new.score_a; theirs := new.score_b; else mine := new.score_b; theirs := new.score_a; end if;
  insert into public.notifications (player_id, game_id, kind, body)
  select x, new.game_id, 'result', private.first_name(new.reported_by) || ' recorded ' || sp || ' at ' || g.place || ': their side ' || mine || ', your side ' || theirs || '. Confirm it?'
  from unnest(case when new.reported_by = any (new.side_a) then new.side_b else new.side_a end) x;
  return null;
end $$;
create trigger result_notify after insert on public.game_results for each row execute function private.result_notify();

-- ---------- stats ----------
create view public.player_stats with (security_invoker = true) as
select player_id, sport, sum(played)::int as played, sum(hosted)::int as hosted, sum(w)::int as wins, sum(l)::int as losses, sum(t)::int as ties
from (
  select r.player_id, g.sport, 1 as played, 0 as hosted, 0 as w, 0 as l, 0 as t
  from public.rsvps r join public.games g on g.id = r.game_id
  where r.status = 'in' and g.starts_at + g.duration_min * interval '1 minute' < now()
  union all
  select g.host_id, g.sport, 0, 1, 0, 0, 0
  from public.games g where g.league_id is null and g.starts_at + g.duration_min * interval '1 minute' < now()
  union all
  select p, g.sport, 0, 0,
    case when (p = any (gr.side_a) and gr.score_a > gr.score_b) or (p = any (gr.side_b) and gr.score_b > gr.score_a) then 1 else 0 end,
    case when (p = any (gr.side_a) and gr.score_a < gr.score_b) or (p = any (gr.side_b) and gr.score_b < gr.score_a) then 1 else 0 end,
    case when gr.score_a = gr.score_b then 1 else 0 end
  from public.game_results gr join public.games g on g.id = gr.game_id
  cross join lateral unnest(gr.side_a || gr.side_b) as p
  where gr.status = 'confirmed'
  union all
  select tm.player_id, l.sport, 0, 0,
    case when (tm.team_id = f.home_team and f.home_score > f.away_score) or (tm.team_id = f.away_team and f.away_score > f.home_score) then 1 else 0 end,
    case when (tm.team_id = f.home_team and f.home_score < f.away_score) or (tm.team_id = f.away_team and f.away_score < f.home_score) then 1 else 0 end,
    case when f.home_score = f.away_score then 1 else 0 end
  from public.fixtures f join public.leagues l on l.id = f.league_id
  join public.team_members tm on tm.team_id in (f.home_team, f.away_team)
  where f.status = 'confirmed'
) x group by player_id, sport;
revoke all on public.player_stats from anon, authenticated;
grant select on public.player_stats to authenticated;

alter publication supabase_realtime add table public.leagues, public.league_teams, public.team_members, public.fixtures, public.game_results, public.rounds;

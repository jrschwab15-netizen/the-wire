-- Venue booking: venue managers publish slots, players book them.

alter table public.venues add column verified boolean not null default false;

create table public.venue_managers (
  venue_id uuid not null references public.venues(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_id, player_id)
);
create index venue_managers_player_idx on public.venue_managers (player_id);

insert into public.venue_managers (venue_id, player_id)
select id, created_by from public.venues where created_by is not null on conflict do nothing;

create function private.venue_creator_manages() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null then
    insert into public.venue_managers (venue_id, player_id) values (new.id, new.created_by) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger venue_creator_manages after insert on public.venues for each row execute function private.venue_creator_manages();

create table public.venue_slots (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  resource text not null check (char_length(resource) between 1 and 40),
  starts_at timestamptz not null,
  duration_min smallint not null check (duration_min between 15 and 360),
  capacity smallint not null default 4 check (capacity between 1 and 30),
  note text not null default '' check (char_length(note) <= 100),
  created_at timestamptz not null default now()
);
create unique index venue_slots_unique_idx on public.venue_slots (venue_id, resource, starts_at);
create index venue_slots_time_idx on public.venue_slots (starts_at);

create table public.slot_bookings (
  slot_id uuid primary key references public.venue_slots(id) on delete cascade,
  booked_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  party_size smallint not null check (party_size between 1 and 30),
  game_id uuid references public.games(id) on delete set null,
  created_at timestamptz not null default now()
);
create index slot_bookings_by_idx on public.slot_bookings (booked_by);
create index slot_bookings_game_idx on public.slot_bookings (game_id);

alter table public.venue_managers enable row level security;
alter table public.venue_slots enable row level security;
alter table public.slot_bookings enable row level security;
revoke all on public.venue_managers, public.venue_slots, public.slot_bookings from anon, authenticated;
revoke insert on public.venues from authenticated;
grant insert (name, sports, area, lat, lng, booking_url, created_by) on public.venues to authenticated;
grant select, delete on public.venue_managers to authenticated;
grant insert (venue_id, player_id) on public.venue_managers to authenticated;
grant select, delete on public.venue_slots to authenticated;
grant insert (venue_id, resource, starts_at, duration_min, capacity, note) on public.venue_slots to authenticated;
grant select, delete on public.slot_bookings to authenticated;
grant insert (slot_id, party_size) on public.slot_bookings to authenticated;
grant update (game_id) on public.slot_bookings to authenticated;

create policy "read managers" on public.venue_managers for select to authenticated using (true);
create policy "managers add managers" on public.venue_managers for insert to authenticated
  with check (exists (select 1 from public.venue_managers m where m.venue_id = venue_managers.venue_id and m.player_id = (select auth.uid())));
create policy "managers remove managers" on public.venue_managers for delete to authenticated
  using (exists (select 1 from public.venue_managers m where m.venue_id = venue_managers.venue_id and m.player_id = (select auth.uid())));

create policy "read slots" on public.venue_slots for select to authenticated using (true);
create policy "managers post slots" on public.venue_slots for insert to authenticated
  with check (exists (select 1 from public.venue_managers m where m.venue_id = venue_slots.venue_id and m.player_id = (select auth.uid())));
create policy "managers remove slots" on public.venue_slots for delete to authenticated
  using (exists (select 1 from public.venue_managers m where m.venue_id = venue_slots.venue_id and m.player_id = (select auth.uid())));

create policy "read bookings" on public.slot_bookings for select to authenticated using (true);
create policy "book a slot" on public.slot_bookings for insert to authenticated with check ((select auth.uid()) = booked_by);
create policy "attach own game" on public.slot_bookings for update to authenticated using ((select auth.uid()) = booked_by) with check ((select auth.uid()) = booked_by);
create policy "cancel booking" on public.slot_bookings for delete to authenticated
  using ((select auth.uid()) = booked_by
    or exists (select 1 from public.venue_slots s join public.venue_managers m on m.venue_id = s.venue_id where s.id = slot_bookings.slot_id and m.player_id = (select auth.uid())));

create function private.booking_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.venue_slots;
begin
  select * into s from public.venue_slots where id = new.slot_id;
  if not found then raise exception 'That time is gone'; end if;
  if s.starts_at < now() then raise exception 'That time has passed'; end if;
  if new.party_size > s.capacity then raise exception 'That slot holds % people', s.capacity; end if;
  if (select count(*) from public.slot_bookings b join public.venue_slots x on x.id = b.slot_id where b.booked_by = new.booked_by and x.starts_at > now()) >= 6 then
    raise exception 'You already hold 6 upcoming bookings';
  end if;
  return new;
end $$;
create trigger booking_guard before insert on public.slot_bookings for each row execute function private.booking_guard();

create function private.booking_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.venue_slots; v public.venues;
begin
  select * into s from public.venue_slots where id = new.slot_id;
  select * into v from public.venues where id = s.venue_id;
  insert into public.notifications (player_id, kind, body)
  select m.player_id, 'booking', private.first_name(new.booked_by) || ' booked ' || s.resource || ' at ' || v.name || ' ' || private.when_label(s.starts_at)
  from public.venue_managers m where m.venue_id = v.id and m.player_id <> new.booked_by;
  return null;
end $$;
create trigger booking_notify after insert on public.slot_bookings for each row execute function private.booking_notify();

alter publication supabase_realtime add table public.venue_slots, public.slot_bookings;

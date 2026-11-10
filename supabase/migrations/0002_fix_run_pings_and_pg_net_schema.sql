-- pg_net belongs in the extensions schema, and run_pings had a variable name that clashed with a table alias.
drop extension if exists pg_net;
create extension pg_net with schema extensions;

create or replace function private.run_pings() returns void language plpgsql security definer set search_path = '' as $$
declare rec record;
begin
  for rec in select id from public.games where kind = 'broadcast' and starts_at > now() and created_at > now() - interval '3 days' loop
    perform private.ping_game(rec.id);
  end loop;

  with rolled as (
    update public.games set starts_at = ((starts_at at time zone 'America/New_York')
        + (floor(extract(epoch from (now() - starts_at)) / 604800) + 1) * interval '7 days') at time zone 'America/New_York'
    where recurring = 'weekly' and starts_at + duration_min * interval '1 minute' < now()
    returning id, host_id
  ), cleared as (
    delete from public.rsvps rs using rolled where rs.game_id = rolled.id and rs.player_id <> rolled.host_id
  )
  delete from public.watchers w using rolled where w.game_id = rolled.id;
end $$;

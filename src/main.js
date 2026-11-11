import { createClient } from '@supabase/supabase-js';

/* ===== config (all three values are safe to ship in the browser) ===== */
const SB_URL = 'https://pfvlpaartrdngfoxzjdj.supabase.co';
const SB_KEY = 'sb_publishable_fVMej-B5tq90KQRtFtHkzg_FYLA2UDV';
const VAPID = 'BCK8bQ7H1AIehpOyTiGZqFNtqrsYcCq8u4UIu97yE72bXdrJwU4-nlTyAzOESZ7_a27ZxCLeeUPiuKjz7-jYEx0';
const sb = createClient(SB_URL, SB_KEY, {auth:{flowType:'pkce', detectSessionInUrl:true, persistSession:true, autoRefreshToken:true}});

/* Towns are just a name and a center point. Add more here to open a new area. */
const AREAS = {Andover:[42.658,-71.137],Arlington:[42.415,-71.156],Belmont:[42.396,-71.178],Boston:[42.36,-71.058],Brookline:[42.332,-71.121],Cambridge:[42.373,-71.11],Concord:[42.46,-71.349],Dedham:[42.242,-71.166],Dover:[42.246,-71.283],Hingham:[42.242,-70.89],Lexington:[42.447,-71.225],Marblehead:[42.5,-70.858],Needham:[42.28,-71.237],Newton:[42.337,-71.209],Sudbury:[42.383,-71.416],Wayland:[42.363,-71.361],Wellesley:[42.297,-71.292],Weston:[42.367,-71.303],Winchester:[42.452,-71.137],Acton:[42.485,-71.433],Bedford:[42.491,-71.276],Beverly:[42.558,-70.88],Braintree:[42.206,-71.002],Burlington:[42.505,-71.196],Canton:[42.158,-71.145],Framingham:[42.279,-71.416],Lincoln:[42.426,-71.304],Lynn:[42.466,-70.949],Medford:[42.418,-71.106],Milton:[42.25,-71.066],Natick:[42.283,-71.349],Norwood:[42.195,-71.2],Quincy:[42.253,-71.002],Reading:[42.526,-71.095],Salem:[42.52,-70.897],Somerville:[42.388,-71.1],Wakefield:[42.5,-71.073],Waltham:[42.376,-71.236],Westwood:[42.215,-71.225],Woburn:[42.479,-71.152]};
const BAND_LABELS = ['18 to 29','30 to 44','45 to 59','60 and up'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const HOUR = 36e5, DAY = 864e5;

/* ===== helpers ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const first = n => (String(n || '').trim().split(' ')[0]) || 'Someone';
const inits = n => (String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function at(d, h, m) { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, m || 0, 0, 0); return t.getTime(); }
function dayLabel(ts) { const d = new Date(ts), t = new Date(); const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), b = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); const diff = Math.round((a - b) / DAY); if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; return d.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'}); }
function timeLabel(ts) { return new Date(ts).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); }
function ago(t) { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'Just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); return h < 24 ? h + ' hr ago' : Math.round(h / 24) + ' d ago'; }
function dist(a, b) { const R = 3958.8, r = x => x * Math.PI / 180; const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const q = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); }
function hhmmLabel(s) { const [h, m] = s.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); }
function b64ToBytes(s) { const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
const store = {get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }};

/* ===== state ===== */
let UID = null, EMAIL = '', SPORTS = {}, S = null, booted = false, loading = false;
let dirty = false; // true while the player has profile edits that have not reached the database yet
let tab = 'home', sheet = null, seg = 'mine', draft = null, nc = null, nv = null, nl = null, tf = {name:''}, lf = null, rf = null, rs = null, rd = null, sf = null, bk = null, fseg = 'games', pf = {sport:'all'}, pushOn = false, channel = null;
let F = {sport:'all', day:'any', level:'any', dist:25, open:true};
let auth = {email:'', code:'', sent:false, busy:false};

const P = id => (S.players[id]) || {id, name:'Player', level:1, comms:[], lat:S.me.lat, lng:S.me.lng};
const C = id => S.comms.find(c => c.id === id);
const gm = id => S.games.find(g => g.id === id);
const onSports = () => Object.values(SPORTS).filter(s => s.enabled).sort((a, b) => a.sort - b.sort);
const mySports = () => onSports().filter(s => S.me.sp[s.id] != null);
const lvlOf = (p, sp) => (p.sp && p.sp[sp] != null) ? p.sp[sp] : 1;
const durLabel = (sp, m) => { const i = sp.durations.indexOf(m); if (sp.duration_labels && i >= 0) return sp.duration_labels[i]; return m < 60 ? m + ' min' : m % 60 ? Math.floor(m / 60) + ' hr ' + (m % 60) + ' min' : (m / 60) + ' hr'; };
const venue = id => S.venues.find(v => v.id === id);
const sportList = p => Object.keys(p.sp || {}).map(id => SPORTS[id]).filter(Boolean).sort((a, b) => a.sort - b.sort);
const vis = g => SPORTS[g.sport] && SPORTS[g.sport].enabled;
const countIn = g => Object.values(g.rsvps).filter(v => v === 'in').length;
const openSpots = g => g.spots - countIn(g);
const levelText = g => { const L = SPORTS[g.sport].levels; if (g.levelMin === 0 && g.levelMax === L.length - 1) return 'All levels'; return g.levelMin === g.levelMax ? L[g.levelMin] : L[g.levelMin] + ' to ' + L[g.levelMax]; };
const mine = g => g.hostId === UID || g.rsvps[UID] === 'in' || g.rsvps[UID] === 'maybe';
const myUpcoming = () => S.games.filter(g => vis(g) && g.end > Date.now() && mine(g)).sort((a, b) => a.start - b.start);
const levelOk = (p, g) => { const l = lvlOf(p, g.sport); return !(Math.min(3, l + 1) < g.levelMin || Math.max(0, l - 1) > g.levelMax); };
const nearbyOpen = () => S.games.filter(g => vis(g) && !g.leagueId && g.end > Date.now() && openSpots(g) > 0 && g.rsvps[UID] !== 'in' && S.me.sp[g.sport] != null && dist(S.me, g) <= S.me.radius && levelOk(S.me, g)).sort((a, b) => a.start - b.start);
const myComms = () => S.me.comms;
const commsFor = sp => S.comms.filter(c => c.sports.includes(sp));

/* ===== data ===== */
function fail(error, msg) { if (error) { console.error(error); toast(msg || error.message || 'Something went wrong'); } return !!error; }
async function loadAll() {
  if (!UID) return;
  loading = true;
  const since = new Date(Date.now() - 4 * HOUR).toISOString();
  const [sp, pr, st, co, mb, ga, no, wa, ps, ve, le, lt, tm, fx, gr, ro, pst, vs, vb, vm] = await Promise.all([
    sb.from('sports').select('*').order('sort'),
    sb.from('profiles').select('id,name,area,lat,lng,onboarded'),
    sb.from('player_settings').select('age_band,days,radius').eq('id', UID).maybeSingle(),
    sb.from('communities').select('id,name,type,area,lat,lng,sports,created_by').order('name'),
    sb.from('memberships').select('community_id,player_id'),
    sb.from('games').select('*, rsvps(player_id,status), messages(id,player_id,body,is_system,created_at)').gt('starts_at', since).order('starts_at'),
    sb.from('notifications').select('id,game_id,kind,body,created_at,read_at').eq('player_id', UID).order('created_at', {ascending:false}).limit(20),
    sb.from('watchers').select('game_id').eq('player_id', UID),
    sb.from('player_sports').select('player_id,sport_id,level'),
    sb.from('venues').select('id,name,sports,area,lat,lng,booking_url,verified').order('name'),
    sb.from('leagues').select('id,name,sport,area,lat,lng,description,mode,win_pts,tie_pts,status,commissioner_id').order('created_at', {ascending:false}),
    sb.from('league_teams').select('id,league_id,name,captain_id'),
    sb.from('team_members').select('team_id,player_id,league_id'),
    sb.from('fixtures').select('id,league_id,home_team,away_team,starts_at,place,game_id,status,home_score,away_score,reported_by,reported_side,confirmed_by').order('starts_at'),
    sb.from('game_results').select('game_id,side_a,side_b,score_a,score_b,status,reported_by'),
    sb.from('rounds').select('id,player_id,sport,game_id,venue_name,played_on,holes,strokes,attested_by').order('played_on', {ascending:false}).limit(500),
    sb.from('player_stats').select('player_id,sport,played,hosted,wins,losses,ties'),
    sb.from('venue_slots').select('id,venue_id,resource,starts_at,duration_min,capacity,note').gt('starts_at', new Date(Date.now() - HOUR).toISOString()).order('starts_at'),
    sb.from('slot_bookings').select('slot_id,booked_by,party_size,game_id'),
    sb.from('venue_managers').select('venue_id,player_id')
  ]);
  loading = false;
  const err = [sp, pr, st, co, mb, ga, no, wa, ps, ve, le, lt, tm, fx, gr, ro, pst, vs, vb, vm].find(r => r.error);
  if (err) { fail(err.error, 'Could not load. Check your connection'); if (!S) return; return; }
  SPORTS = {}; sp.data.forEach(s => { SPORTS[s.id] = s; });
  const players = {};
  pr.data.forEach(p => { players[p.id] = {...p, comms:[], sp:{}}; });
  ps.data.forEach(x => { if (players[x.player_id]) players[x.player_id].sp[x.sport_id] = x.level; });
  mb.data.forEach(m => { if (players[m.player_id]) players[m.player_id].comms.push(m.community_id); });
  if (!players[UID]) {
    // first sign-in safety net: the database normally creates these rows itself
    await sb.from('profiles').upsert({id:UID}); await sb.from('player_settings').upsert({id:UID});
    players[UID] = {id:UID, name:'', area:'Lexington', lat:AREAS.Lexington[0], lng:AREAS.Lexington[1], sp:{}, onboarded:false, comms:[]};
  }
  const set = st.data || {age_band:1, days:[0,1,2,3,4,5,6], radius:15};
  const me = Object.assign(players[UID], {ageBand:set.age_band, days:set.days, radius:set.radius});
  if (S && dirty) { const o = S.me; Object.assign(me, {name:o.name, area:o.area, lat:o.lat, lng:o.lng, ageBand:o.ageBand, days:o.days, radius:o.radius}); }
  const watch = new Set(wa.data.map(w => w.game_id));
  const games = ga.data.map(r => {
    const rs = {}; (r.rsvps || []).forEach(x => { rs[x.player_id] = x.status; });
    const start = Date.parse(r.starts_at);
    return {id:r.id, sport:r.sport, venueId:r.venue_id, hostId:r.host_id, communityId:r.community_id, place:r.place, lat:r.lat, lng:r.lng, start, dur:r.duration_min, end:start + r.duration_min * 60000, spots:r.spots, levelMin:r.level_min, levelMax:r.level_max, kind:r.kind, leagueId:r.league_id, note:r.note, recurring:r.recurring, ageBand:r.age_band, rsvps:rs,
      thread:(r.messages || []).sort((a, b) => a.id - b.id).map(m => ({by:m.player_id, text:m.body, t:Date.parse(m.created_at), sys:m.is_system})), watching:watch.has(r.id)};
  });
  const stats = {}; pst.data.forEach(x => { (stats[x.player_id] = stats[x.player_id] || {})[x.sport] = x; });
  const results = {}; gr.data.forEach(x => { results[x.game_id] = x; }); const bookings = {}; vb.data.forEach(x => { bookings[x.slot_id] = x; });
  S = {me, players, comms:co.data, venues:ve.data, leagues:le.data, teams:lt.data, members:tm.data, fixtures:fx.data, results, rounds:ro.data, stats, slots:vs.data, bookings, mgrs:vm.data, games, inbox:no.data.map(n => ({id:n.id, t:Date.parse(n.created_at), msg:n.body, gid:n.game_id, read:!!n.read_at}))};
}
let reloadT = null;
function refreshSoon(ms) { clearTimeout(reloadT); reloadT = setTimeout(async () => { await loadAll(); if (S) render(); }, ms == null ? 350 : ms); }
function subscribe() {
  if (channel) sb.removeChannel(channel);
  const any = t => ({event:'*', schema:'public', table:t});
  channel = sb.channel('wire-' + UID)
    .on('postgres_changes', any('games'), () => refreshSoon())
    .on('postgres_changes', any('rsvps'), () => refreshSoon())
    .on('postgres_changes', any('messages'), () => refreshSoon())
    .on('postgres_changes', any('memberships'), () => refreshSoon())
    .on('postgres_changes', any('fixtures'), () => refreshSoon())
    .on('postgres_changes', any('league_teams'), () => refreshSoon())
    .on('postgres_changes', any('team_members'), () => refreshSoon())
    .on('postgres_changes', any('game_results'), () => refreshSoon())
    .on('postgres_changes', any('venue_slots'), () => refreshSoon())
    .on('postgres_changes', any('slot_bookings'), () => refreshSoon())
    .on('postgres_changes', {event:'INSERT', schema:'public', table:'notifications', filter:'player_id=eq.' + UID}, p => { if (p.new && p.new.body) toast(p.new.body); refreshSoon(); })
    .subscribe();
}
let saveT = null;
function saveMe() {
  clearTimeout(saveT); dirty = true;
  const mine = saveT = setTimeout(async () => {
    const m = S.me;
    const a = await sb.from('profiles').update({name:m.name.trim().slice(0, 60), area:m.area, lat:m.lat, lng:m.lng, onboarded:m.onboarded}).eq('id', UID);
    const b = await sb.from('player_settings').update({age_band:m.ageBand, days:m.days, radius:m.radius, updated_at:new Date().toISOString()}).eq('id', UID);
    fail(a.error || b.error, 'Could not save your profile');
    if (saveT === mine) dirty = false;
  }, 500);
}
function fixMe() { const m = S.me, a = AREAS[m.area] || AREAS.Lexington; m.lat = a[0]; m.lng = a[1]; }

/* ===== actions ===== */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3200); }
function setTab(t) { tab = t; sheet = null; history.replaceState(null, '', '#' + t); render(); window.scrollTo(0, 0); }
function openGame(id) {
  sheet = {name:'game', id, back:sheet && sheet.name === 'league' ? sheet : null}; history.replaceState(null, '', '#game/' + id); render();
  const unread = S.inbox.filter(n => n.gid === id && !n.read);
  if (unread.length) { unread.forEach(n => { n.read = true; }); sb.from('notifications').update({read_at:new Date().toISOString()}).eq('player_id', UID).eq('game_id', id).is('read_at', null).then(() => {}); }
}
function closeSheet() { const b = sheet && sheet.back; sheet = b || null; history.replaceState(null, '', '#' + (sheet && sheet.name === 'game' ? 'game/' + sheet.id : sheet && sheet.name === 'league' ? 'league/' + sheet.id : tab)); render(); }
async function applyRsvp(g, s, reason) {
  const prev = g.rsvps[UID];
  g.rsvps[UID] = s; render();
  const {error} = await sb.from('rsvps').upsert({game_id:g.id, player_id:UID, status:s, reason:s === 'out' ? (reason || null) : null});
  if (error) { if (prev) g.rsvps[UID] = prev; else delete g.rsvps[UID]; render(); toast(/full/i.test(error.message) ? 'That game just filled up' : /over/i.test(error.message) ? 'That game is over' : 'Could not save. Try again'); refreshSoon(0); return; }
  toast(s === 'in' ? "You're in" : s === 'maybe' ? 'Marked maybe' : prev === 'in' ? 'Marked out. The host has been told' : 'Marked out');
}
function rsvp(id, s) {
  const g = gm(id); if (!g || g.rsvps[UID] === s) return;
  if (s === 'in' && countIn(g) >= g.spots) { toast('That game is full'); return; }
  if (g.rsvps[UID] === 'in' && s === 'out') { sheet = {name:'game', id, askReason:true}; render(); return; }
  applyRsvp(g, s);
}
function icsFor(g) {
  const f = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//The Wire//EN','BEGIN:VEVENT','UID:' + g.id + '@thewire-sport.com','DTSTAMP:' + f(Date.now()),'DTSTART:' + f(g.start),'DTEND:' + f(g.end),'SUMMARY:' + SPORTS[g.sport].short + ' at ' + g.place,'LOCATION:' + g.place,'DESCRIPTION:' + (g.note || 'Game on The Wire').replace(/[\n,;]/g, ' ')];
  if (g.recurring) L.push('RRULE:FREQ=WEEKLY');
  L.push('END:VEVENT', 'END:VCALENDAR');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L.join('\r\n')], {type:'text/calendar'})); a.download = 'the-wire-game.ics';
  document.body.appendChild(a); a.click(); a.remove(); toast('Calendar event downloaded');
}
function copyLink(g) {
  const url = location.href.split('#')[0].split('?')[0] + '#game/' + g.id;
  const text = SPORTS[g.sport].short + ' at ' + g.place + ', ' + dayLabel(g.start) + ' ' + timeLabel(g.start) + '. Join on The Wire:';
  if (navigator.share) { navigator.share({title:'The Wire', text, url}).catch(() => {}); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Link copied. Paste it in any chat'), () => toast(url));
  else toast(url);
}
function defTime() { const d = new Date(Date.now() + HOUR); let h = d.getHours(), m = d.getMinutes() <= 30 ? 30 : 0; if (m === 0) h++; if (h > 21) return {day:1, time:'18:30'}; if (h < 6) return {day:0, time:'18:30'}; return {day:0, time:pad(h) + ':' + pad(m)}; }
function defDur(sp) { return sp.durations.includes(90) ? 90 : sp.durations[sp.durations.length - 1]; }
function defVenue(sp) { const v = S.venues.filter(x => x.sports.includes(sp)).sort((a, b) => dist(S.me, a) - dist(S.me, b))[0]; return v ? v.id : 'area'; }
function draftFor(d, spId) {
  const sp = SPORTS[spId], l = lvlOf(S.me, spId);
  Object.assign(d, {sport:spId, spots:sp.size, dur:defDur(sp), lmin:Math.max(0, l - 1), lmax:Math.min(sp.levels.length - 1, l + 1), place:defVenue(spId), comm:(commsFor(spId).find(c => myComms().includes(c.id)) || {}).id || ''});
}
function openCompose(mode) {
  const sp = mySports()[0] || onSports()[0], dt = defTime();
  draft = {mode, day:dt.day, time:dt.time, placeName:'', area:S.me.area, ageOn:false, note:'', weekly:false, busy:false};
  draftFor(draft, sp.id);
  sheet = {name:'compose'}; render();
}
async function ensureVenue(name, area, sport) {
  try {
    const a = AREAS[area], clean = name.replace(/[%_\\]/g, '');
    let {data} = await sb.from('venues').select('id,sports').ilike('name', clean).eq('area', area).maybeSingle();
    if (!data) {
      const r = await sb.from('venues').insert({name:name.slice(0, 80), sports:[sport], area, lat:a[0], lng:a[1], created_by:UID}).select('id').single();
      if (!r.error) return r.data.id;
      ({data} = await sb.from('venues').select('id,sports').ilike('name', clean).eq('area', area).maybeSingle());
      if (!data) return null;
    }
    if (!data.sports.includes(sport)) await sb.from('venues').update({sports:[...data.sports, sport]}).eq('id', data.id);
    return data.id;
  } catch (e) { return null; }
}
async function submitCompose() {
  const d = draft; if (d.busy) return;
  const [h, m] = d.time.split(':').map(Number), start = at(d.day, h, m);
  if (start < Date.now() + 5 * 60000) { toast('Pick a time that has not passed yet'); return; }
  const sched = d.mode === 'schedule';
  if (sched && !d.comm) { toast('Pick a group to schedule for'); return; }
  let place, lat, lng, vid = null;
  if (d.place === 'area') {
    place = d.placeName.trim(); if (place.length < 2) { toast('Name the place'); return; }
    lat = AREAS[d.area][0]; lng = AREAS[d.area][1];
  } else { const v = venue(d.place); if (!v) { toast('Pick a place'); return; } place = v.name; lat = v.lat; lng = v.lng; vid = v.id; }
  d.busy = true; render();
  if (d.place === 'area') vid = await ensureVenue(place, d.area, d.sport);
  const row = {sport:d.sport, host_id:UID, community_id:sched ? d.comm : null, venue_id:vid, place:place.slice(0, 80), lat, lng, starts_at:new Date(start).toISOString(), duration_min:d.dur, spots:d.spots, level_min:Math.min(d.lmin, d.lmax), level_max:Math.max(d.lmin, d.lmax), kind:sched ? 'scheduled' : 'broadcast', note:d.note.trim().slice(0, 500), recurring:sched && d.weekly ? 'weekly' : null, age_band:!sched && d.ageOn ? S.me.ageBand : null};
  const {data, error} = await sb.from('games').insert(row).select('id').single();
  d.busy = false;
  if (fail(error, 'Could not post the game')) { render(); return; }
  await loadAll();
  if (!sched) {
    const {data:pings} = await sb.from('notifications').select('player_id,wave').eq('game_id', data.id).eq('kind', 'ping');
    sheet = {name:'pings', id:data.id, pinged:(pings || []).map(p => p.player_id)}; history.replaceState(null, '', '#' + tab); render();
  } else {
    const n = Object.values(S.players).filter(p => p.id !== UID && p.comms.includes(d.comm)).length;
    toast('Posted. ' + n + (n === 1 ? ' member' : ' members') + ' notified'); sheet = null; seg = 'mine'; setTab('schedule');
  }
}
async function togglePlay(id) {
  if (S.me.sp[id] != null) { delete S.me.sp[id]; render(); fail((await sb.from('player_sports').delete().eq('player_id', UID).eq('sport_id', id)).error, 'Could not save'); }
  else { S.me.sp[id] = 1; render(); fail((await sb.from('player_sports').insert({player_id:UID, sport_id:id, level:1})).error, 'Could not save'); }
}
async function setLvl(id, level) {
  S.me.sp[id] = level; render();
  fail((await sb.from('player_sports').update({level}).eq('player_id', UID).eq('sport_id', id)).error, 'Could not save');
}
async function createVenue() {
  const name = nv.name.trim(); if (name.length < 2) { toast('Give it a name'); return; }
  if (!nv.sports.length) { toast('Pick at least one sport'); return; }
  let url = nv.url.trim(); if (url && !/^https:\/\//i.test(url)) url = 'https://' + url.replace(/^http:\/\//i, '');
  const a = AREAS[nv.area];
  const {error} = await sb.from('venues').insert({name:name.slice(0, 80), sports:nv.sports, area:nv.area, lat:a[0], lng:a[1], booking_url:url || null, created_by:UID});
  if (error) { console.error(error); toast(/duplicate|unique/i.test(error.message) ? 'That place is already listed' : 'Could not add it'); return; }
  await loadAll();
  if (draft) { const v = S.venues.find(x => x.name.toLowerCase() === name.toLowerCase() && x.area === nv.area); if (v) draft.place = v.id; }
  sheet = nv.back || null; nv = null; render(); toast(name + ' added');
}
function inviteFriends() {
  const url = location.origin + '/', text = 'I am using The Wire to find people to play with, in any sport. Free, no ads:';
  if (navigator.share) { navigator.share({title:'The Wire', text, url}).catch(() => {}); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text + ' ' + url).then(() => toast('Invite copied. Paste it in any chat'), () => toast(url));
  else toast(url);
}
async function toggleComm(id) {
  const i = S.me.comms.indexOf(id);
  if (i < 0) { S.me.comms.push(id); render(); fail((await sb.from('memberships').insert({community_id:id, player_id:UID})).error, 'Could not join'); }
  else { S.me.comms.splice(i, 1); render(); fail((await sb.from('memberships').delete().eq('community_id', id).eq('player_id', UID)).error, 'Could not leave'); }
}
async function createComm() {
  const name = nc.name.trim(); if (name.length < 2) { toast('Give it a name'); return; }
  if (S.comms.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast('That one already exists. Tap it to join'); return; }
  const a = AREAS[nc.area];
  const {data, error} = await sb.from('communities').insert({name:name.slice(0, 60), type:nc.type, area:nc.area, lat:a[0], lng:a[1], sports:[(draft ? draft.sport : (mySports()[0] || onSports()[0]).id)], created_by:UID}).select('id').single();
  if (fail(error, 'Could not add it')) return;
  await sb.from('memberships').insert({community_id:data.id, player_id:UID});
  await loadAll(); sheet = nc.back || null; nc = null; render(); toast(name + ' added. Share the app with the rest of the group');
}
async function pushState() { try { if (!('serviceWorker' in navigator) || !('PushManager' in window)) return; const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); pushOn = !!sub && Notification.permission === 'granted'; } catch (e) { pushOn = false; } }
async function togglePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { toast('On iPhone, add The Wire to your Home Screen first, then open it from there'); return; }
    const reg = await navigator.serviceWorker.ready;
    if (pushOn) { const sub = await reg.pushManager.getSubscription(); if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); } pushOn = false; render(); toast('Phone alerts are off'); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Alerts are blocked. Allow notifications for this site in your settings'); return; }
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToBytes(VAPID)});
    const j = sub.toJSON();
    const {error} = await sb.from('push_subscriptions').upsert({player_id:UID, endpoint:j.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth}, {onConflict:'endpoint'});
    if (fail(error, 'Could not turn on alerts on this device')) return;
    pushOn = true; render(); toast('Phone alerts are on');
  } catch (e) { console.error(e); toast('Could not turn on alerts on this device'); }
}
const redirectTo = () => location.origin + location.pathname;
async function sendLink() {
  const email = auth.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter your email address'); return; }
  auth.busy = true; render();
  const {error} = await sb.auth.signInWithOtp({email, options:{emailRedirectTo:redirectTo(), shouldCreateUser:true}});
  auth.busy = false;
  if (error) { render(); toast(/rate|seconds/i.test(error.message) ? 'Too many tries. Wait a minute and try again' : error.message); return; }
  auth.sent = true; auth.email = email; render();
}
async function verifyCode() {
  const token = auth.code.replace(/\D/g, ''); if (token.length < 6) { toast('Enter the code from the email'); return; }
  auth.busy = true; render();
  const {error} = await sb.auth.verifyOtp({email:auth.email, token, type:'email'});
  auth.busy = false;
  if (error) { render(); toast('That code did not work. Check it or send a new one'); }
}
async function google() { const {error} = await sb.auth.signInWithOAuth({provider:'google', options:{redirectTo:redirectTo()}}); if (error) toast('Google sign-in is not set up yet. Use email for now'); }

/* ===== views ===== */
const LOGO = '<img src="./icon.svg" alt="" width="26" height="26">';
const ICON = {
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a1 1 0 0 0-1 1 3 3 0 0 0 3 3M16 6h3a1 1 0 0 1 1 1 3 3 0 0 1-3 3M12 13v4M9 20h6"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
  find:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>',
  me:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.2-3.6 4-5.2 7.5-5.2s6.3 1.6 7.5 5.2"/></svg>'
};
const av = (p, cls) => '<span class="av ' + (cls || '') + '" style="--h:' + hue(p.name || p.id) + '">' + esc(inits(p.name || 'You')) + '</span>';
const empty = (t, s) => '<div class="empty"><b>' + esc(t) + '</b>' + esc(s) + '</div>';
const areaOpts = sel => Object.keys(AREAS).map(a => '<option' + (sel === a ? ' selected' : '') + '>' + a + '</option>').join('');
function dots(g) { const n = countIn(g), o = g.spots - n; return '<div class="spots" aria-label="' + n + ' of ' + g.spots + ' in">' + Array.from({length:g.spots}, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '<span>' + (o > 0 ? o + ' open' : 'Full') + '</span></div>'; }
function rsvpRow(g) {
  const r = g.rsvps[UID], full = countIn(g) >= g.spots && r !== 'in';
  const b = (s, l) => '<button class="rb ' + s + (r === s ? ' on' : '') + '" data-a="rsvp" data-id="' + g.id + '" data-s="' + s + '" aria-pressed="' + (r === s) + '"' + (s === 'in' && full ? ' disabled' : '') + '>' + (s === 'in' && full ? 'Full' : l) + '</button>';
  return '<div class="rsvp">' + b('in', 'In') + b('maybe', 'Maybe') + b('out', 'Out') + '</div>';
}
function gameCard(g) {
  const host = P(g.hostId), c = g.communityId ? C(g.communityId) : null, d = Math.round(dist(S.me, g));
  const multi = onSports().length > 1;
  return '<article class="card game" data-a="game" data-id="' + g.id + '">' +
    '<div class="row"><div class="time"><b>' + timeLabel(g.start) + '</b><span>' + dayLabel(g.start) + '</span></div>' +
    '<div class="grow"><h3>' + esc(g.place) + '</h3><div class="meta"><span>' + esc(levelText(g)) + '</span><span>' + (d < 1 ? 'Under 1 mile' : d + ' miles') + '</span><span>Host: ' + esc(g.hostId === UID ? 'You' : first(host.name)) + '</span></div>' +
    '<div class="meta">' + (g.kind === 'broadcast' ? '<span class="tag live">Play now</span>' : '') + (g.recurring ? '<span class="tag">Every week</span>' : '') + (c ? '<span class="tag">' + esc(c.name) + '</span>' : '') + '<span class="tag">' + esc(SPORTS[g.sport].short) + '</span>' + (g.leagueId && L(g.leagueId) ? '<span class="tag">' + esc(L(g.leagueId).name) + '</span>' : '') + '</div></div></div>' +
    dots(g) + rsvpRow(g) + '</article>';
}
function header() { return '<header class="top"><div class="mark">' + LOGO + 'the wire</div>' + (S ? '<button data-a="tab" data-t="profile" aria-label="Your profile">' + av(S.me, '') + '</button>' : '') + '</header>'; }
function tabbar() {
  const t = (id, ic, l) => '<button class="t ' + (tab === id ? 'on' : '') + '" data-a="tab" data-t="' + id + '"' + (tab === id ? ' aria-current="page"' : '') + '>' + ICON[ic] + l + '</button>';
  return '<nav class="tabs" aria-label="Main">' + t('home', 'home', 'Home') + t('schedule', 'cal', 'Schedule') + t('leagues', 'trophy', 'Leagues') + t('find', 'find', 'Find') + t('profile', 'me', 'You') + '<button class="go" data-a="compose" data-m="broadcast" aria-label="Play now">Play now</button>' + '</nav>';
}
const POWERED = '<p class="powered">Powered by <a href="https://openbeta.net" target="_blank" rel="noopener noreferrer">openbeta</a></p>';
function viewAuth() {
  return '<section class="pad auth"><h1 class="hero">Who wants to play?</h1><p class="lede">Find a game in any sport, fill the open spot, run your league. Free, no ads.</p>' +
    '<button class="btn block" data-a="google"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.7 3.2-8z"/><path fill="#34A853" d="M12 23c2.9 0 5.400-1 7.200-2.700l-3.600-2.700c-1 .7-2.200 1.100-3.600 1.100-2.800 0-5.200-1.900-6-4.400H2.300v2.800A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M6 14.300a6.600 6.600 0 0 1 0-4.200V7.300H2.300a11 11 0 0 0 0 9.800L6 14.300z"/><path fill="#EA4335" d="M12 5.400c1.600 0 3 .5 4.100 1.600l3.100-3.100A11 11 0 0 0 2.300 7.300L6 10.100c.8-2.500 3.200-4.700 6-4.700z"/></svg>Continue with Google</button>' +
    '<div class="or"><span>or</span></div>' +
    (auth.sent
      ? '<div class="card"><b>Check your email</b><p class="hint">We sent a sign-in link to ' + esc(auth.email) + '. Tap it, or type the 6-digit code from the email here.</p>' +
        '<label class="field"><span class="lab">Code</span><input class="inp" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" data-bind="auth.code" value="' + esc(auth.code) + '"></label>' +
        '<button class="btn solid block" data-a="verify"' + (auth.busy ? ' disabled' : '') + '>Sign in</button><button class="btn ghost block" style="margin-top:8px" data-a="authback">Use a different email</button></div>'
      : '<label class="field" style="margin-top:0"><span class="lab">Email</span><input class="inp" id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" data-bind="auth.email" value="' + esc(auth.email) + '"></label>' +
        '<button class="btn solid block" data-a="sendlink"' + (auth.busy ? ' disabled' : '') + '>' + (auth.busy ? 'Sending' : 'Email me a sign-in link') + '</button>') +
    '<p class="hint" style="margin-top:18px">No password to remember. Your email is only used to sign you in.</p>' + POWERED + '</section>';
}
function viewHome() {
  const f = first(S.me.name) === 'Someone' ? 'there' : first(S.me.name), next = myUpcoming()[0], open = nearbyOpen().slice(0, 4), act = S.inbox.slice(0, 4);
  return '<section class="pad"><p class="kicker">Hey ' + esc(f) + '</p><h1 class="hero">Who wants to play?</h1>' +
    '<button class="xl" data-a="compose" data-m="broadcast"><span>Play now</span><small>Ping nearby people who play your sport</small></button>' +
    (act.length ? '<h2 class="h2">Activity</h2>' + act.map(a => '<div class="note-row' + (a.read ? ' read' : '') + '"' + (a.gid && gm(a.gid) ? ' data-a="game" data-id="' + a.gid + '"' : '') + '><span class="pulse"></span><div><b>' + esc(a.msg) + '</b><small>' + ago(a.t) + '</small></div></div>').join('') : '') +
    '<h2 class="h2">Your next game</h2>' + (next ? gameCard(next) : empty('Nothing on your schedule', 'Join a game below or post one with Play now.')) +
    (myBookings().filter(s => venue(s.venue_id)).length ? '<h2 class="h2">Your bookings</h2>' + myBookings().filter(s => venue(s.venue_id)).map(s => { const v = venue(s.venue_id), t = Date.parse(s.starts_at); return '<div class="note-row" data-a="venue" data-id="' + v.id + '"><span class="pulse"></span><div><b>' + esc(s.resource) + ' at ' + esc(v.name) + '</b><small>' + dayLabel(t) + ', ' + timeLabel(t) + '</small></div></div>'; }).join('') : '') +
    '<h2 class="h2">Open near you</h2>' + (open.length ? open.map(gameCard).join('') : empty('Nothing open that fits right now', 'Post a game and the right people get pinged.')) +
    '<button class="btn block ghost" style="margin-top:10px" data-a="invite">Invite someone to play</button></section>';
}
function groupByDay(list) {
  const m = new Map(); list.forEach(g => { const k = new Date(g.start).toDateString(); if (!m.has(k)) m.set(k, []); m.get(k).push(g); });
  return [...m.values()].map(arr => '<h2 class="h2">' + dayLabel(arr[0].start) + '</h2>' + arr.map(gameCard).join('')).join('');
}
function viewSchedule() {
  let list = S.games.filter(g => vis(g) && g.end > Date.now());
  if (seg === 'mine') list = list.filter(mine);
  else if (seg === 'all') list = list.filter(g => !g.leagueId);
  else if (seg === 'comm') list = list.filter(g => g.communityId && myComms().includes(g.communityId));
  list.sort((a, b) => a.start - b.start);
  const msg = seg === 'mine' ? ['Nothing on your schedule', 'Mark In on a game or post your own.'] : seg === 'comm' ? ['No games in your communities', myComms().length ? 'Schedule one yourself with the button below.' : 'Join or add a club or group on your profile first.'] : ['No upcoming games', 'Be the first to post one.'];
  const sb2 = (id, l) => '<button class="' + (seg === id ? 'on' : '') + '" data-a="seg" data-v="' + id + '">' + l + '</button>';
  return '<section class="pad"><h1 class="hero" style="margin-bottom:6px;font-size:32px">Schedule</h1><div class="seg" role="tablist">' + sb2('mine', 'My games') + sb2('comm', 'My communities') + sb2('all', 'Everything') + '</div>' +
    (list.length ? groupByDay(list) : '<div style="margin-top:16px">' + empty(msg[0], msg[1]) + '</div>') +
    '<div style="margin-top:14px"><button class="btn block" data-a="compose" data-m="schedule">Schedule a game for a community</button></div></section>';
}
function findGames() {
  const sports = onSports();
  let list = S.games.filter(g => vis(g) && !g.leagueId && g.end > Date.now() && g.hostId !== UID);
  if (F.sport !== 'all') list = list.filter(g => g.sport === F.sport);
  if (F.open) list = list.filter(g => openSpots(g) > 0);
  if (F.level !== 'any') list = list.filter(g => g.levelMin <= F.level && g.levelMax >= F.level);
  if (F.day === 'today') list = list.filter(g => dayLabel(g.start) === 'Today');
  if (F.day === 'weekend') list = list.filter(g => [0, 6].includes(new Date(g.start).getDay()));
  if (F.day === 'week') list = list.filter(g => g.start < Date.now() + 7 * DAY);
  list = list.filter(g => dist(S.me, g) <= F.dist).sort((a, b) => a.start - b.start);
  const ch = (k, v, l) => '<button class="chip ' + (F[k] === v ? 'on' : '') + '" data-a="filt" data-k="' + k + '" data-v="' + v + '">' + l + '</button>';
  const lv = SPORTS[(F.sport !== 'all' ? F.sport : sports[0].id)].levels;
  return '<div style="height:10px"></div>' +
    (sports.length > 1 ? '<div class="chips" style="margin-bottom:10px">' + ch('sport', 'all', 'All sports') + sports.map(s => ch('sport', s.id, esc(s.short))).join('') + '</div>' : '') +
    '<div class="chips">' + ch('day', 'any', 'Any day') + ch('day', 'today', 'Today') + ch('day', 'weekend', 'Weekend') + ch('day', 'week', 'Next 7 days') + '</div>' +
    '<div class="two" style="margin-top:12px"><label><span class="lab">Level</span><select class="inp" data-bind="F.level" data-parse="lv"><option value="any"' + (F.level === 'any' ? ' selected' : '') + '>Any level</option>' + lv.map((l, i) => '<option value="' + i + '"' + (F.level === i ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
    '<label><span class="lab">Within <span id="dl">' + F.dist + ' mi</span></span><input type="range" min="5" max="60" step="5" value="' + F.dist + '" data-bind="F.dist" data-num="1" data-live="dl" aria-label="Distance in miles"></label></div>' +
    '<label class="toggle"><span>Only games with open spots</span><input type="checkbox" data-bind="F.open"' + (F.open ? ' checked' : '') + '></label>' +
    '<h2 class="h2" style="margin-top:12px">' + list.length + ' ' + (list.length === 1 ? 'game' : 'games') + '</h2>' +
    (list.length ? list.map(gameCard).join('') : empty('No games match', 'Widen the distance or post a game with Play now.'));
}
function sportChips(key, obj, act) {
  const sp = onSports(), c = (v, l) => '<button class="chip ' + (obj[key] === v ? 'on' : '') + '" data-a="' + act + '" data-v="' + v + '">' + l + '</button>';
  return '<div class="chips" style="margin:10px 0">' + c('all', 'All sports') + sp.map(s => c(s.id, esc(s.short))).join('') + '</div>';
}
function findPeople() {
  const list = Object.values(S.players).filter(p => p.id !== UID && p.onboarded && p.name && Object.keys(p.sp).length && (pf.sport === 'all' || p.sp[pf.sport] != null))
    .map(p => ({p, d:dist(S.me, p)})).filter(x => x.d <= 50).sort((a, b) => a.d - b.d);
  return sportChips('sport', pf, 'pfilt') + '<h2 class="h2">' + list.length + (list.length === 1 ? ' person' : ' people') + ' within 50 miles</h2>' +
    (list.length ? list.map(x => '<div class="card" data-a="player" data-id="' + x.p.id + '" style="cursor:pointer"><div class="pl">' + av(x.p, 'sm') + '<div><b>' + esc(x.p.name) + '</b><small>' + esc(sportList(x.p).map(s => s.short + ', ' + s.levels[x.p.sp[s.id]]).join(' / ')) + '</small><small>' + esc(x.p.area) + ', ' + (x.d < 1 ? 'under 1 mile' : Math.round(x.d) + ' miles') + '</small></div></div></div>').join('')
      : empty('Nobody here yet', 'The more people you bring in, the better this gets.')) +
    '<button class="btn block" style="margin-top:10px" data-a="invite">Invite someone to play</button>';
}
function findPlaces() {
  const list = S.venues.filter(v => pf.sport === 'all' || v.sports.includes(pf.sport)).sort((a, b) => dist(S.me, a) - dist(S.me, b));
  return sportChips('sport', pf, 'pfilt') + '<h2 class="h2">' + list.length + (list.length === 1 ? ' place' : ' places') + '</h2>' +
    (list.length ? list.map(v => '<div class="card" data-a="venue" data-id="' + v.id + '" style="cursor:pointer"><b>' + esc(v.name) + (v.verified ? ' (confirmed)' : '') + '</b><div class="meta"><span>' + esc(v.area) + '</span><span>' + Math.round(dist(S.me, v)) + ' miles</span>' + v.sports.map(id => SPORTS[id] ? '<span class="tag">' + esc(SPORTS[id].short) + '</span>' : '').join('') + '</div>' +
      '<div class="meta">' + (openSlots(v).length ? '<span class="tag live">' + openSlots(v).length + ' open times</span>' : '<span>No times posted</span>') + (v.booking_url ? '<span class="tag">Books on their site</span>' : '') + '</div></div>').join('')
      : empty('No places yet', 'Post a game somewhere and it gets listed here, or add one yourself.')) +
    '<button class="btn block" style="margin-top:10px" data-a="newvenue">Add a place</button>';
}
function viewFind() {
  const sg = (id, l) => '<button class="' + (fseg === id ? 'on' : '') + '" data-a="fseg" data-v="' + id + '">' + l + '</button>';
  return '<section class="pad"><h1 class="hero" style="margin-bottom:6px;font-size:32px">Find</h1><div class="seg">' + sg('games', 'Games') + sg('people', 'People') + sg('places', 'Places') + '</div>' +
    (fseg === 'people' ? findPeople() : fseg === 'places' ? findPlaces() : findGames()) + '</section>';
}
function sportsPicker() {
  const has = id => S.me.sp[id] != null;
  return '<div class="chips">' + onSports().map(s => '<button class="chip ' + (has(s.id) ? 'on' : '') + '" data-a="play" data-id="' + s.id + '" aria-pressed="' + has(s.id) + '">' + esc(s.short) + '</button>').join('') + '</div>' +
    mySports().map(s => '<span class="lab" style="margin-top:14px">' + esc(s.short) + ' level</span><div class="chips">' + s.levels.map((l, i) => '<button class="chip ' + (S.me.sp[s.id] === i ? 'on' : '') + '" data-a="lvl" data-id="' + s.id + '" data-v="' + i + '">' + esc(l) + '</button>').join('') + '</div>').join('');
}
function commChips(back) {
  const list = S.comms.filter(c => c.sports.some(s => SPORTS[s] && SPORTS[s].enabled));
  return '<div class="chips">' + list.map(c => '<button class="chip ' + (myComms().includes(c.id) ? 'on' : '') + '" data-a="ctog" data-id="' + c.id + '" aria-pressed="' + myComms().includes(c.id) + '">' + esc(c.name) + '</button>').join('') +
    '<button class="chip add" data-a="newcomm" data-back="' + (back || '') + '">+ Add a club or group</button></div>' +
    (list.length ? '' : '<p class="hint">Nobody has added yours yet. Add it and you are the first one in.</p>');
}
function viewProfile() {
  const m = S.me, stat = (n, l) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>';
  const up = myUpcoming();
  return '<section class="pad"><div class="profile-head">' + av(m, 'lg') + '<div><h1 style="font-size:26px;font-weight:800">' + esc(m.name || 'Your profile') + '</h1><div class="hint">' + esc(mySports().map(s => s.short).join(', ') || 'Pick your sports') + ' in ' + esc(m.area) + '</div></div></div>' +
    '<div class="stats">' + stat(up.length, 'Upcoming') + stat(up.filter(g => g.hostId === UID).length, 'Hosting') + stat(m.comms.length, 'Communities') + '</div>' +
    '<h2 class="h2">Your stats</h2>' + statsFor(UID) + (m.sp.golf != null ? '<button class="btn block" data-a="loground">Log a round</button>' : '') +
    '<label class="field"><span class="lab">Name</span><input class="inp" data-bind="me.name" value="' + esc(m.name) + '" autocomplete="name" maxlength="60"></label>' +
    '<label class="field"><span class="lab">Home area</span><select class="inp" data-bind="me.area">' + areaOpts(m.area) + '</select></label>' +
    '<h2 class="h2">Sports and levels</h2>' + sportsPicker() +
    '<label class="field"><span class="lab">Age range</span><select class="inp" data-bind="me.ageBand" data-num="1">' + BAND_LABELS.map((l, i) => '<option value="' + i + '"' + (m.ageBand === i ? ' selected' : '') + '>' + l + '</option>').join('') + '</select><span class="hint">Only used if a host turns on the age filter. Nobody else can see it.</span></label>' +
    '<h2 class="h2">Communities</h2>' + commChips('') +
    '<h2 class="h2">Pings you get</h2><p class="hint" style="margin:-4px 0 10px">You only hear about games that match all of this, and never more than 3 a day.</p>' +
    '<label class="toggle"><span>Alerts on this phone<small class="hint" style="display:block">On iPhone, add The Wire to your Home Screen first.</small></span><input type="checkbox" data-a="push"' + (pushOn ? ' checked' : '') + '></label>' +
    '<span class="lab" style="margin-top:12px">Days you can play</span><div class="chips">' + DOW.map((d, i) => '<button class="chip ' + (m.days.includes(i) ? 'on' : '') + '" data-a="dtog" data-d="' + i + '" aria-pressed="' + m.days.includes(i) + '">' + d + '</button>').join('') + '</div>' +
    '<label class="field"><span class="lab">Distance: <span id="rl">' + m.radius + ' miles</span></span><input type="range" min="5" max="50" step="5" value="' + m.radius + '" data-bind="me.radius" data-num="1" data-live="rl" data-unit=" miles"></label>' +
    '<p class="hint">Quiet hours are 9 PM to 7 AM Eastern, unless a game starts within two hours.</p>' +
    '<div style="margin-top:22px;display:grid;gap:10px"><p class="hint">Signed in as ' + esc(EMAIL) + '</p><button class="btn block ghost" data-a="signout">Sign out</button></div>' + POWERED + '</section>';
}

/* ===== sheets ===== */
function sheetShell(title, body, foot, lock) { return '<div class="backdrop"' + (lock ? '' : ' data-a="backdrop"') + '><div class="panel" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="phead"><h2>' + esc(title) + '</h2>' + (lock ? '' : '<button class="x" data-a="close" aria-label="Close">&times;</button>') + '</div><div class="sbody">' + body + '</div>' + (foot ? '<div class="sfoot">' + foot + '</div>' : '') + '</div></div>'; }
function rosterRow(p, g) { const me = p.id === UID; return '<div class="pl">' + av(p, 'sm') + '<div><b>' + esc(me ? (p.name || 'You') + ' (you)' : p.name || 'Player') + '</b><small>' + esc(SPORTS[g.sport].levels[lvlOf(p, g.sport)]) + (p.area ? ', ' + esc(p.area) : '') + '</small></div></div>'; }
const bookedFor = g => S.slots.find(s => S.bookings[s.id] && S.bookings[s.id].game_id === g.id);
function bookLink(g) { const v = g.venueId && venue(g.venueId); return v && v.booking_url ? ' <a href="' + esc(v.booking_url) + '" target="_blank" rel="noopener noreferrer">Book it</a>' : ''; }
function sheetGame(g) {
  const host = P(g.hostId), c = g.communityId ? C(g.communityId) : null, past = g.end < Date.now();
  const ids = s => Object.keys(g.rsvps).filter(k => g.rsvps[k] === s);
  const inn = ids('in').map(id => rosterRow(P(id), g)).join(''), maybe = ids('maybe').map(id => rosterRow(P(id), g)).join('');
  const silent = c ? Object.values(S.players).filter(p => p.comms.includes(c.id) && !g.rsvps[p.id]).map(p => first(p.name)) : [];
  const full = countIn(g) >= g.spots, mineIn = g.rsvps[UID] === 'in', isHost = g.hostId === UID;
  let body = '<div class="facts"><div class="fact"><b>When</b><span>' + dayLabel(g.start) + ', ' + timeLabel(g.start) + ' to ' + timeLabel(g.end) + (g.recurring ? ', every week' : '') + '</span></div>' +
    '<div class="fact"><b>Sport</b><span>' + esc(SPORTS[g.sport].name) + '</span></div><div class="fact"><b>Where</b><span>' + esc(g.place) + bookLink(g) + '</span></div><div class="fact"><b>Level</b><span>' + esc(levelText(g)) + '</span></div>' +
    '<div class="fact"><b>Host</b><span>' + esc(host.name || 'Player') + (isHost ? ' (you)' : '') + '</span></div>' +
    (g.ageBand != null ? '<div class="fact"><b>Ages</b><span>' + BAND_LABELS[g.ageBand] + ', set by the host</span></div>' : '') +
    (g.leagueId && L(g.leagueId) ? '<div class="fact"><b>League</b><span>' + esc(L(g.leagueId).name) + '</span></div>' : '') + (bookedFor(g) ? '<div class="fact"><b>Booked</b><span>' + esc(bookedFor(g).resource) + '</span></div>' : '') +
    (g.note ? '<div class="fact"><b>Note</b><span>' + esc(g.note) + '</span></div>' : '') + '</div>' + dots(g);
  if (!past) body += rsvpRow(g);
  if (sheet.askReason) body += '<div class="reasons"><b>Why are you dropping out?</b><div class="hint" style="margin-bottom:8px">One tap helps the host refill your spot.</div><div class="chips">' + ['Work', 'Injury', 'Family', 'Weather', 'Other'].map(r => '<button class="chip" data-a="reason" data-id="' + g.id + '" data-r="' + r + '">' + r + '</button>').join('') + '</div><button class="btn ghost" style="margin-top:10px" data-a="reason" data-id="' + g.id + '" data-r="">Skip</button></div>';
  if (full && !mineIn && !past) body += '<label class="toggle"><span>Ping me if a spot opens</span><input type="checkbox" data-a="watch" data-id="' + g.id + '"' + (g.watching ? ' checked' : '') + '></label>';
  body += '<h2 class="h2">In (' + ids('in').length + ')</h2>' + (inn || '<p class="hint">Nobody yet.</p>');
  if (maybe) body += '<h2 class="h2">Maybe</h2>' + maybe;
  if (silent.length) body += '<h2 class="h2">Haven\'t answered</h2><p class="hint">' + esc(silent.join(', ')) + '</p>';
  body += resultBlock(g);
  body += '<h2 class="h2">Thread</h2><div class="thread">' + (g.thread.length ? g.thread.map(m => m.sys ? '<div class="msg sys">' + esc(m.text) + '</div>' : '<div class="msg"><small>' + esc(m.by === UID ? 'You' : first(P(m.by).name)) + ', ' + ago(m.t) + '</small>' + esc(m.text) + '</div>').join('') : '<p class="hint">No messages yet.</p>') + '</div>' +
    '<div class="compose-row"><input class="inp" id="cmt" maxlength="500" placeholder="Say something to the group" aria-label="Message"><button class="btn solid" data-a="post">Send</button></div>';
  if (isHost && !past) body += '<button class="btn ghost block" style="margin-top:18px" data-a="cancel" data-id="' + g.id + '">' + (sheet.confirmCancel ? 'Tap again to cancel this game for everyone' : 'Cancel this game') + '</button>';
  const foot = '<div class="two"><button class="btn" data-a="share" data-id="' + g.id + '">Share</button><button class="btn" data-a="ics" data-id="' + g.id + '">Add to calendar</button></div>';
  return sheetShell(g.place, body, foot);
}
function sheetOnboard() {
  const m = S.me;
  const body = '<p class="hint" style="margin-bottom:4px">Under a minute. You can change all of this later.</p>' +
    '<label class="field"><span class="lab">Your name</span><input class="inp" data-bind="me.name" value="' + esc(m.name) + '" autocomplete="name" maxlength="60" placeholder="First and last, so people know who is coming"></label>' +
    '<span class="lab">What do you play?</span>' + sportsPicker() +
    '<div class="two"><label class="field"><span class="lab">Home area</span><select class="inp" data-bind="me.area">' + areaOpts(m.area) + '</select></label>' +
    '<label class="field"><span class="lab">Age range</span><select class="inp" data-bind="me.ageBand" data-num="1">' + BAND_LABELS.map((l, i) => '<option value="' + i + '"' + (m.ageBand === i ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
    '<span class="lab">Where do you play?</span>' + commChips('onboard');
  return sheetShell('Welcome to The Wire', body, '<button class="btn solid block" data-a="finish">Start playing</button>', true);
}
function sheetNewComm() {
  const types = [['club', 'Club'], ['league', 'League'], ['pickup', 'Pickup group']];
  const body = '<p class="hint" style="margin-bottom:4px">Add your club, league or regular group so you can schedule games for it.</p>' +
    '<label class="field"><span class="lab">Name</span><input class="inp" id="ncname" data-bind="nc.name" value="' + esc(nc.name) + '" maxlength="60" placeholder="Sunday morning crew"></label>' +
    '<span class="lab">What is it?</span><div class="chips">' + types.map(t => '<button class="chip ' + (nc.type === t[0] ? 'on' : '') + '" data-a="nctype" data-v="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
    '<label class="field"><span class="lab">Town</span><select class="inp" data-bind="nc.area">' + areaOpts(nc.area) + '</select></label>';
  return sheetShell('Add a club or group', body, '<div class="two"><button class="btn" data-a="ncback">Back</button><button class="btn solid" data-a="nccreate">Add it</button></div>', true);
}
function sheetCompose() {
  const d = draft, sp = SPORTS[d.sport], isB = d.mode === 'broadcast';
  const days = Array.from({length:7}, (_, i) => i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DOW[(new Date().getDay() + i) % 7]);
  const times = []; for (let h = 6; h <= 21; h++) { times.push(pad(h) + ':00'); times.push(pad(h) + ':30'); }
  const vs = S.venues.filter(v => v.sports.includes(d.sport)).sort((a, b) => dist(S.me, a) - dist(S.me, b));
  const myc = commsFor(d.sport).filter(c => myComms().includes(c.id)), none = !isB && !myc.length, lv = sp.levels;
  const body = '<div class="seg"><button class="' + (isB ? 'on' : '') + '" data-a="dmode" data-v="broadcast">Play now</button><button class="' + (!isB ? 'on' : '') + '" data-a="dmode" data-v="schedule">Schedule for a group</button></div>' +
    '<p class="hint" style="margin-bottom:6px">' + (isB ? 'Nearby people who play ' + esc(sp.short) + ' and fit the level get a ping with a Join button.' : 'Everyone in the group is notified. Members tap In or Out.') + '</p>' +
    '<span class="lab" style="margin-top:12px">Sport</span><div class="chips">' + onSports().map(s => '<button class="chip ' + (d.sport === s.id ? 'on' : '') + '" data-a="dsport" data-v="' + s.id + '">' + esc(s.short) + '</button>').join('') + '</div>' +
    '<span class="lab" style="margin-top:14px">Day</span><div class="chips">' + days.map((l, i) => '<button class="chip ' + (d.day === i ? 'on' : '') + '" data-a="dset" data-k="day" data-v="' + i + '">' + l + '</button>').join('') + '</div>' +
    '<div class="two"><label class="field"><span class="lab">Start</span><select class="inp" data-bind="draft.time">' + times.map(t => '<option value="' + t + '"' + (d.time === t ? ' selected' : '') + '>' + hhmmLabel(t) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="lab">Length</span><select class="inp" data-bind="draft.dur" data-num="1">' + sp.durations.map(x => '<option value="' + x + '"' + (d.dur === x ? ' selected' : '') + '>' + esc(durLabel(sp, x)) + '</option>').join('') + '</select></label></div>' +
    (none ? '<div class="card"><b>No group yet</b><p class="hint">Join or add a group for ' + esc(sp.short) + ' first, then schedule games for it.</p><button class="btn block" style="margin-top:8px" data-a="newcomm" data-back="compose">Add a club or group</button></div>'
      : (isB ? '' : '<label class="field" style="margin-top:0"><span class="lab">For which group</span><select class="inp" data-bind="draft.comm">' + myc.map(c => '<option value="' + c.id + '"' + (d.comm === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>') +
        '<label class="field" style="margin-top:0"><span class="lab">Where</span><select class="inp" data-bind="draft.place">' + vs.map(v => '<option value="' + v.id + '"' + (d.place === v.id ? ' selected' : '') + '>' + esc(v.name) + ', ' + esc(v.area) + '</option>').join('') + '<option value="area"' + (d.place === 'area' ? ' selected' : '') + '>Somewhere else</option></select></label>') +
    (d.place === 'area' ? '<div class="two"><label class="field" style="margin-top:0"><span class="lab">Name of the ' + esc(sp.place_word) + '</span><input class="inp" data-bind="draft.placeName" value="' + esc(d.placeName) + '" maxlength="80" placeholder="' + (d.sport === 'golf' ? 'Fresh Pond Golf Course' : 'Town ' + esc(sp.place_word) + 's') + '"></label><label class="field" style="margin-top:0"><span class="lab">Town</span><select class="inp" data-bind="draft.area">' + areaOpts(d.area) + '</select></label></div><p class="hint" style="margin:-6px 0 10px">It gets saved to Places so the next person can pick it.</p>' : '') +
    '<div class="two"><label class="field" style="margin-top:0"><span class="lab">' + (d.sport === 'golf' ? 'Group size' : 'Players total') + '</span><select class="inp" data-bind="draft.spots" data-num="1">' + sp.sizes.map(x => '<option' + (d.spots === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label><div class="hint" style="align-self:end;padding-bottom:14px">You count as one. Looking for ' + (d.spots - 1) + ' more.</div></div>' +
    '<div class="two"><label class="field"><span class="lab">Level from</span><select class="inp" data-bind="draft.lmin" data-num="1">' + lv.map((l, i) => '<option value="' + i + '"' + (d.lmin === i ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="lab">Level to</span><select class="inp" data-bind="draft.lmax" data-num="1">' + lv.map((l, i) => '<option value="' + i + '"' + (d.lmax === i ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label></div>' +
    (isB ? '<label class="toggle"><span>Only ping my age range (' + BAND_LABELS[S.me.ageBand] + ')<small class="hint" style="display:block">Optional. Smaller groups get fewer pings.</small></span><input type="checkbox" data-bind="draft.ageOn"' + (d.ageOn ? ' checked' : '') + '></label>' : '<label class="toggle"><span>Repeat every week</span><input type="checkbox" data-bind="draft.weekly"' + (d.weekly ? ' checked' : '') + '></label>') +
    '<label class="field"><span class="lab">Note (optional)</span><textarea class="inp" data-bind="draft.note" maxlength="500" placeholder="' + (d.sport === 'golf' ? 'Walking or riding. Any pace is fine.' : 'Anything people should know') + '">' + esc(d.note) + '</textarea></label>';
  return sheetShell(isB ? 'Play now' : 'Schedule a game', body, '<button class="btn solid block" data-a="submit"' + (d.busy || none ? ' disabled' : '') + '>' + (d.busy ? 'Posting' : isB ? 'Post and ping players' : 'Post to group') + '</button>');
}
function sheetNewVenue() {
  const body = '<p class="hint" style="margin-bottom:4px">Add a course, court or field. If it has an online booking page, add the link and people can book from the game.</p>' +
    '<label class="field"><span class="lab">Name</span><input class="inp" id="nvname" data-bind="nv.name" value="' + esc(nv.name) + '" maxlength="80"></label>' +
    '<label class="field"><span class="lab">Town</span><select class="inp" data-bind="nv.area">' + areaOpts(nv.area) + '</select></label>' +
    '<span class="lab">What can you play there?</span><div class="chips">' + onSports().map(s => '<button class="chip ' + (nv.sports.includes(s.id) ? 'on' : '') + '" data-a="nvsport" data-id="' + s.id + '">' + esc(s.short) + '</button>').join('') + '</div>' +
    '<label class="field"><span class="lab">Booking link (optional)</span><input class="inp" data-bind="nv.url" value="' + esc(nv.url) + '" inputmode="url" maxlength="300" placeholder="https://"></label>';
  return sheetShell('Add a place', body, '<div class="two"><button class="btn" data-a="nvback">Back</button><button class="btn solid" data-a="nvcreate">Add it</button></div>', true);
}
function sheetPings(g, pinged) {
  const n = pinged.length, hr = new Date().getHours(), quiet = (hr >= 21 || hr < 7) && g.start - Date.now() > 2 * HOUR;
  const line = p => '<div class="pl">' + av(p, 'sm') + '<div><b>' + esc(p.name || 'Player') + '</b><small>' + esc(SPORTS[g.sport].levels[lvlOf(p, g.sport)]) + ', ' + Math.round(dist(p, g)) + ' mi away</small></div></div>';
  let body = '<p style="font-size:17px;font-weight:600;margin-bottom:4px">' + (n ? 'Pinged ' + n + (n === 1 ? ' player' : ' players') + ' from your communities.' : quiet ? 'Posted. Pings are holding for quiet hours.' : 'Posted. Nobody in your communities matched yet.') + '</p>' +
    '<p class="hint">' + (quiet ? 'It is quiet hours, so matching players get pinged at 7 AM.' : 'In 15 minutes, if spots are still open, other nearby players who match get pinged too. Joins show up in Activity.') + '</p>' +
    '<div class="pingcard"><span class="pulse"></span><div><b>Play now</b><div class="hint">' + esc(first(S.me.name)) + ' wants to play at ' + esc(g.place) + ', ' + timeLabel(g.start) + '. ' + openSpots(g) + ' open.</div></div></div>';
  if (n) body += '<h2 class="h2">Pinged first</h2>' + pinged.map(id => line(P(id))).join('');
  body += '<button class="btn block" style="margin-top:16px" data-a="share" data-id="' + g.id + '">Share the link in a group chat too</button>';
  return sheetShell('Game posted', body, '<button class="btn solid block" data-a="close">Done</button>');
}
function renderSheet() {
  const root = $('#sheet-root'), prev = root.querySelector('.sbody'), top = prev ? prev.scrollTop : 0;
  let html = '';
  if (S && sheet) {
    const g = sheet.id ? gm(sheet.id) : null;
    if (sheet.name === 'game' && g) html = sheetGame(g);
    else if (sheet.name === 'onboard') html = sheetOnboard();
    else if (sheet.name === 'newcomm' && nc) html = sheetNewComm();
    else if (sheet.name === 'compose' && draft) html = sheetCompose();
    else if (sheet.name === 'newvenue' && nv) html = sheetNewVenue();
    else if (sheet.name === 'league') { const l = L(sheet.id); if (l) html = sheetLeague(l); else sheet = null; }
    else if (sheet.name === 'newleague' && nl) html = sheetNewLeague();
    else if (sheet.name === 'report' && rf) { const f = S.fixtures.find(x => x.id === sheet.id); if (f) html = sheetReport(f); else sheet = null; }
    else if (sheet.name === 'result' && rs && g) html = sheetResult(g);
    else if (sheet.name === 'round' && rd) html = sheetRound();
    else if (sheet.name === 'player') html = sheetPlayer(sheet.id);
    else if (sheet.name === 'venue') { const v = venue(sheet.id); if (v) html = sheetVenue(v); else sheet = null; }
    else if (sheet.name === 'book' && bk) { const s2 = S.slots.find(x => x.id === sheet.id); if (s2) html = sheetBook(s2); else sheet = null; }
    else if (sheet.name === 'pings' && g) html = sheetPings(g, sheet.pinged);
    else sheet = null;
  }
  root.innerHTML = html; document.body.classList.toggle('lock', !!html);
  const nb = root.querySelector('.sbody'); if (nb && prev) nb.scrollTop = top;
}
function render() {
  $('#app').className = 'shell ' + (booted && UID && S ? 'in' : 'out');
  const a = document.activeElement; let keep = null;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox' && a.type !== 'range') keep = {bind:a.dataset.bind, id:a.id, val:a.value, s:a.selectionStart, e:a.selectionEnd};
  if (!booted) $('#app').innerHTML = header() + '<main><div class="pad"><p class="hint" style="margin-top:40px">Loading</p></div></main>';
  else if (!UID || !S) { $('#app').innerHTML = header() + '<main>' + (UID ? '<div class="pad"><p class="hint" style="margin-top:40px">' + (loading ? 'Loading' : 'Could not load. Pull to refresh.') + '</p></div>' : viewAuth()) + '</main>'; $('#sheet-root').innerHTML = ''; document.body.classList.remove('lock'); }
  else {
    const v = {home:viewHome, schedule:viewSchedule, leagues:viewLeagues, find:viewFind, profile:viewProfile}[tab]();
    $('#app').innerHTML = header() + '<main class="v-' + tab + '">' + v + '</main>' + tabbar();
    renderSheet();
  }
  if (keep) { const el = keep.id ? document.getElementById(keep.id) : keep.bind ? document.querySelector('[data-bind="' + keep.bind + '"]') : null; if (el) { el.value = keep.val; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
}

/* ===== leagues, stats, booking ===== */
const STROKE = ['golf'];
const STATUS_WORD = {open:'Signing up', active:'In season', done:'Finished'};
const TIMES = Array.from({length:34}, (_, i) => pad(6 + Math.floor(i / 2)) + ':' + (i % 2 ? '30' : '00'));
const ymd = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const stamp = (date, time) => { const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };
const L = id => S.leagues.find(l => l.id === id);
const teamsOf = id => S.teams.filter(t => t.league_id === id);
const membersOf = tid => S.members.filter(m => m.team_id === tid).map(m => m.player_id);
const myTeam = id => { const m = S.members.find(x => x.league_id === id && x.player_id === UID); return m ? S.teams.find(t => t.id === m.team_id) : null; };
const isComm = l => l.commissioner_id === UID;
const fxOf = id => S.fixtures.filter(f => f.league_id === id);
const tname = id => (S.teams.find(t => t.id === id) || {name:'Team'}).name;
const mySide = f => { const t = myTeam(f.league_id); return !t ? null : t.id === f.home_team ? 'home' : t.id === f.away_team ? 'away' : null; };
const curL = () => L(sheet.name === 'league' ? sheet.id : sheet.back && sheet.back.name === 'league' ? sheet.back.id : null);
const isMgr = v => S.mgrs.some(m => m.venue_id === v.id && m.player_id === UID);
const openSlots = v => S.slots.filter(s => s.venue_id === v.id && !S.bookings[s.id] && Date.parse(s.starts_at) > Date.now());
const sub = (name, id, extra) => { sheet = Object.assign({name, id, back:sheet}, extra || {}); render(); };

function table(l) {
  const rows = new Map(teamsOf(l.id).map(t => [t.id, {t, p:0, w:0, l:0, d:0, f:0, a:0}]));
  fxOf(l.id).filter(f => f.status === 'confirmed').forEach(f => {
    const h = rows.get(f.home_team), a = rows.get(f.away_team); if (!h || !a) return;
    h.p++; a.p++; h.f += f.home_score; h.a += f.away_score; a.f += f.away_score; a.a += f.home_score;
    if (f.home_score > f.away_score) { h.w++; a.l++; } else if (f.home_score < f.away_score) { a.w++; h.l++; } else { h.d++; a.d++; }
  });
  return [...rows.values()].map(r => ({...r, pts:r.w * l.win_pts + r.d * l.tie_pts, diff:r.f - r.a})).sort((x, y) => y.pts - x.pts || y.diff - x.diff || x.t.name.localeCompare(y.t.name));
}

/* ---- league actions ---- */
async function createLeague() {
  const n = nl.name.trim(); if (n.length < 2) { toast('Give the league a name'); return; }
  const a = AREAS[nl.area];
  const {data, error} = await sb.from('leagues').insert({name:n.slice(0, 60), sport:nl.sport, area:nl.area, lat:a[0], lng:a[1], description:nl.desc.trim().slice(0, 500), mode:nl.mode, win_pts:nl.win, tie_pts:nl.tie, commissioner_id:UID}).select('id').single();
  if (fail(error, 'Could not start the league')) return;
  await loadAll(); nl = null; sheet = {name:'league', id:data.id, tab:'teams'}; history.replaceState(null, '', '#league/' + data.id); render(); toast('League started. Share the link so people can join');
}
async function createTeam(lid, name) {
  const {data, error} = await sb.from('league_teams').insert({league_id:lid, name:name.slice(0, 40), captain_id:UID}).select('id').single();
  if (error) { console.error(error); toast(/duplicate|unique/i.test(error.message) ? 'That name is taken in this league' : 'Could not join. Signup may be closed'); return false; }
  const r = await sb.from('team_members').insert({team_id:data.id, player_id:UID});
  if (fail(r.error, 'Could not join')) return false;
  await loadAll(); render(); return true;
}
async function joinTeam(tid) { const {error} = await sb.from('team_members').insert({team_id:tid, player_id:UID}); if (fail(error, 'Could not join. Signup may be closed')) return; await loadAll(); render(); toast('You are on the team'); }
async function leaveLeague(l) {
  const t = myTeam(l.id); if (!t) return;
  const left = await sb.from('team_members').delete().eq('team_id', t.id).eq('player_id', UID); if (fail(left.error, 'Could not leave')) return;
  if (membersOf(t.id).length <= 1) await sb.from('league_teams').delete().eq('id', t.id);
  await loadAll(); render(); toast('You left ' + l.name);
}
async function setStatus(l, v) { const {error} = await sb.from('leagues').update({status:v}).eq('id', l.id); if (fail(error, 'Could not change that')) return; l.status = v; render(); }
function fxDefaults(l) {
  const t = teamsOf(l.id);
  lf = Object.assign({date:ymd(Date.now() + DAY), time:'19:00', place:'', home:'', away:''}, lf || {});
  if (!t.some(x => x.id === lf.home)) lf.home = (t[0] || {}).id || '';
  if (!t.some(x => x.id === lf.away) || lf.away === lf.home) lf.away = (t.find(x => x.id !== lf.home) || {}).id || '';
}
async function addFixture(l) {
  fxDefaults(l);
  if (!lf.home || !lf.away || lf.home === lf.away) { toast('Pick two different teams'); return; }
  const place = (lf.place || '').trim() || l.area;
  const {error} = await sb.from('fixtures').insert({league_id:l.id, home_team:lf.home, away_team:lf.away, starts_at:new Date(stamp(lf.date, lf.time)).toISOString(), place:place.slice(0, 80)});
  if (fail(error, 'Could not add the game')) return; await loadAll(); render(); toast('Game added. Both teams were notified');
}
async function roundRobin(l) {
  const ids = teamsOf(l.id).map(t => t.id); if (ids.length < 2) { toast('Add at least two teams first'); return; }
  if (fxOf(l.id).length && !sheet.confirmRR) { sheet.confirmRR = true; render(); return; }
  fxDefaults(l);
  const place = (lf.place || '').trim() || l.area, start = stamp(lf.date, lf.time), arr = ids.slice(); if (arr.length % 2) arr.push(null);
  const n = arr.length, rows = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i]; if (!a || !b) continue;
      const d = new Date(start); d.setDate(d.getDate() + r * 7);
      rows.push({league_id:l.id, home_team:(r + i) % 2 ? b : a, away_team:(r + i) % 2 ? a : b, starts_at:d.toISOString(), place:place.slice(0, 80)});
    }
    arr.splice(1, 0, arr.pop());
  }
  const {error} = await sb.from('fixtures').insert(rows); if (fail(error, 'Could not build the season')) return;
  sheet.confirmRR = false; await loadAll(); sheet.tab = 'schedule'; render(); toast(rows.length + ' games scheduled');
}
async function deleteLeague(l) {
  if (!sheet.confirmDel) { sheet.confirmDel = true; render(); return; }
  const {error} = await sb.from('leagues').delete().eq('id', l.id); if (fail(error, 'Could not delete')) return;
  await loadAll(); sheet = null; history.replaceState(null, '', '#leagues'); render(); toast('League deleted');
}
async function submitScore() {
  const f = S.fixtures.find(x => x.id === rf.id), l = L(f.league_id);
  const h = parseInt(rf.h, 10), a = parseInt(rf.a, 10); if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { toast('Enter both scores'); return; }
  const {error} = await sb.from('fixtures').update({home_score:h, away_score:a, status:isComm(l) && rf.final ? 'confirmed' : 'pending'}).eq('id', f.id);
  if (fail(error, 'Could not save the score')) return;
  const fin = isComm(l) && rf.final; await loadAll(); rf = null; closeSheet(); toast(fin ? 'Saved as final' : 'Sent. The other team has to confirm');
}
async function settleFixture(id, status) {
  const {error} = await sb.from('fixtures').update({status}).eq('id', id); if (fail(error, 'Could not do that')) return;
  await loadAll(); render(); toast(status === 'confirmed' ? 'Confirmed' : 'Disputed. The commissioner has been told');
}
async function removeFixture(id) { const {error} = await sb.from('fixtures').delete().eq('id', id); if (fail(error, 'Could not remove it')) return; await loadAll(); render(); }

/* ---- casual results and rounds ---- */
function openResult(g) {
  const inn = Object.keys(g.rsvps).filter(k => g.rsvps[k] === 'in');
  rs = {id:g.id, a:[UID], b:[], sa:'', sb:'', inn};
  sub('result', g.id);
}
async function submitResult() {
  const sa = parseInt(rs.sa, 10), sb2 = parseInt(rs.sb, 10);
  if (!rs.a.length || !rs.b.length) { toast('Put at least one player on each side'); return; }
  if (isNaN(sa) || isNaN(sb2)) { toast('Enter both scores'); return; }
  const {error} = await sb.from('game_results').insert({game_id:rs.id, side_a:rs.a, side_b:rs.b, score_a:sa, score_b:sb2});
  if (fail(error, 'Could not save the result')) return;
  await loadAll(); rs = null; closeSheet(); toast('Sent. The other side has to confirm');
}
async function settleResult(id, status) { const {error} = await sb.from('game_results').update({status}).eq('game_id', id); if (fail(error, 'Could not do that')) return; await loadAll(); render(); toast(status === 'confirmed' ? 'Confirmed' : 'Marked disputed'); }
async function retractResult(id) { const {error} = await sb.from('game_results').delete().eq('game_id', id); if (fail(error, 'Could not retract')) return; await loadAll(); render(); }
function openRound(g) { rd = {game:g ? g.id : null, holes:18, strokes:'', date:ymd(g ? g.start : Date.now()), venue:g ? g.place : ''}; sub('round', g ? g.id : 'x'); }
async function submitRound() {
  const s = parseInt(rd.strokes, 10); if (isNaN(s) || s < 9 || s > 250) { toast('Enter your total strokes'); return; }
  const {error} = await sb.from('rounds').insert({sport:'golf', game_id:rd.game, venue_name:rd.venue.trim().slice(0, 80) || null, played_on:rd.date, holes:rd.holes, strokes:s});
  if (fail(error, 'Could not save the round')) return; await loadAll(); rd = null; closeSheet(); toast('Round saved');
}
async function vouch(id) { const {error} = await sb.from('rounds').update({attested_by:UID}).eq('id', id); if (fail(error, 'Could not vouch')) return; await loadAll(); render(); toast('Vouched'); }
async function deleteRound(id) { const {error} = await sb.from('rounds').delete().eq('id', id); if (fail(error, 'Could not delete')) return; await loadAll(); render(); }

/* ---- booking ---- */
async function doBook() {
  const s = S.slots.find(x => x.id === bk.slot), v = venue(s.venue_id); if (bk.busy) return; bk.busy = true; render();
  const {error} = await sb.from('slot_bookings').insert({slot_id:s.id, party_size:bk.size});
  if (error) { bk.busy = false; console.error(error); toast(/duplicate|unique/i.test(error.message) ? 'Someone just booked that time' : error.message); await loadAll(); render(); return; }
  if (bk.ping && bk.size >= 2 && bk.sport) {
    const l = lvlOf(S.me, bk.sport), start = Date.parse(s.starts_at);
    const g = await sb.from('games').insert({sport:bk.sport, host_id:UID, venue_id:v.id, place:(v.name + ', ' + s.resource).slice(0, 80), lat:v.lat, lng:v.lng, starts_at:s.starts_at, duration_min:s.duration_min, spots:bk.size, level_min:Math.max(0, l - 1), level_max:Math.min(3, l + 1), kind:'broadcast', note:'Booked: ' + s.resource}).select('id').single();
    if (!g.error) await sb.from('slot_bookings').update({game_id:g.data.id}).eq('slot_id', s.id); else console.error(g.error);
  }
  bk = null; await loadAll(); sheet = {name:'venue', id:v.id}; render(); toast('Booked. It is on your Home screen');
}
async function cancelBooking(slot) { const {error} = await sb.from('slot_bookings').delete().eq('slot_id', slot); if (fail(error, 'Could not cancel')) return; await loadAll(); render(); toast('Booking cancelled'); }
async function postSlots(v) {
  const res = sf.res.split(',').map(x => x.trim()).filter(Boolean).slice(0, 10); if (!res.length) { toast('Name at least one court, field or tee sheet'); return; }
  const from = stamp(sf.date, sf.from), to = stamp(sf.date, sf.to), step = sf.every * 60000, rows = [];
  for (const r of res) for (let t = from; t <= to && rows.length < 150; t += step) if (t > Date.now()) rows.push({venue_id:v.id, resource:r.slice(0, 40), starts_at:new Date(t).toISOString(), duration_min:sf.dur, capacity:sf.cap});
  if (!rows.length) { toast('Nothing to post. Check the times'); return; }
  const {error} = await sb.from('venue_slots').upsert(rows, {onConflict:'venue_id,resource,starts_at', ignoreDuplicates:true});
  if (fail(error, 'Could not post those times')) return; await loadAll(); render(); toast(rows.length + ' times posted');
}
async function deleteSlot(id) { const {error} = await sb.from('venue_slots').delete().eq('id', id); if (fail(error, 'Could not remove it')) return; await loadAll(); render(); }

/* ---- views ---- */
function leagueCard(l) {
  const n = teamsOf(l.id).length, mt = myTeam(l.id);
  return '<article class="card game" data-a="league" data-id="' + l.id + '"><div class="row"><div class="grow"><h3>' + esc(l.name) + '</h3><div class="meta"><span>' + esc(SPORTS[l.sport].name) + '</span><span>' + esc(l.area) + '</span><span>' + n + (l.mode === 'solo' ? (n === 1 ? ' player' : ' players') : (n === 1 ? ' team' : ' teams')) + '</span></div>' +
    '<div class="meta"><span class="tag' + (l.status === 'open' ? ' live' : '') + '">' + STATUS_WORD[l.status] + '</span>' + (isComm(l) ? '<span class="tag">You run this</span>' : '') + (mt && l.mode === 'teams' ? '<span class="tag">' + esc(mt.name) + '</span>' : '') + '</div></div></div></article>';
}
function viewLeagues() {
  const vis2 = S.leagues.filter(l => SPORTS[l.sport] && SPORTS[l.sport].enabled), mine = vis2.filter(l => isComm(l) || myTeam(l.id));
  const others = vis2.filter(l => !mine.includes(l) && l.status !== 'done' && dist(S.me, l) <= 60);
  return '<section class="pad"><h1 class="hero" style="margin-bottom:12px;font-size:32px">Leagues</h1>' +
    '<button class="btn solid block" data-a="newleague">Start a league</button>' +
    '<h2 class="h2">Your leagues</h2>' + (mine.length ? mine.map(leagueCard).join('') : empty('No leagues yet', 'Start one for your group, or join one below.')) +
    '<h2 class="h2">Open near you</h2>' + (others.length ? others.map(leagueCard).join('') : empty('Nothing nearby', 'Start the first one and share the link.')) + '</section>';
}
function standingsHtml(l) {
  const rows = table(l); if (!rows.length) return '<div style="margin-top:12px">' + empty('No teams yet', 'Standings show up once people join and scores are confirmed.') + '</div>';
  return '<table class="tbl"><thead><tr><th>#</th><th>' + (l.mode === 'solo' ? 'Player' : 'Team') + '</th><th>P</th><th>W</th><th>L</th><th>T</th><th>+/-</th><th>Pts</th></tr></thead><tbody>' +
    rows.map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(r.t.name) + '</td><td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.l + '</td><td>' + r.d + '</td><td>' + (r.diff > 0 ? '+' : '') + r.diff + '</td><td><b>' + r.pts + '</b></td></tr>').join('') + '</tbody></table>' +
    '<p class="hint">Only confirmed scores count.</p>';
}
function fxCard(f, l) {
  const g = f.game_id ? gm(f.game_id) : null, start = Date.parse(f.starts_at), side = mySide(f), comm = isComm(l), past = start <= Date.now();
  const h = tname(f.home_team), a = tname(f.away_team), sc = esc(h) + ' ' + f.home_score + ', ' + esc(a) + ' ' + f.away_score;
  const status = f.status === 'confirmed' ? '<b>Final: ' + sc + '</b>' : f.status === 'pending' ? sc + '. ' + (f.reported_by === UID ? 'Waiting for the other team to confirm.' : 'Waiting for confirmation.') : f.status === 'disputed' ? 'Score disputed. The commissioner will sort it out.' : (past ? 'Needs a score' : '');
  const canConfirm = f.status === 'pending' && (comm || (side && side !== f.reported_side));
  let btns = '';
  if (canConfirm) btns += '<button class="btn solid" data-a="fxok" data-id="' + f.id + '">Confirm</button><button class="btn" data-a="fxno" data-id="' + f.id + '">Dispute</button>';
  if ((side || comm) && past && (f.status === 'scheduled' || f.status === 'disputed' || comm)) btns += '<button class="btn" data-a="fxscore" data-id="' + f.id + '">' + (f.status === 'scheduled' ? 'Enter score' : 'Change score') + '</button>';
  if (comm) btns += '<button class="btn ghost" data-a="fxdel" data-id="' + f.id + '">' + (sheet.confirmFx === f.id ? 'Tap again to remove' : 'Remove') + '</button>';
  const member = side || comm;
  return '<div class="card"' + (g ? ' data-a="game" data-id="' + g.id + '" style="cursor:pointer"' : '') + '><div class="row"><div class="time"><b>' + timeLabel(start) + '</b><span>' + dayLabel(start) + '</span></div><div class="grow"><b>' + esc(h) + ' vs ' + esc(a) + '</b><div class="meta"><span>' + esc(f.place) + '</span></div>' + (status ? '<div class="hint" style="margin-top:6px">' + status + '</div>' : '') + '</div></div>' +
    (g && !past && side ? rsvpRow(g) : '') + (btns ? '<div class="acts">' + btns + '</div>' : '') + '</div>';
}
function scheduleHtml(l) {
  const fx = fxOf(l.id); if (!fx.length) return '<div style="margin-top:12px">' + empty('No games scheduled', isComm(l) ? 'Add games below, or build a full season in one tap.' : 'The commissioner has not scheduled games yet.') + '</div>';
  const up = fx.filter(f => f.status === 'scheduled' && Date.parse(f.starts_at) > Date.now() - HOUR), rest = fx.filter(f => !up.includes(f));
  return (up.length ? '<h2 class="h2">Coming up</h2>' + up.map(f => fxCard(f, l)).join('') : '') + (rest.length ? '<h2 class="h2">Played and to score</h2>' + rest.slice().reverse().map(f => fxCard(f, l)).join('') : '');
}
function teamsHtml(l) {
  const teams = teamsOf(l.id), mt = myTeam(l.id), open = l.status === 'open';
  let h = '';
  if (!mt && open) h += l.mode === 'solo' ? '<button class="btn solid block" style="margin:12px 0" data-a="joinsolo">Join this league</button>' : '<span class="lab" style="margin-top:12px">Start a team</span><div class="compose-row"><input class="inp" id="tfname" data-bind="tf.name" maxlength="40" placeholder="Team name" value="' + esc(tf.name) + '"><button class="btn solid" data-a="mkteam">Create</button></div><p class="hint">Or join one below.</p>';
  if (!mt && !open) h += '<p class="hint" style="margin-top:12px">Signup is closed.</p>';
  h += teams.length ? teams.map(t => '<div class="card"><b>' + esc(t.name) + '</b>' + (mt && mt.id === t.id ? ' <span class="tag">You</span>' : '') + (l.mode === 'teams' ? '<div class="hint">' + esc(membersOf(t.id).map(id => first(P(id).name)).join(', ')) + '</div>' : '') +
    (!mt && open && l.mode === 'teams' ? '<button class="btn" style="margin-top:8px" data-a="jointeam" data-id="' + t.id + '">Join this team</button>' : '') + '</div>').join('') : empty('Nobody yet', 'Share the link so people can join.');
  if (mt) h += '<button class="btn ghost block" style="margin-top:8px" data-a="leaveleague">Leave league</button>';
  return h;
}
function commHtml(l) {
  fxDefaults(l); const teams = teamsOf(l.id);
  const opts = sel => teams.map(t => '<option value="' + t.id + '"' + (sel === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('');
  return '<h2 class="h2">Commissioner tools</h2><span class="lab">Season</span><div class="chips">' + ['open', 'active', 'done'].map(s => '<button class="chip ' + (l.status === s ? 'on' : '') + '" data-a="lstatus" data-v="' + s + '">' + STATUS_WORD[s] + '</button>').join('') + '</div><p class="hint">Signing up lets anyone join. Starting the season closes signup.</p>' +
    '<h2 class="h2" style="font-size:15px">Schedule games</h2>' + (teams.length < 2 ? '<p class="hint">You need at least two ' + (l.mode === 'solo' ? 'players' : 'teams') + ' first.</p>' :
      '<div class="two"><label class="field" style="margin-top:0"><span class="lab">Date</span><input type="date" class="inp" data-bind="lf.date" value="' + lf.date + '"></label><label class="field" style="margin-top:0"><span class="lab">Time</span><select class="inp" data-bind="lf.time">' + TIMES.map(t => '<option value="' + t + '"' + (lf.time === t ? ' selected' : '') + '>' + hhmmLabel(t) + '</option>').join('') + '</select></label></div>' +
      '<label class="field" style="margin:10px 0"><span class="lab">Place</span><input class="inp" data-bind="lf.place" maxlength="80" placeholder="' + esc(l.area) + '" value="' + esc(lf.place) + '"></label>' +
      '<div class="two"><label class="field" style="margin-top:0"><span class="lab">Home</span><select class="inp" data-bind="lf.home">' + opts(lf.home) + '</select></label><label class="field" style="margin-top:0"><span class="lab">Away</span><select class="inp" data-bind="lf.away">' + opts(lf.away) + '</select></label></div>' +
      '<button class="btn block" data-a="addfx">Add this game</button><button class="btn block" style="margin-top:8px" data-a="roundrobin">' + (sheet.confirmRR ? 'Tap again to add a full season on top of the existing games' : 'Build a full season (everyone plays everyone, weekly)') + '</button>') +
    '<button class="btn ghost block" style="margin-top:16px" data-a="delleague">' + (sheet.confirmDel ? 'Tap again to delete the league for good' : 'Delete league') + '</button>';
}
function sheetLeague(l) {
  const tab = sheet.tab || 'standings', comm = isComm(l), sg = (id, t) => '<button class="' + (tab === id ? 'on' : '') + '" data-a="ltab" data-v="' + id + '">' + t + '</button>';
  const body = '<p class="hint" style="margin:0 0 6px">' + esc(SPORTS[l.sport].name) + ', ' + esc(l.area) + '. ' + (l.mode === 'solo' ? 'Individuals' : 'Teams') + '. Run by ' + esc(comm ? 'you' : first(P(l.commissioner_id).name)) + '. ' + l.win_pts + ' points a win, ' + l.tie_pts + ' a tie.</p>' + (l.description ? '<p style="margin:6px 0">' + esc(l.description) + '</p>' : '') +
    '<div class="seg">' + sg('standings', 'Standings') + sg('schedule', 'Schedule') + sg('teams', l.mode === 'solo' ? 'Players' : 'Teams') + '</div>' +
    (tab === 'standings' ? standingsHtml(l) : tab === 'schedule' ? scheduleHtml(l) : teamsHtml(l)) + (comm ? commHtml(l) : '');
  return sheetShell(l.name, body, '<button class="btn block" data-a="lshare">Share this league</button>');
}
function sheetNewLeague() {
  const sp = SPORTS[nl.sport];
  const body = '<p class="hint" style="margin-bottom:4px">Run a league for your group. Anyone with the link can join while signup is open.</p>' +
    '<label class="field"><span class="lab">League name</span><input class="inp" id="nlname" data-bind="nl.name" maxlength="60" value="' + esc(nl.name) + '" placeholder="Tuesday night softball"></label>' +
    '<span class="lab">Sport</span><div class="chips">' + onSports().map(s => '<button class="chip ' + (nl.sport === s.id ? 'on' : '') + '" data-a="nlsport" data-id="' + s.id + '">' + esc(s.short) + '</button>').join('') + '</div>' +
    '<span class="lab" style="margin-top:14px">Format</span><div class="seg"><button class="' + (nl.mode === 'teams' ? 'on' : '') + '" data-a="nlmode" data-v="teams">Teams</button><button class="' + (nl.mode === 'solo' ? 'on' : '') + '" data-a="nlmode" data-v="solo">Individuals</button></div>' +
    '<label class="field"><span class="lab">Town</span><select class="inp" data-bind="nl.area">' + areaOpts(nl.area) + '</select></label>' +
    '<div class="two"><label class="field" style="margin-top:0"><span class="lab">Points for a win</span><select class="inp" data-bind="nl.win" data-num="1">' + [1, 2, 3].map(x => '<option' + (nl.win === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label><label class="field" style="margin-top:0"><span class="lab">Points for a tie</span><select class="inp" data-bind="nl.tie" data-num="1">' + [0, 1].map(x => '<option' + (nl.tie === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label></div>' +
    '<label class="field"><span class="lab">About (optional)</span><textarea class="inp" data-bind="nl.desc" maxlength="500" placeholder="Slow pitch, 10 weeks, bring a glove">' + esc(nl.desc) + '</textarea></label>';
  return sheetShell('Start a league', body, '<button class="btn solid block" data-a="nlcreate">Start ' + esc(sp.short.toLowerCase()) + ' league</button>');
}
function sheetReport(f) {
  const h = tname(f.home_team), a = tname(f.away_team), comm = isComm(L(f.league_id));
  const body = '<p class="hint" style="margin-bottom:8px">' + (comm ? 'As commissioner you can mark it final right away.' : 'The other team has to confirm before it counts.') + '</p>' +
    '<div class="two"><label class="field" style="margin-top:0"><span class="lab">' + esc(h) + '</span><input class="inp" type="number" inputmode="numeric" min="0" max="999" data-bind="rf.h" value="' + esc(rf.h) + '"></label><label class="field" style="margin-top:0"><span class="lab">' + esc(a) + '</span><input class="inp" type="number" inputmode="numeric" min="0" max="999" data-bind="rf.a" value="' + esc(rf.a) + '"></label></div>' +
    (comm ? '<label class="toggle"><span>Mark as final</span><input type="checkbox" data-bind="rf.final"' + (rf.final ? ' checked' : '') + '></label>' : '');
  return sheetShell('Enter the score', body, '<button class="btn solid block" data-a="fxsend">Save score</button>');
}
function sheetResult(g) {
  const side = id => rs.a.includes(id) ? 'a' : rs.b.includes(id) ? 'b' : '';
  const row = id => '<div class="pl"><div class="grow"><b>' + esc(id === UID ? (P(id).name || 'You') + ' (you)' : P(id).name || 'Player') + '</b></div><div class="chips"><button class="chip ' + (side(id) === 'a' ? 'on' : '') + '" data-a="rside" data-p="' + id + '" data-s="a">Side A</button><button class="chip ' + (side(id) === 'b' ? 'on' : '') + '" data-a="rside" data-p="' + id + '" data-s="b">Side B</button></div></div>';
  const body = '<p class="hint" style="margin-bottom:8px">Put each player on a side, then enter the score. Someone on the other side confirms it, and then it counts toward everyone\'s stats.</p>' + rs.inn.map(row).join('') +
    '<div class="two" style="margin-top:12px"><label class="field" style="margin-top:0"><span class="lab">Side A score</span><input class="inp" type="number" inputmode="numeric" min="0" max="999" data-bind="rs.sa" value="' + esc(rs.sa) + '"></label><label class="field" style="margin-top:0"><span class="lab">Side B score</span><input class="inp" type="number" inputmode="numeric" min="0" max="999" data-bind="rs.sb" value="' + esc(rs.sb) + '"></label></div>';
  return sheetShell('Record the result', body, '<button class="btn solid block" data-a="rsubmit">Send for confirmation</button>');
}
function sheetRound() {
  const body = '<div class="seg"><button class="' + (rd.holes === 9 ? 'on' : '') + '" data-a="rdholes" data-v="9">9 holes</button><button class="' + (rd.holes === 18 ? 'on' : '') + '" data-a="rdholes" data-v="18">18 holes</button></div>' +
    '<label class="field"><span class="lab">Total strokes</span><input class="inp" type="number" inputmode="numeric" min="9" max="250" data-bind="rd.strokes" value="' + esc(rd.strokes) + '"></label>' +
    '<div class="two"><label class="field" style="margin-top:0"><span class="lab">Date</span><input type="date" class="inp" data-bind="rd.date" value="' + rd.date + '"></label><label class="field" style="margin-top:0"><span class="lab">Course</span><input class="inp" data-bind="rd.venue" maxlength="80" value="' + esc(rd.venue) + '"></label></div>' +
    '<p class="hint">' + (rd.game ? 'Someone who played in the same round can vouch for it.' : 'This round is not tied to a game, so nobody can vouch for it.') + '</p>';
  return sheetShell('Log a round', body, '<button class="btn solid block" data-a="rdsave">Save round</button>');
}
function roundsFor(pid) { return S.rounds.filter(r => r.player_id === pid && r.sport === 'golf'); }
function roundsBlock(g, iAm) {
  const rs2 = S.rounds.filter(r => r.game_id === g.id), mineR = rs2.some(r => r.player_id === UID);
  return '<h2 class="h2">Scores</h2>' + (rs2.length ? rs2.map(r => '<div class="pl"><div class="grow"><b>' + esc(r.player_id === UID ? 'You' : first(P(r.player_id).name)) + ': ' + r.strokes + '</b><small>' + r.holes + ' holes' + (r.attested_by ? ', vouched by ' + esc(r.attested_by === UID ? 'you' : first(P(r.attested_by).name)) : '') + '</small></div>' + (iAm && r.player_id !== UID && !r.attested_by ? '<button class="btn" data-a="vouch" data-id="' + r.id + '">Vouch</button>' : '') + '</div>').join('') : '<p class="hint">No scores yet.</p>') +
    (iAm && !mineR ? '<button class="btn block" style="margin-top:8px" data-a="rdopen" data-id="' + g.id + '">Log my round</button>' : '');
}
function resultBlock(g) {
  if (g.start > Date.now()) return '';
  if (g.leagueId) return S.fixtures.some(x => x.game_id === g.id) ? '<h2 class="h2">Score</h2><p class="hint">Scored on the league page.</p><button class="btn block" data-a="league" data-id="' + g.leagueId + '">Open the league</button>' : '';
  const iAm = g.rsvps[UID] === 'in';
  if (STROKE.includes(g.sport)) return roundsBlock(g, iAm);
  const r = S.results[g.id];
  if (!r) return iAm && countIn(g) >= 2 ? '<h2 class="h2">Result</h2><button class="btn block" data-a="rres" data-id="' + g.id + '">Record the result</button>' : '';
  const nm = ids => ids.map(id => id === UID ? 'You' : first(P(id).name)).join(', ');
  const inA = r.side_a.includes(UID), inB = r.side_b.includes(UID), settle = r.status === 'pending' && ((inA && r.side_b.includes(r.reported_by)) || (inB && r.side_a.includes(r.reported_by)));
  return '<h2 class="h2">Result</h2><div class="card"><div class="two"><div class="stat"><b>' + r.score_a + '</b><span>' + esc(nm(r.side_a)) + '</span></div><div class="stat"><b>' + r.score_b + '</b><span>' + esc(nm(r.side_b)) + '</span></div></div><p class="hint">' + ({pending:'Waiting for the other side to confirm.', confirmed:'Confirmed. Counts toward stats.', disputed:'Disputed. Not counted.'})[r.status] + '</p>' +
    (settle ? '<div class="acts"><button class="btn solid" data-a="rok" data-id="' + g.id + '">Confirm</button><button class="btn" data-a="rno" data-id="' + g.id + '">Dispute</button></div>' : '') +
    (r.reported_by === UID && r.status !== 'confirmed' ? '<button class="btn ghost" style="margin-top:8px" data-a="rdel" data-id="' + g.id + '">Retract</button>' : '') + '</div>';
}
function statsFor(pid) {
  const st = S.stats[pid] || {}, p = P(pid), mine2 = p.sp || {};
  const ids = [...new Set([...Object.keys(mine2), ...Object.keys(st)])].filter(id => SPORTS[id]).sort((a, b) => SPORTS[a].sort - SPORTS[b].sort);
  if (!ids.length) return '<p class="hint">No stats yet. Play a game and they start to build.</p>';
  const tile = (n, l) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>';
  return ids.map(id => {
    const s = st[id] || {played:0, hosted:0, wins:0, losses:0, ties:0}, sp = SPORTS[id], dec = s.wins + s.losses + s.ties;
    let t = tile(s.played, 'Played') + tile(s.hosted, 'Hosted');
    let extra = '';
    if (STROKE.includes(id)) {
      const rr = roundsFor(pid), r18 = rr.filter(r => r.holes === 18);
      t += tile(rr.length, 'Rounds') + tile(r18.length ? (Math.round(r18.reduce((a, r) => a + r.strokes, 0) / r18.length * 10) / 10) : '-', 'Avg 18') + tile(r18.length ? Math.min(...r18.map(r => r.strokes)) : '-', 'Best 18') + tile(rr.filter(r => r.attested_by).length, 'Vouched');
      extra = rr.slice(0, 5).map(r => '<div class="pl"><div class="grow"><b>' + r.strokes + '</b> <span class="hint">' + r.holes + ' holes' + (r.venue_name ? ', ' + esc(r.venue_name) : '') + ', ' + esc(new Date(r.played_on + 'T12:00').toLocaleDateString(undefined, {month:'short', day:'numeric'})) + (r.attested_by ? ' (vouched)' : '') + '</span></div>' + (pid === UID ? '<button class="x" data-a="rounddel" data-id="' + r.id + '" aria-label="Delete round">&times;</button>' : '') + '</div>').join('');
    } else {
      t += tile(s.wins + '-' + s.losses + (s.ties ? '-' + s.ties : ''), 'Record') + tile(dec ? Math.round(s.wins / dec * 100) + '%' : '-', 'Win rate');
    }
    return '<div class="card"><b>' + esc(sp.name) + '</b>' + (mine2[id] != null ? '<span class="hint"> ' + esc(sp.levels[mine2[id]]) + '</span>' : '') + '<div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(84px,1fr));margin:10px 0 0">' + t + '</div>' + extra + '</div>';
  }).join('');
}
function sheetPlayer(pid) {
  const p = P(pid), d = Math.round(dist(S.me, p));
  const body = '<div class="profile-head">' + av(p, 'lg') + '<div><h1 style="font-size:24px;font-weight:800">' + esc(p.name || 'Player') + '</h1><div class="hint">' + esc(p.area || '') + (pid === UID ? '' : ', ' + d + ' miles away') + '</div></div></div>' +
    '<h2 class="h2">Stats</h2>' + statsFor(pid);
  return sheetShell(p.name || 'Player', body, '');
}
function slotRow(s, v) {
  const b = S.bookings[s.id], start = Date.parse(s.starts_at), mgr = isMgr(v), mineB = b && b.booked_by === UID;
  const right = b ? '<span class="tag">' + (mineB ? 'Yours' : 'Booked') + '</span>' + (mineB || mgr ? '<button class="btn ghost" data-a="slotcancel" data-id="' + s.id + '">Cancel</button>' : '') : '<button class="btn solid" data-a="slotbook" data-id="' + s.id + '">Book</button>' + (mgr ? '<button class="x" data-a="slotdel" data-id="' + s.id + '" aria-label="Remove time">&times;</button>' : '');
  return '<div class="pl"><div class="grow"><b>' + timeLabel(start) + ', ' + esc(s.resource) + '</b><small>' + esc(durLabel(SPORTS[v.sports.find(x => SPORTS[x])] || {durations:[], duration_labels:null}, s.duration_min)) + ', up to ' + s.capacity + ' people' + (b && mgr && !mineB ? ', booked by ' + esc(first(P(b.booked_by).name)) : '') + '</small></div><div class="chips" style="flex-wrap:nowrap;align-items:center">' + right + '</div></div>';
}
function sheetVenue(v) {
  const mgr = isMgr(v), slots = S.slots.filter(s => s.venue_id === v.id && Date.parse(s.starts_at) > Date.now());
  const byDay = new Map(); slots.forEach(s => { const k = dayLabel(Date.parse(s.starts_at)); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(s); });
  if (mgr && !sf) sf = {res:'Court 1', date:ymd(Date.now() + DAY), from:'17:00', to:'21:00', every:90, dur:90, cap:4};
  const body = '<div class="meta" style="margin-top:0"><span>' + esc(v.area) + '</span><span>' + Math.round(dist(S.me, v)) + ' miles</span>' + v.sports.map(id => SPORTS[id] ? '<span class="tag">' + esc(SPORTS[id].short) + '</span>' : '').join('') + '</div>' +
    '<p class="hint">' + (v.verified ? 'Times posted by the venue.' : 'Times are posted by whoever manages this place on The Wire. Check with the venue for anything important.') + '</p>' +
    (v.booking_url ? '<a class="btn block" style="margin:8px 0" href="' + esc(v.booking_url) + '" target="_blank" rel="noopener noreferrer">Book on their website</a>' : '') +
    '<h2 class="h2">Open times</h2>' + (slots.length ? [...byDay.entries()].map(([k, arr]) => '<h3 style="font-size:14px;margin:12px 0 2px;color:var(--ink2)">' + k + '</h3>' + arr.map(s => slotRow(s, v)).join('')).join('') : empty('No times posted', mgr ? 'Post some below.' : 'Nobody has posted times here yet.')) +
    (mgr ? '<h2 class="h2">Post times</h2><p class="hint" style="margin-bottom:8px">One day at a time. Separate several courts or fields with commas.</p>' +
      '<label class="field" style="margin-top:0"><span class="lab">Courts, fields or tee sheets</span><input class="inp" data-bind="sf.res" maxlength="120" value="' + esc(sf.res) + '"></label>' +
      '<div class="two"><label class="field" style="margin-top:0"><span class="lab">Date</span><input type="date" class="inp" data-bind="sf.date" value="' + sf.date + '"></label><label class="field" style="margin-top:0"><span class="lab">Every</span><select class="inp" data-bind="sf.every" data-num="1">' + [10, 15, 30, 45, 60, 90, 120].map(x => '<option value="' + x + '"' + (sf.every === x ? ' selected' : '') + '>' + x + ' min</option>').join('') + '</select></label></div>' +
      '<div class="two" style="margin-top:10px"><label class="field" style="margin-top:0"><span class="lab">First start</span><select class="inp" data-bind="sf.from">' + TIMES.map(t => '<option value="' + t + '"' + (sf.from === t ? ' selected' : '') + '>' + hhmmLabel(t) + '</option>').join('') + '</select></label><label class="field" style="margin-top:0"><span class="lab">Last start</span><select class="inp" data-bind="sf.to">' + TIMES.map(t => '<option value="' + t + '"' + (sf.to === t ? ' selected' : '') + '>' + hhmmLabel(t) + '</option>').join('') + '</select></label></div>' +
      '<div class="two" style="margin-top:10px"><label class="field" style="margin-top:0"><span class="lab">Length</span><select class="inp" data-bind="sf.dur" data-num="1">' + [30, 60, 90, 120, 180, 270].map(x => '<option value="' + x + '"' + (sf.dur === x ? ' selected' : '') + '>' + x + ' min</option>').join('') + '</select></label><label class="field" style="margin-top:0"><span class="lab">Holds up to</span><select class="inp" data-bind="sf.cap" data-num="1">' + [1, 2, 3, 4, 6, 8, 12, 20].map(x => '<option' + (sf.cap === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label></div>' +
      '<button class="btn block" style="margin-top:12px" data-a="postslots">Post these times</button>' : '');
  return sheetShell(v.name + (v.verified ? ' (confirmed)' : ''), body, '');
}
function sheetBook(s) {
  const v = venue(s.venue_id), sports = v.sports.filter(id => SPORTS[id] && SPORTS[id].enabled), start = Date.parse(s.starts_at);
  if (!bk.sport || !sports.includes(bk.sport)) bk.sport = sports.find(id => S.me.sp[id] != null) || sports[0];
  const body = '<div class="facts"><div class="fact"><b>Where</b><span>' + esc(v.name) + ', ' + esc(s.resource) + '</span></div><div class="fact"><b>When</b><span>' + dayLabel(start) + ', ' + timeLabel(start) + ' to ' + timeLabel(start + s.duration_min * 60000) + '</span></div></div>' +
    '<label class="field"><span class="lab">How many are you?</span><select class="inp" data-bind="bk.size" data-num="1">' + Array.from({length:s.capacity}, (_, i) => '<option' + (bk.size === i + 1 ? ' selected' : '') + '>' + (i + 1) + '</option>').join('') + '</select></label>' +
    (bk.size >= 2 && sports.length ? '<label class="toggle"><span>Ping nearby players to fill it<small class="hint" style="display:block">Posts a Play now game for this time and place.</small></span><input type="checkbox" data-bind="bk.ping"' + (bk.ping ? ' checked' : '') + '></label>' +
      (bk.ping && sports.length > 1 ? '<div class="chips" style="margin-bottom:8px">' + sports.map(id => '<button class="chip ' + (bk.sport === id ? 'on' : '') + '" data-a="bksport" data-id="' + id + '">' + esc(SPORTS[id].short) + '</button>').join('') + '</div>' : '') : '') +
    '<p class="hint">You can cancel any time from this screen.</p>';
  return sheetShell('Book this time', body, '<button class="btn solid block" data-a="bkgo"' + (bk.busy ? ' disabled' : '') + '>' + (bk.busy ? 'Booking' : 'Book it') + '</button>');
}
function myBookings() { return S.slots.filter(s => S.bookings[s.id] && S.bookings[s.id].booked_by === UID && Date.parse(s.starts_at) > Date.now()); }

/* ===== events ===== */
const H = {
  tab: el => setTab(el.dataset.t),
  compose: el => openCompose(el.dataset.m || 'broadcast'),
  close: () => closeSheet(),
  backdrop: (el, e) => { if (e.target === el) closeSheet(); },
  game: el => openGame(el.dataset.id),
  rsvp: el => rsvp(el.dataset.id, el.dataset.s),
  reason: el => { const g = gm(el.dataset.id); sheet = {name:'game', id:g.id}; applyRsvp(g, 'out', el.dataset.r); },
  watch: async el => { const g = gm(el.dataset.id); g.watching = el.checked; const r = el.checked ? await sb.from('watchers').upsert({game_id:g.id, player_id:UID}) : await sb.from('watchers').delete().eq('game_id', g.id).eq('player_id', UID); if (!fail(r.error)) toast(el.checked ? "We'll ping you if a spot opens" : 'Watch removed'); },
  share: el => copyLink(gm(el.dataset.id)),
  ics: el => icsFor(gm(el.dataset.id)),
  post: async () => { const i = $('#cmt'), v = i.value.trim(); if (!v) return; const g = gm(sheet.id); i.value = ''; g.thread.push({by:UID, text:v, t:Date.now()}); render(); fail((await sb.from('messages').insert({game_id:g.id, player_id:UID, body:v.slice(0, 500)})).error, 'Message did not send'); },
  cancel: async el => { if (!sheet.confirmCancel) { sheet.confirmCancel = true; render(); return; } const {error} = await sb.from('games').delete().eq('id', el.dataset.id); if (fail(error, 'Could not cancel')) return; S.games = S.games.filter(g => g.id !== el.dataset.id); closeSheet(); toast('Game cancelled'); },
  seg: el => { seg = el.dataset.v; render(); },
  filt: el => { F[el.dataset.k] = el.dataset.v; render(); },
  dset: el => { const v = el.dataset.v; draft[el.dataset.k] = /^\d+$/.test(v) ? Number(v) : v; render(); },
  dmode: el => { draft.mode = el.dataset.v; render(); },
  dsport: el => { draftFor(draft, el.dataset.v); render(); },
  submit: () => submitCompose(),
  fseg: el => { fseg = el.dataset.v; render(); },
  pfilt: el => { pf.sport = el.dataset.v; render(); },
  play: el => togglePlay(el.dataset.id),
  lvl: el => setLvl(el.dataset.id, Number(el.dataset.v)),
  newvenue: el => { const b = el.dataset.back; nv = {name:'', area:S.me.area, sports:pf.sport !== 'all' ? [pf.sport] : [], url:'', back:b ? {name:b} : null}; sheet = {name:'newvenue'}; render(); },
  nvsport: el => { const i = nv.sports.indexOf(el.dataset.id); if (i < 0) nv.sports.push(el.dataset.id); else nv.sports.splice(i, 1); render(); },
  nvback: () => { sheet = nv.back || null; nv = null; render(); },
  nvcreate: () => createVenue(),
  invite: () => inviteFriends(),
  league: el => { const id = el.dataset.id; if (!L(id)) return; lf = null; sheet = {name:'league', id, tab:'standings'}; history.replaceState(null, '', '#league/' + id); render(); },
  newleague: () => { const sp = mySports()[0] || onSports()[0]; nl = {name:'', sport:sp.id, area:S.me.area, mode:'teams', win:2, tie:1, desc:''}; sheet = {name:'newleague'}; render(); },
  nlsport: el => { nl.sport = el.dataset.id; render(); },
  nlmode: el => { nl.mode = el.dataset.v; render(); },
  nlcreate: () => createLeague(),
  ltab: el => { sheet.tab = el.dataset.v; render(); },
  joinsolo: () => { const l = curL(), base = S.me.name.trim() || 'Player'; let name = base, i = 2; while (teamsOf(l.id).some(t => t.name.toLowerCase() === name.toLowerCase())) name = base + ' ' + i++; createTeam(l.id, name).then(ok => ok && toast('You are in')); },
  mkteam: () => { const l = curL(), n = tf.name.trim(); if (!n) { toast('Name your team'); return; } createTeam(l.id, n).then(ok => { if (ok) { tf.name = ''; render(); toast('Team created'); } }); },
  jointeam: el => joinTeam(el.dataset.id),
  leaveleague: () => leaveLeague(curL()),
  lstatus: el => setStatus(curL(), el.dataset.v),
  addfx: () => addFixture(curL()),
  roundrobin: () => roundRobin(curL()),
  delleague: () => deleteLeague(curL()),
  lshare: () => { const l = curL(), url = location.href.split('#')[0].split('?')[0] + '#league/' + l.id; if (navigator.share) { navigator.share({title:l.name, text:'Join ' + l.name + ' on The Wire:', url}).catch(() => {}); return; } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Link copied. Paste it in any chat'), () => toast(url)); else toast(url); },
  fxscore: el => { const f = S.fixtures.find(x => x.id === el.dataset.id); rf = {id:f.id, h:f.home_score == null ? '' : String(f.home_score), a:f.away_score == null ? '' : String(f.away_score), final:false}; sub('report', f.id); },
  fxsend: () => submitScore(),
  fxok: el => settleFixture(el.dataset.id, 'confirmed'),
  fxno: el => settleFixture(el.dataset.id, 'disputed'),
  fxdel: el => { if (sheet.confirmFx !== el.dataset.id) { sheet.confirmFx = el.dataset.id; render(); return; } sheet.confirmFx = null; removeFixture(el.dataset.id); },
  rres: el => openResult(gm(el.dataset.id)),
  rside: el => { const id = el.dataset.p, side = el.dataset.s, cur = rs.a.includes(id) ? 'a' : rs.b.includes(id) ? 'b' : ''; rs.a = rs.a.filter(x => x !== id); rs.b = rs.b.filter(x => x !== id); if (cur !== side) rs[side].push(id); render(); },
  rsubmit: () => submitResult(),
  rok: el => settleResult(el.dataset.id, 'confirmed'),
  rno: el => settleResult(el.dataset.id, 'disputed'),
  rdel: el => retractResult(el.dataset.id),
  rdopen: el => openRound(gm(el.dataset.id)),
  rdholes: el => { rd.holes = Number(el.dataset.v); render(); },
  rdsave: () => submitRound(),
  vouch: el => vouch(el.dataset.id),
  rounddel: el => deleteRound(el.dataset.id),
  loground: () => openRound(null),
  player: el => sub('player', el.dataset.id),
  venue: el => { sf = null; sheet = {name:'venue', id:el.dataset.id}; render(); },
  slotbook: el => { const s2 = S.slots.find(x => x.id === el.dataset.id); bk = {slot:s2.id, size:Math.min(s2.capacity, 4), ping:false}; sub('book', s2.id); },
  bksport: el => { bk.sport = el.dataset.id; render(); },
  bkgo: () => doBook(),
  slotcancel: el => cancelBooking(el.dataset.id),
  slotdel: el => deleteSlot(el.dataset.id),
  postslots: () => postSlots(venue(sheet.id)),
  ctog: el => toggleComm(el.dataset.id),
  newcomm: el => { const b = el.dataset.back; nc = {name:'', type:'club', area:S.me.area, back:b ? {name:b} : null}; sheet = {name:'newcomm'}; render(); },
  nctype: el => { nc.type = el.dataset.v; render(); },
  ncback: () => { sheet = nc.back || null; nc = null; render(); },
  nccreate: () => createComm(),
  dtog: el => { const d = Number(el.dataset.d), i = S.me.days.indexOf(d); if (i < 0) S.me.days.push(d); else S.me.days.splice(i, 1); saveMe(); render(); },
  mset: el => { S.me[el.dataset.k] = Number(el.dataset.v); saveMe(); render(); },
  finish: () => { if (S.me.name.trim().length < 2) { toast('Add your name so people know who is coming'); return; } if (!mySports().length) { toast('Pick at least one sport'); return; } S.me.onboarded = true; fixMe(); saveMe(); sheet = null; route(); toast('Welcome, ' + first(S.me.name)); },
  push: () => togglePush(),
  google: () => google(),
  sendlink: () => sendLink(),
  verify: () => verifyCode(),
  authback: () => { auth = {email:'', code:'', sent:false, busy:false}; render(); },
  signout: async () => { await sb.auth.signOut(); }
};
function setPath(path, v) { const [root, key] = path.split('.'); const o = {me:S && S.me, draft, F, auth, nc, nv, nl, tf, lf, rf, rs, rd, sf, bk}[root]; if (o) o[key] = v; }
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (!el || el.tagName === 'INPUT') return; const fn = H[el.dataset.a]; if (fn) fn(el, e); });
document.addEventListener('change', e => {
  const el = e.target;
  if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.dataset.a) { H[el.dataset.a](el, e); return; }
  const b = el.dataset.bind; if (!b) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.num) v = Number(v);
  if (el.dataset.parse === 'lv') v = v === 'any' ? 'any' : Number(v);
  setPath(b, v);
  if (b.startsWith('me.')) { fixMe(); saveMe(); }
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'range') render();
});
document.addEventListener('input', e => {
  const el = e.target, b = el.dataset.bind; if (!b) return;
  if (el.type === 'range') { const t = document.getElementById(el.dataset.live); if (t) t.textContent = el.value + (el.dataset.unit || ' mi'); return; }
  if (el.tagName === 'SELECT' || el.type === 'checkbox') return;
  setPath(b, el.value); if (b.startsWith('me.')) { dirty = true; if (S.me.onboarded) saveMe(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet && document.querySelector('.phead .x')) { closeSheet(); return; } if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return; const m = {email:'sendlink', code:'verify', cmt:'post', ncname:'nccreate', nvname:'nvcreate', nlname:'nlcreate', tfname:'mkteam'}[e.target.id]; if (m) { e.preventDefault(); H[m](e.target, e); } });

function route() {
  if (!UID || !S) { render(); return; }
  let h = location.hash.replace('#', '');
  const next = store.get('wire.next'); if (next) { h = next; store.set('wire.next', null); }
  if (!S.me.onboarded) { if (/^(game|league)\//.test(h)) store.set('wire.next', h); if (!sheet || (sheet.name !== 'onboard' && sheet.name !== 'newcomm' && sheet.name !== 'newvenue')) sheet = {name:'onboard'}; render(); return; }
  if (h.startsWith('game/')) { const id = h.slice(5); if (gm(id)) { openGame(id); return; } toast('That game is over or was cancelled'); }
  if (h.startsWith('league/')) { const id = h.slice(7); if (L(id)) { tab = 'leagues'; sheet = {name:'league', id, tab:'standings'}; render(); return; } toast('That league was not found'); }
  if (['home', 'schedule', 'leagues', 'find', 'profile'].includes(h)) tab = h;
  render();
}
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden && UID) refreshSoon(0); });
setInterval(() => { if (UID && S && !document.hidden && !sheet) render(); }, 60000);

async function onSession(session) {
  const id = session && session.user ? session.user.id : null;
  if (id === UID && booted) return;
  if (!id) { const h = location.hash.replace('#', ''); if (/^(game|league)\//.test(h)) store.set('wire.next', h); UID = null; S = null; sheet = null; if (channel) { sb.removeChannel(channel); channel = null; } booted = true; render(); return; }
  UID = id; EMAIL = session.user.email || ''; auth = {email:'', code:'', sent:false, busy:false};
  booted = true; render();
  await loadAll(); await pushState(); subscribe(); route();
}
sb.auth.onAuthStateChange((_ev, session) => { setTimeout(() => onSession(session), 0); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
render();

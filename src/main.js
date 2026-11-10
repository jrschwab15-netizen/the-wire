import { createClient } from '@supabase/supabase-js';

/* ===== config (all three values are safe to ship in the browser) ===== */
const SB_URL = 'https://pfvlpaartrdngfoxzjdj.supabase.co';
const SB_KEY = 'sb_publishable_fVMej-B5tq90KQRtFtHkzg_FYLA2UDV';
const VAPID = 'BCK8bQ7H1AIehpOyTiGZqFNtqrsYcCq8u4UIu97yE72bXdrJwU4-nlTyAzOESZ7_a27ZxCLeeUPiuKjz7-jYEx0';
const sb = createClient(SB_URL, SB_KEY, {auth:{flowType:'pkce', detectSessionInUrl:true, persistSession:true, autoRefreshToken:true}});

/* Towns are just a name and a center point. Add more here to open a new area. */
const AREAS = {Andover:[42.658,-71.137],Arlington:[42.415,-71.156],Belmont:[42.396,-71.178],Boston:[42.36,-71.058],Brookline:[42.332,-71.121],Cambridge:[42.373,-71.11],Concord:[42.46,-71.349],Dedham:[42.242,-71.166],Dover:[42.246,-71.283],Hingham:[42.242,-70.89],Lexington:[42.447,-71.225],Marblehead:[42.5,-70.858],Needham:[42.28,-71.237],Newton:[42.337,-71.209],Sudbury:[42.383,-71.416],Wayland:[42.363,-71.361],Wellesley:[42.297,-71.292],Weston:[42.367,-71.303],Winchester:[42.452,-71.137]};
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
let tab = 'home', sheet = null, seg = 'mine', draft = null, nc = null, pushOn = false, channel = null;
let F = {sport:'all', day:'any', level:'any', dist:25, open:true};
let auth = {email:'', code:'', sent:false, busy:false};

const P = id => (S.players[id]) || {id, name:'Player', level:1, comms:[], lat:S.me.lat, lng:S.me.lng};
const C = id => S.comms.find(c => c.id === id);
const gm = id => S.games.find(g => g.id === id);
const onSports = () => Object.values(SPORTS).filter(s => s.enabled);
const vis = g => SPORTS[g.sport] && SPORTS[g.sport].enabled;
const countIn = g => Object.values(g.rsvps).filter(v => v === 'in').length;
const openSpots = g => g.spots - countIn(g);
const levelText = g => { const L = SPORTS[g.sport].levels; if (g.levelMin === 0 && g.levelMax === L.length - 1) return 'All levels'; return g.levelMin === g.levelMax ? L[g.levelMin] : L[g.levelMin] + ' to ' + L[g.levelMax]; };
const mine = g => g.hostId === UID || g.rsvps[UID] === 'in' || g.rsvps[UID] === 'maybe';
const myUpcoming = () => S.games.filter(g => vis(g) && g.end > Date.now() && mine(g)).sort((a, b) => a.start - b.start);
const levelOk = (p, g) => !(Math.min(3, p.level + 1) < g.levelMin || Math.max(0, p.level - 1) > g.levelMax);
const nearbyOpen = () => S.games.filter(g => vis(g) && g.end > Date.now() && openSpots(g) > 0 && g.rsvps[UID] !== 'in' && dist(S.me, g) <= S.me.radius && levelOk(S.me, g)).sort((a, b) => a.start - b.start);
const myComms = () => S.me.comms;
const commsFor = sp => S.comms.filter(c => c.sports.includes(sp));

/* ===== data ===== */
function fail(error, msg) { if (error) { console.error(error); toast(msg || error.message || 'Something went wrong'); } return !!error; }
async function loadAll() {
  if (!UID) return;
  loading = true;
  const since = new Date(Date.now() - 4 * HOUR).toISOString();
  const [sp, pr, st, co, mb, ga, no, wa] = await Promise.all([
    sb.from('sports').select('*').order('sort'),
    sb.from('profiles').select('id,name,level,area,lat,lng,sports,onboarded'),
    sb.from('player_settings').select('age_band,days,radius').eq('id', UID).maybeSingle(),
    sb.from('communities').select('id,name,type,area,lat,lng,sports,created_by').order('name'),
    sb.from('memberships').select('community_id,player_id'),
    sb.from('games').select('*, rsvps(player_id,status), messages(id,player_id,body,is_system,created_at)').gt('starts_at', since).order('starts_at'),
    sb.from('notifications').select('id,game_id,kind,body,created_at,read_at').eq('player_id', UID).order('created_at', {ascending:false}).limit(20),
    sb.from('watchers').select('game_id').eq('player_id', UID)
  ]);
  loading = false;
  const err = [sp, pr, st, co, mb, ga, no, wa].find(r => r.error);
  if (err) { fail(err.error, 'Could not load. Check your connection'); if (!S) return; return; }
  SPORTS = {}; sp.data.forEach(s => { SPORTS[s.id] = s; });
  const players = {};
  pr.data.forEach(p => { players[p.id] = {...p, comms:[]}; });
  mb.data.forEach(m => { if (players[m.player_id]) players[m.player_id].comms.push(m.community_id); });
  if (!players[UID]) {
    // first sign-in safety net: the database normally creates these rows itself
    await sb.from('profiles').upsert({id:UID}); await sb.from('player_settings').upsert({id:UID});
    players[UID] = {id:UID, name:'', level:1, area:'Lexington', lat:AREAS.Lexington[0], lng:AREAS.Lexington[1], sports:['paddle'], onboarded:false, comms:[]};
  }
  const set = st.data || {age_band:1, days:[0,1,2,3,4,5,6], radius:15};
  const me = Object.assign(players[UID], {ageBand:set.age_band, days:set.days, radius:set.radius});
  if (S && dirty) { const o = S.me; Object.assign(me, {name:o.name, level:o.level, area:o.area, lat:o.lat, lng:o.lng, ageBand:o.ageBand, days:o.days, radius:o.radius}); }
  const watch = new Set(wa.data.map(w => w.game_id));
  const games = ga.data.map(r => {
    const rs = {}; (r.rsvps || []).forEach(x => { rs[x.player_id] = x.status; });
    const start = Date.parse(r.starts_at);
    return {id:r.id, sport:r.sport, hostId:r.host_id, communityId:r.community_id, place:r.place, lat:r.lat, lng:r.lng, start, dur:r.duration_min, end:start + r.duration_min * 60000, spots:r.spots, levelMin:r.level_min, levelMax:r.level_max, kind:r.kind, note:r.note, recurring:r.recurring, ageBand:r.age_band, rsvps:rs,
      thread:(r.messages || []).sort((a, b) => a.id - b.id).map(m => ({by:m.player_id, text:m.body, t:Date.parse(m.created_at), sys:m.is_system})), watching:watch.has(r.id)};
  });
  S = {me, players, comms:co.data, games, inbox:no.data.map(n => ({id:n.id, t:Date.parse(n.created_at), msg:n.body, gid:n.game_id, read:!!n.read_at}))};
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
    .on('postgres_changes', {event:'INSERT', schema:'public', table:'notifications', filter:'player_id=eq.' + UID}, p => { if (p.new && p.new.body) toast(p.new.body); refreshSoon(); })
    .subscribe();
}
let saveT = null;
function saveMe() {
  clearTimeout(saveT); dirty = true;
  const mine = saveT = setTimeout(async () => {
    const m = S.me;
    const a = await sb.from('profiles').update({name:m.name.trim().slice(0, 60), level:m.level, area:m.area, lat:m.lat, lng:m.lng, onboarded:m.onboarded}).eq('id', UID);
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
  sheet = {name:'game', id}; history.replaceState(null, '', '#game/' + id); render();
  const unread = S.inbox.filter(n => n.gid === id && !n.read);
  if (unread.length) { unread.forEach(n => { n.read = true; }); sb.from('notifications').update({read_at:new Date().toISOString()}).eq('player_id', UID).eq('game_id', id).is('read_at', null).then(() => {}); }
}
function closeSheet() { sheet = null; history.replaceState(null, '', '#' + tab); render(); }
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
function defPlace(sp, mode) { const all = commsFor(sp), my = all.filter(c => myComms().includes(c.id)); const c = my[0] || (mode === 'schedule' ? all[0] : null); return c ? c.id : (mode === 'schedule' ? '' : 'area'); }
function openCompose(mode) {
  const sp = onSports()[0], dt = defTime();
  draft = {mode, sport:sp.id, day:dt.day, time:dt.time, dur:90, place:defPlace(sp.id, mode), placeName:'', area:S.me.area, spots:sp.size, lmin:Math.max(0, S.me.level - 1), lmax:Math.min(sp.levels.length - 1, S.me.level + 1), ageOn:false, note:'', weekly:false, busy:false};
  sheet = {name:'compose'}; render();
}
async function submitCompose() {
  const d = draft; if (d.busy) return;
  const [h, m] = d.time.split(':').map(Number), start = at(d.day, h, m);
  if (start < Date.now() + 5 * 60000) { toast('Pick a time that has not passed yet'); return; }
  let place, lat, lng, cid = null;
  if (d.place === 'area') {
    if (d.mode === 'schedule') { toast('Pick a club or group to schedule for'); return; }
    place = d.placeName.trim() || (d.area + ' courts'); lat = AREAS[d.area][0]; lng = AREAS[d.area][1];
  } else {
    const c = C(d.place); if (!c) { toast('Add a club or group first'); return; }
    place = c.name; lat = c.lat; lng = c.lng; if (d.mode === 'schedule') cid = c.id;
  }
  d.busy = true; render();
  const row = {sport:d.sport, host_id:UID, community_id:cid, place:place.slice(0, 80), lat, lng, starts_at:new Date(start).toISOString(), duration_min:d.dur, spots:d.spots, level_min:Math.min(d.lmin, d.lmax), level_max:Math.max(d.lmin, d.lmax), kind:d.mode === 'schedule' ? 'scheduled' : 'broadcast', note:d.note.trim().slice(0, 500), recurring:d.mode === 'schedule' && d.weekly ? 'weekly' : null, age_band:d.mode === 'broadcast' && d.ageOn ? S.me.ageBand : null};
  const {data, error} = await sb.from('games').insert(row).select('id').single();
  d.busy = false;
  if (fail(error, 'Could not post the game')) { render(); return; }
  await loadAll();
  if (d.mode === 'broadcast') {
    const {data:pings} = await sb.from('notifications').select('player_id,wave').eq('game_id', data.id).eq('kind', 'ping');
    sheet = {name:'pings', id:data.id, pinged:(pings || []).map(p => p.player_id)}; history.replaceState(null, '', '#' + tab); render();
  } else {
    const n = Object.values(S.players).filter(p => p.id !== UID && p.comms.includes(cid)).length;
    toast('Posted to ' + place + '. ' + n + (n === 1 ? ' member' : ' members') + ' notified'); sheet = null; seg = 'mine'; setTab('schedule');
  }
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
  const {data, error} = await sb.from('communities').insert({name:name.slice(0, 60), type:nc.type, area:nc.area, lat:a[0], lng:a[1], sports:[onSports()[0].id], created_by:UID}).select('id').single();
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
    '<div class="meta">' + (g.kind === 'broadcast' ? '<span class="tag live">Play now</span>' : '') + (g.recurring ? '<span class="tag">Every week</span>' : '') + (c ? '<span class="tag">' + esc(c.name) + '</span>' : '') + (multi ? '<span class="tag">' + esc(SPORTS[g.sport].short) + '</span>' : '') + '</div></div></div>' +
    dots(g) + rsvpRow(g) + '</article>';
}
function header() { return '<header class="top"><div class="mark">' + LOGO + 'the wire</div>' + (S ? '<button data-a="tab" data-t="profile" aria-label="Your profile">' + av(S.me, '') + '</button>' : '') + '</header>'; }
function tabbar() {
  const t = (id, ic, l) => '<button class="t ' + (tab === id ? 'on' : '') + '" data-a="tab" data-t="' + id + '"' + (tab === id ? ' aria-current="page"' : '') + '>' + ICON[ic] + l + '</button>';
  return '<nav class="tabs" aria-label="Main">' + t('home', 'home', 'Home') + t('schedule', 'cal', 'Schedule') + '<button class="go" data-a="compose" data-m="broadcast" aria-label="Play tonight">Play</button>' + t('find', 'find', 'Find') + t('profile', 'me', 'You') + '</nav>';
}
function viewAuth() {
  return '<section class="pad auth"><h1 class="hero">Who is playing tonight?</h1><p class="lede">Find a game, fill a fourth, and see who is in. Free, no ads.</p>' +
    '<button class="btn block" data-a="google"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.7 3.2-8z"/><path fill="#34A853" d="M12 23c2.9 0 5.400-1 7.200-2.700l-3.600-2.700c-1 .7-2.200 1.100-3.600 1.100-2.800 0-5.200-1.900-6-4.400H2.300v2.800A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M6 14.300a6.600 6.600 0 0 1 0-4.200V7.300H2.300a11 11 0 0 0 0 9.800L6 14.300z"/><path fill="#EA4335" d="M12 5.400c1.600 0 3 .5 4.100 1.600l3.100-3.100A11 11 0 0 0 2.300 7.300L6 10.100c.8-2.500 3.200-4.700 6-4.700z"/></svg>Continue with Google</button>' +
    '<div class="or"><span>or</span></div>' +
    (auth.sent
      ? '<div class="card"><b>Check your email</b><p class="hint">We sent a sign-in link to ' + esc(auth.email) + '. Tap it, or type the 6-digit code from the email here.</p>' +
        '<label class="field"><span class="lab">Code</span><input class="inp" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" data-bind="auth.code" value="' + esc(auth.code) + '"></label>' +
        '<button class="btn solid block" data-a="verify"' + (auth.busy ? ' disabled' : '') + '>Sign in</button><button class="btn ghost block" style="margin-top:8px" data-a="authback">Use a different email</button></div>'
      : '<label class="field" style="margin-top:0"><span class="lab">Email</span><input class="inp" id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" data-bind="auth.email" value="' + esc(auth.email) + '"></label>' +
        '<button class="btn solid block" data-a="sendlink"' + (auth.busy ? ' disabled' : '') + '>' + (auth.busy ? 'Sending' : 'Email me a sign-in link') + '</button>') +
    '<p class="hint" style="margin-top:18px">No password to remember. Your email is only used to sign you in.</p></section>';
}
function viewHome() {
  const f = first(S.me.name) === 'Someone' ? 'there' : first(S.me.name), next = myUpcoming()[0], open = nearbyOpen().slice(0, 4), act = S.inbox.slice(0, 4);
  return '<section class="pad"><p class="kicker">Hey ' + esc(f) + '</p><h1 class="hero">Who is playing tonight?</h1>' +
    '<button class="xl" data-a="compose" data-m="broadcast"><span>Play tonight</span><small>Ping nearby players who match your level and day</small></button>' +
    (act.length ? '<h2 class="h2">Activity</h2>' + act.map(a => '<div class="note-row' + (a.read ? ' read' : '') + '"' + (a.gid && gm(a.gid) ? ' data-a="game" data-id="' + a.gid + '"' : '') + '><span class="pulse"></span><div><b>' + esc(a.msg) + '</b><small>' + ago(a.t) + '</small></div></div>').join('') : '') +
    '<h2 class="h2">Your next game</h2>' + (next ? gameCard(next) : empty('Nothing on your schedule', 'Join a game below or post one with Play tonight.')) +
    '<h2 class="h2">Open near you</h2>' + (open.length ? open.map(gameCard).join('') : empty('Nothing open that fits right now', 'Post a game and the right people get pinged.')) + '</section>';
}
function groupByDay(list) {
  const m = new Map(); list.forEach(g => { const k = new Date(g.start).toDateString(); if (!m.has(k)) m.set(k, []); m.get(k).push(g); });
  return [...m.values()].map(arr => '<h2 class="h2">' + dayLabel(arr[0].start) + '</h2>' + arr.map(gameCard).join('')).join('');
}
function viewSchedule() {
  let list = S.games.filter(g => vis(g) && g.end > Date.now());
  if (seg === 'mine') list = list.filter(mine);
  else if (seg === 'comm') list = list.filter(g => g.communityId && myComms().includes(g.communityId));
  list.sort((a, b) => a.start - b.start);
  const msg = seg === 'mine' ? ['Nothing on your schedule', 'Mark In on a game or post your own.'] : seg === 'comm' ? ['No games in your communities', myComms().length ? 'Schedule one yourself with the button below.' : 'Join or add a club or group on your profile first.'] : ['No upcoming games', 'Be the first to post one.'];
  const sb2 = (id, l) => '<button class="' + (seg === id ? 'on' : '') + '" data-a="seg" data-v="' + id + '">' + l + '</button>';
  return '<section class="pad"><h1 class="hero" style="margin-bottom:6px;font-size:32px">Schedule</h1><div class="seg" role="tablist">' + sb2('mine', 'My games') + sb2('comm', 'My communities') + sb2('all', 'Everything') + '</div>' +
    (list.length ? groupByDay(list) : '<div style="margin-top:16px">' + empty(msg[0], msg[1]) + '</div>') +
    '<div style="margin-top:14px"><button class="btn block" data-a="compose" data-m="schedule">Schedule a game for a community</button></div></section>';
}
function viewFind() {
  const sports = onSports();
  let list = S.games.filter(g => vis(g) && g.end > Date.now() && g.hostId !== UID);
  if (F.sport !== 'all') list = list.filter(g => g.sport === F.sport);
  if (F.open) list = list.filter(g => openSpots(g) > 0);
  if (F.level !== 'any') list = list.filter(g => g.levelMin <= F.level && g.levelMax >= F.level);
  if (F.day === 'today') list = list.filter(g => dayLabel(g.start) === 'Today');
  if (F.day === 'weekend') list = list.filter(g => [0, 6].includes(new Date(g.start).getDay()));
  if (F.day === 'week') list = list.filter(g => g.start < Date.now() + 7 * DAY);
  list = list.filter(g => dist(S.me, g) <= F.dist).sort((a, b) => a.start - b.start);
  const ch = (k, v, l) => '<button class="chip ' + (F[k] === v ? 'on' : '') + '" data-a="filt" data-k="' + k + '" data-v="' + v + '">' + l + '</button>';
  const lv = SPORTS[(F.sport !== 'all' ? F.sport : sports[0].id)].levels;
  return '<section class="pad"><h1 class="hero" style="margin-bottom:12px;font-size:32px">Find a game</h1>' +
    (sports.length > 1 ? '<div class="chips" style="margin-bottom:10px">' + ch('sport', 'all', 'All sports') + sports.map(s => ch('sport', s.id, esc(s.short))).join('') + '</div>' : '') +
    '<div class="chips">' + ch('day', 'any', 'Any day') + ch('day', 'today', 'Today') + ch('day', 'weekend', 'Weekend') + ch('day', 'week', 'Next 7 days') + '</div>' +
    '<div class="two" style="margin-top:12px"><label><span class="lab">Level</span><select class="inp" data-bind="F.level" data-parse="lv"><option value="any"' + (F.level === 'any' ? ' selected' : '') + '>Any level</option>' + lv.map((l, i) => '<option value="' + i + '"' + (F.level === i ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
    '<label><span class="lab">Within <span id="dl">' + F.dist + ' mi</span></span><input type="range" min="5" max="60" step="5" value="' + F.dist + '" data-bind="F.dist" data-num="1" data-live="dl" aria-label="Distance in miles"></label></div>' +
    '<label class="toggle"><span>Only games with open spots</span><input type="checkbox" data-bind="F.open"' + (F.open ? ' checked' : '') + '></label>' +
    '<h2 class="h2" style="margin-top:12px">' + list.length + ' ' + (list.length === 1 ? 'game' : 'games') + '</h2>' +
    (list.length ? list.map(gameCard).join('') : empty('No games match', 'Widen the distance or post a game with Play tonight.')) + '</section>';
}
function commChips(back) {
  const list = S.comms.filter(c => c.sports.some(s => SPORTS[s] && SPORTS[s].enabled));
  return '<div class="chips">' + list.map(c => '<button class="chip ' + (myComms().includes(c.id) ? 'on' : '') + '" data-a="ctog" data-id="' + c.id + '" aria-pressed="' + myComms().includes(c.id) + '">' + esc(c.name) + '</button>').join('') +
    '<button class="chip add" data-a="newcomm" data-back="' + (back || '') + '">+ Add a club or group</button></div>' +
    (list.length ? '' : '<p class="hint">Nobody has added yours yet. Add it and you are the first one in.</p>');
}
function viewProfile() {
  const m = S.me, sp = onSports()[0], stat = (n, l) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>';
  const up = myUpcoming();
  return '<section class="pad"><div class="profile-head">' + av(m, 'lg') + '<div><h1 style="font-size:26px;font-weight:800">' + esc(m.name || 'Your profile') + '</h1><div class="hint">' + esc(sp.levels[m.level]) + ' in ' + esc(m.area) + '</div></div></div>' +
    '<div class="stats">' + stat(up.length, 'Upcoming') + stat(up.filter(g => g.hostId === UID).length, 'Hosting') + stat(m.comms.length, 'Communities') + '</div>' +
    '<label class="field"><span class="lab">Name</span><input class="inp" data-bind="me.name" value="' + esc(m.name) + '" autocomplete="name" maxlength="60"></label>' +
    '<div class="two"><label><span class="lab">Level</span><select class="inp" data-bind="me.level" data-num="1">' + sp.levels.map((l, i) => '<option value="' + i + '"' + (m.level === i ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
    '<label><span class="lab">Home area</span><select class="inp" data-bind="me.area">' + areaOpts(m.area) + '</select></label></div>' +
    '<label class="field"><span class="lab">Age range</span><select class="inp" data-bind="me.ageBand" data-num="1">' + BAND_LABELS.map((l, i) => '<option value="' + i + '"' + (m.ageBand === i ? ' selected' : '') + '>' + l + '</option>').join('') + '</select><span class="hint">Only used if a host turns on the age filter. Nobody else can see it.</span></label>' +
    '<h2 class="h2">Communities</h2>' + commChips('') +
    '<h2 class="h2">Pings you get</h2><p class="hint" style="margin:-4px 0 10px">You only hear about games that match all of this, and never more than 3 a day.</p>' +
    '<label class="toggle"><span>Alerts on this phone<small class="hint" style="display:block">On iPhone, add The Wire to your Home Screen first.</small></span><input type="checkbox" data-a="push"' + (pushOn ? ' checked' : '') + '></label>' +
    '<span class="lab" style="margin-top:12px">Days you can play</span><div class="chips">' + DOW.map((d, i) => '<button class="chip ' + (m.days.includes(i) ? 'on' : '') + '" data-a="dtog" data-d="' + i + '" aria-pressed="' + m.days.includes(i) + '">' + d + '</button>').join('') + '</div>' +
    '<label class="field"><span class="lab">Distance: <span id="rl">' + m.radius + ' miles</span></span><input type="range" min="5" max="50" step="5" value="' + m.radius + '" data-bind="me.radius" data-num="1" data-live="rl" data-unit=" miles"></label>' +
    '<p class="hint">Quiet hours are 9 PM to 7 AM Eastern, unless a game starts within two hours.</p>' +
    '<div style="margin-top:22px;display:grid;gap:10px"><p class="hint">Signed in as ' + esc(EMAIL) + '</p><button class="btn block ghost" data-a="signout">Sign out</button></div></section>';
}

/* ===== sheets ===== */
function sheetShell(title, body, foot, lock) { return '<div class="backdrop"' + (lock ? '' : ' data-a="backdrop"') + '><div class="panel" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="phead"><h2>' + esc(title) + '</h2>' + (lock ? '' : '<button class="x" data-a="close" aria-label="Close">&times;</button>') + '</div><div class="sbody">' + body + '</div>' + (foot ? '<div class="sfoot">' + foot + '</div>' : '') + '</div></div>'; }
function rosterRow(p, g) { const me = p.id === UID; return '<div class="pl">' + av(p, 'sm') + '<div><b>' + esc(me ? (p.name || 'You') + ' (you)' : p.name || 'Player') + '</b><small>' + esc(SPORTS[g.sport].levels[p.level]) + (p.area ? ', ' + esc(p.area) : '') + '</small></div></div>'; }
function sheetGame(g) {
  const host = P(g.hostId), c = g.communityId ? C(g.communityId) : null, past = g.end < Date.now();
  const ids = s => Object.keys(g.rsvps).filter(k => g.rsvps[k] === s);
  const inn = ids('in').map(id => rosterRow(P(id), g)).join(''), maybe = ids('maybe').map(id => rosterRow(P(id), g)).join('');
  const silent = c ? Object.values(S.players).filter(p => p.comms.includes(c.id) && !g.rsvps[p.id]).map(p => first(p.name)) : [];
  const full = countIn(g) >= g.spots, mineIn = g.rsvps[UID] === 'in', isHost = g.hostId === UID;
  let body = '<div class="facts"><div class="fact"><b>When</b><span>' + dayLabel(g.start) + ', ' + timeLabel(g.start) + ' to ' + timeLabel(g.end) + (g.recurring ? ', every week' : '') + '</span></div>' +
    '<div class="fact"><b>Where</b><span>' + esc(g.place) + '</span></div><div class="fact"><b>Level</b><span>' + esc(levelText(g)) + '</span></div>' +
    '<div class="fact"><b>Host</b><span>' + esc(host.name || 'Player') + (isHost ? ' (you)' : '') + '</span></div>' +
    (g.ageBand != null ? '<div class="fact"><b>Ages</b><span>' + BAND_LABELS[g.ageBand] + ', set by the host</span></div>' : '') +
    (g.note ? '<div class="fact"><b>Note</b><span>' + esc(g.note) + '</span></div>' : '') + '</div>' + dots(g);
  if (!past) body += rsvpRow(g);
  if (sheet.askReason) body += '<div class="reasons"><b>Why are you dropping out?</b><div class="hint" style="margin-bottom:8px">One tap helps the host refill your spot.</div><div class="chips">' + ['Work', 'Injury', 'Family', 'Weather', 'Other'].map(r => '<button class="chip" data-a="reason" data-id="' + g.id + '" data-r="' + r + '">' + r + '</button>').join('') + '</div><button class="btn ghost" style="margin-top:10px" data-a="reason" data-id="' + g.id + '" data-r="">Skip</button></div>';
  if (full && !mineIn && !past) body += '<label class="toggle"><span>Ping me if a spot opens</span><input type="checkbox" data-a="watch" data-id="' + g.id + '"' + (g.watching ? ' checked' : '') + '></label>';
  body += '<h2 class="h2">In (' + ids('in').length + ')</h2>' + (inn || '<p class="hint">Nobody yet.</p>');
  if (maybe) body += '<h2 class="h2">Maybe</h2>' + maybe;
  if (silent.length) body += '<h2 class="h2">Haven\'t answered</h2><p class="hint">' + esc(silent.join(', ')) + '</p>';
  body += '<h2 class="h2">Thread</h2><div class="thread">' + (g.thread.length ? g.thread.map(m => m.sys ? '<div class="msg sys">' + esc(m.text) + '</div>' : '<div class="msg"><small>' + esc(m.by === UID ? 'You' : first(P(m.by).name)) + ', ' + ago(m.t) + '</small>' + esc(m.text) + '</div>').join('') : '<p class="hint">No messages yet.</p>') + '</div>' +
    '<div class="compose-row"><input class="inp" id="cmt" maxlength="500" placeholder="Say something to the group" aria-label="Message"><button class="btn solid" data-a="post">Send</button></div>';
  if (isHost && !past) body += '<button class="btn ghost block" style="margin-top:18px" data-a="cancel" data-id="' + g.id + '">' + (sheet.confirmCancel ? 'Tap again to cancel this game for everyone' : 'Cancel this game') + '</button>';
  const foot = '<div class="two"><button class="btn" data-a="share" data-id="' + g.id + '">Share</button><button class="btn" data-a="ics" data-id="' + g.id + '">Add to calendar</button></div>';
  return sheetShell(g.place, body, foot);
}
function sheetOnboard() {
  const m = S.me, sp = onSports()[0];
  const body = '<p class="hint" style="margin-bottom:4px">Under a minute. You can change all of this later.</p>' +
    '<label class="field"><span class="lab">Your name</span><input class="inp" data-bind="me.name" value="' + esc(m.name) + '" autocomplete="name" maxlength="60" placeholder="First and last, so people know who is coming"></label>' +
    '<span class="lab">Your ' + esc(sp.short.toLowerCase()) + ' level</span><div class="chips">' + sp.levels.map((l, i) => '<button class="chip ' + (m.level === i ? 'on' : '') + '" data-a="mset" data-k="level" data-v="' + i + '">' + esc(l) + '</button>').join('') + '</div>' +
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
  const d = draft, sp = SPORTS[d.sport], sports = onSports(), isB = d.mode === 'broadcast';
  const days = Array.from({length:7}, (_, i) => i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DOW[(new Date().getDay() + i) % 7]);
  const times = []; for (let h = 6; h <= 21; h++) { times.push(pad(h) + ':00'); times.push(pad(h) + ':30'); }
  const all = commsFor(d.sport), venues = isB ? all : all.filter(c => myComms().includes(c.id)).concat(all.filter(c => !myComms().includes(c.id)));
  const lv = sp.levels, none = !isB && !venues.length;
  const body = '<div class="seg"><button class="' + (isB ? 'on' : '') + '" data-a="dmode" data-v="broadcast">Play tonight</button><button class="' + (!isB ? 'on' : '') + '" data-a="dmode" data-v="schedule">Schedule for a group</button></div>' +
    '<p class="hint" style="margin-bottom:6px">' + (isB ? 'Players nearby who match get a ping with a Join button.' : 'Everyone in the community is notified. Members tap In or Out.') + '</p>' +
    (sports.length > 1 ? '<span class="lab" style="margin-top:12px">Sport</span><div class="chips">' + sports.map(s => '<button class="chip ' + (d.sport === s.id ? 'on' : '') + '" data-a="dsport" data-v="' + s.id + '">' + esc(s.short) + '</button>').join('') + '</div>' : '') +
    '<span class="lab" style="margin-top:14px">Day</span><div class="chips">' + days.map((l, i) => '<button class="chip ' + (d.day === i ? 'on' : '') + '" data-a="dset" data-k="day" data-v="' + i + '">' + l + '</button>').join('') + '</div>' +
    '<div class="two"><label class="field"><span class="lab">Start</span><select class="inp" data-bind="draft.time">' + times.map(t => '<option value="' + t + '"' + (d.time === t ? ' selected' : '') + '>' + hhmmLabel(t) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="lab">Length</span><select class="inp" data-bind="draft.dur" data-num="1">' + [60, 90, 120].map(x => '<option value="' + x + '"' + (d.dur === x ? ' selected' : '') + '>' + x + ' min</option>').join('') + '</select></label></div>' +
    (none ? '<div class="card"><b>No club or group yet</b><p class="hint">Add yours first, then schedule games for it.</p><button class="btn block" style="margin-top:8px" data-a="newcomm" data-back="compose">Add a club or group</button></div>'
      : '<label class="field" style="margin-top:0"><span class="lab">Where</span><select class="inp" data-bind="draft.place">' + venues.map(c => '<option value="' + c.id + '"' + (d.place === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + (isB ? '<option value="area"' + (d.place === 'area' ? ' selected' : '') + '>Somewhere else</option>' : '') + '</select></label>') +
    (isB && d.place === 'area' ? '<div class="two"><label class="field" style="margin-top:0"><span class="lab">Place name</span><input class="inp" data-bind="draft.placeName" value="' + esc(d.placeName) + '" maxlength="80" placeholder="Town courts"></label><label class="field" style="margin-top:0"><span class="lab">Town</span><select class="inp" data-bind="draft.area">' + areaOpts(d.area) + '</select></label></div>' : '') +
    '<div class="two"><label class="field" style="margin-top:0"><span class="lab">Players total</span><select class="inp" data-bind="draft.spots" data-num="1">' + [2, 3, 4, 6, 8, 12].map(x => '<option' + (d.spots === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label><div></div></div>' +
    '<div class="two"><label class="field"><span class="lab">Level from</span><select class="inp" data-bind="draft.lmin" data-num="1">' + lv.map((l, i) => '<option value="' + i + '"' + (d.lmin === i ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="lab">Level to</span><select class="inp" data-bind="draft.lmax" data-num="1">' + lv.map((l, i) => '<option value="' + i + '"' + (d.lmax === i ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label></div>' +
    (isB ? '<label class="toggle"><span>Only ping my age range (' + BAND_LABELS[S.me.ageBand] + ')<small class="hint" style="display:block">Optional. Smaller groups get fewer pings.</small></span><input type="checkbox" data-bind="draft.ageOn"' + (d.ageOn ? ' checked' : '') + '></label>' : '<label class="toggle"><span>Repeat every week</span><input type="checkbox" data-bind="draft.weekly"' + (d.weekly ? ' checked' : '') + '></label>') +
    '<label class="field"><span class="lab">Note (optional)</span><textarea class="inp" data-bind="draft.note" maxlength="500" placeholder="Bringing balls. Warm-up at 6:15.">' + esc(d.note) + '</textarea></label>';
  return sheetShell(isB ? 'Play tonight' : 'Schedule a game', body, '<button class="btn solid block" data-a="submit"' + (d.busy || none ? ' disabled' : '') + '>' + (d.busy ? 'Posting' : isB ? 'Post and ping players' : 'Post to community') + '</button>');
}
function sheetPings(g, pinged) {
  const n = pinged.length, hr = new Date().getHours(), quiet = (hr >= 21 || hr < 7) && g.start - Date.now() > 2 * HOUR;
  const line = p => '<div class="pl">' + av(p, 'sm') + '<div><b>' + esc(p.name || 'Player') + '</b><small>' + esc(SPORTS[g.sport].levels[p.level]) + ', ' + Math.round(dist(p, g)) + ' mi away</small></div></div>';
  let body = '<p style="font-size:17px;font-weight:600;margin-bottom:4px">' + (n ? 'Pinged ' + n + (n === 1 ? ' player' : ' players') + ' from your communities.' : quiet ? 'Posted. Pings are holding for quiet hours.' : 'Posted. Nobody in your communities matched yet.') + '</p>' +
    '<p class="hint">' + (quiet ? 'It is quiet hours, so matching players get pinged at 7 AM.' : 'In 15 minutes, if spots are still open, other nearby players who match get pinged too. Joins show up in Activity.') + '</p>' +
    '<div class="pingcard"><span class="pulse"></span><div><b>Play tonight</b><div class="hint">' + esc(first(S.me.name)) + ' wants to play at ' + esc(g.place) + ', ' + timeLabel(g.start) + '. ' + openSpots(g) + ' open.</div></div></div>';
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
    else if (sheet.name === 'pings' && g) html = sheetPings(g, sheet.pinged);
    else sheet = null;
  }
  root.innerHTML = html; document.body.classList.toggle('lock', !!html);
  const nb = root.querySelector('.sbody'); if (nb && prev) nb.scrollTop = top;
}
function render() {
  const a = document.activeElement; let keep = null;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox' && a.type !== 'range') keep = {bind:a.dataset.bind, id:a.id, val:a.value, s:a.selectionStart, e:a.selectionEnd};
  if (!booted) $('#app').innerHTML = header() + '<main><div class="pad"><p class="hint" style="margin-top:40px">Loading</p></div></main>';
  else if (!UID || !S) { $('#app').innerHTML = header() + '<main>' + (UID ? '<div class="pad"><p class="hint" style="margin-top:40px">' + (loading ? 'Loading' : 'Could not load. Pull to refresh.') + '</p></div>' : viewAuth()) + '</main>'; $('#sheet-root').innerHTML = ''; document.body.classList.remove('lock'); }
  else {
    const v = {home:viewHome, schedule:viewSchedule, find:viewFind, profile:viewProfile}[tab]();
    $('#app').innerHTML = header() + '<main>' + v + '</main>' + tabbar();
    renderSheet();
  }
  if (keep) { const el = keep.id ? document.getElementById(keep.id) : keep.bind ? document.querySelector('[data-bind="' + keep.bind + '"]') : null; if (el) { el.value = keep.val; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
}

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
  dmode: el => { draft.mode = el.dataset.v; draft.place = defPlace(draft.sport, draft.mode); render(); },
  dsport: el => { draft.sport = el.dataset.v; const sp = SPORTS[draft.sport]; draft.spots = sp.size; draft.place = defPlace(draft.sport, draft.mode); draft.lmin = 0; draft.lmax = sp.levels.length - 1; render(); },
  submit: () => submitCompose(),
  ctog: el => toggleComm(el.dataset.id),
  newcomm: el => { const b = el.dataset.back; nc = {name:'', type:'club', area:S.me.area, back:b ? {name:b} : null}; sheet = {name:'newcomm'}; render(); },
  nctype: el => { nc.type = el.dataset.v; render(); },
  ncback: () => { sheet = nc.back || null; nc = null; render(); },
  nccreate: () => createComm(),
  dtog: el => { const d = Number(el.dataset.d), i = S.me.days.indexOf(d); if (i < 0) S.me.days.push(d); else S.me.days.splice(i, 1); saveMe(); render(); },
  mset: el => { S.me[el.dataset.k] = Number(el.dataset.v); saveMe(); render(); },
  finish: () => { if (S.me.name.trim().length < 2) { toast('Add your name so people know who is coming'); return; } S.me.onboarded = true; fixMe(); saveMe(); sheet = null; route(); toast('Welcome, ' + first(S.me.name)); },
  push: () => togglePush(),
  google: () => google(),
  sendlink: () => sendLink(),
  verify: () => verifyCode(),
  authback: () => { auth = {email:'', code:'', sent:false, busy:false}; render(); },
  signout: async () => { await sb.auth.signOut(); }
};
function setPath(path, v) { const [root, key] = path.split('.'); const o = {me:S && S.me, draft, F, auth, nc}[root]; if (o) o[key] = v; }
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
document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return; const m = {email:'sendlink', code:'verify', cmt:'post', ncname:'nccreate'}[e.target.id]; if (m) { e.preventDefault(); H[m](e.target, e); } });

function route() {
  if (!UID || !S) { render(); return; }
  let h = location.hash.replace('#', '');
  const next = store.get('wire.next'); if (next) { h = next; store.set('wire.next', null); }
  if (!S.me.onboarded) { if (h.startsWith('game/')) store.set('wire.next', h); if (!sheet || (sheet.name !== 'onboard' && sheet.name !== 'newcomm')) sheet = {name:'onboard'}; render(); return; }
  if (h.startsWith('game/')) { const id = h.slice(5); if (gm(id)) { openGame(id); return; } toast('That game is over or was cancelled'); }
  if (['home', 'schedule', 'find', 'profile'].includes(h)) tab = h;
  render();
}
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden && UID) refreshSoon(0); });
setInterval(() => { if (UID && S && !document.hidden && !sheet) render(); }, 60000);

async function onSession(session) {
  const id = session && session.user ? session.user.id : null;
  if (id === UID && booted) return;
  if (!id) { const h = location.hash.replace('#', ''); if (h.startsWith('game/')) store.set('wire.next', h); UID = null; S = null; sheet = null; if (channel) { sb.removeChannel(channel); channel = null; } booted = true; render(); return; }
  UID = id; EMAIL = session.user.email || ''; auth = {email:'', code:'', sent:false, busy:false};
  booted = true; render();
  await loadAll(); await pushState(); subscribe(); route();
}
sb.auth.onAuthStateChange((_ev, session) => { setTimeout(() => onSession(session), 0); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
render();

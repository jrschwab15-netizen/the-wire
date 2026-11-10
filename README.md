# The Wire

Find a game tonight. A free pickup and schedule app that starts with paddle tennis in Greater Boston and is built to take any sport in any town.

Live at https://thewire-sport.com

## How it is put together

- **Web app**: plain JavaScript built with Vite (`src/main.js`, `index.html`). Installable on a phone, with phone alerts through a service worker (`public/sw.js`).
- **Backend**: Supabase project `the-wire`. Tables, access rules and the matching logic are in `supabase/migrations`. The push sender is the edge function in `supabase/functions/send-push`.
- **Hosting**: GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`.

## The matching rules (in the database, `private.ping_game`)

A "Play tonight" post pings a player only if all of these hold: same sport, inside the player's distance, level within one step of theirs, free that day of the week, inside the host's optional age range, and under 3 pings today. The host's communities are pinged first; everyone else who matches is pinged 15 minutes later if spots are still open. Nobody is pinged between 9 PM and 7 AM Eastern unless the game starts within two hours.

## Adding a sport or a town

- Sport: add a row to the `sports` table (or flip `enabled` on pickleball or tennis). No code change.
- Town: add a name and center point to `AREAS` in `src/main.js`.

## Run it locally

```
npm install
npm run dev
```

The Supabase URL and publishable key in `src/main.js` are safe to be public. Access is enforced by row level security in the database. No secret keys live in this repo.

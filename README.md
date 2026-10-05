# Pixel Plaza

Pixel Plaza is a static Vercel web game backed by Supabase Realtime.

## Features
- Shared online world with Supabase Presence + Broadcast.
- Infinite procedural coordinate world; chunks are rendered around each player.
- X/Y coordinate HUD and teleport controls.
- Two floors with stairs at the central coordinates (6, 6); use **E** to go up and **Q** to go down when standing near them.
- Procedural rooms, doors and furniture.
- Friendly cartoon characters with walking animation.
- Optional imported 2D character image (PNG/JPG/GIF/WEBP, 250 KB max). The image is carried in the Realtime presence state so other players can see it while you are online.
- Global chat and direct messages.
- Online player list.

## Supabase
Run `supabase/schema.sql` in the Supabase SQL Editor. If your existing database already has the tables, rerunning the schema is safe for the policies/functions/publication statements.

## Browser config
Put the Supabase project URL and **publishable** key in `public/config.js`. Never put an `sb_secret_...` key in the browser.

## Important multiplayer note
This uses a single Supabase Realtime channel named `pixel-plaza-v2`. Supabase Presence is responsible for showing everyone who is currently connected; Broadcast sends fast movement updates. The game sends absolute world coordinates and floor numbers, so players anywhere in the world can share the same world.

For a public production game, add Supabase Auth, stronger username ownership, rate limiting, moderation and authenticated/private DM policies. This prototype deliberately keeps joining friction low.

### Multiplayer performance
Presence is used only for online/initial state. Movement uses Realtime Broadcast, because Supabase documents Presence as unsuitable for high-frequency updates and limits clients to a small number of Presence calls. Movement is throttled to about 8 updates/second per player.

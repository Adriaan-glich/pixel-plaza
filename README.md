# Pixel Plaza — realtime 2D multiplayer room

A small browser multiplayer room for Vercel + Supabase.

## Features

- 2D animated pixel-style characters
- WASD / arrow-key movement
- Realtime player positions
- Online player list
- Username reservation with a database UNIQUE constraint
- Global chat
- Click a player to open a private DM
- Disconnect cleanup through Realtime Presence
- Responsive touch controls
- No framework required

## 1. Create a Supabase project

Create a project at Supabase.

Open **SQL Editor** and run:

`supabase/schema.sql`

This creates the username table, message tables, RLS policies and the `reserve_username` function.

## 2. Get your browser keys

From the Supabase project settings, copy:

- Project URL
- Publishable key (`sb_publishable_...`)

The publishable key is intended for browser use. Never put a Supabase secret/service-role key in this project.

## 3. Configure the frontend

Copy `.env.example` to `.env.local` for local development:

VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx

For Vercel, add the same two variables under:

Project Settings → Environment Variables

## 4. Install and run

```bash
npm install
npm run dev
```

Or:

```bash
npx vercel
```

## 5. Deploy

Push the folder to GitHub and import it into Vercel, or run:

```bash
npx vercel --prod
```

## Architecture

The browser joins a single Supabase Realtime channel named `pixel-plaza`.

Presence:
- announces who is online
- carries each player's username, x/y position and character appearance

Broadcast:
- movement updates
- global chat
- direct messages

Postgres:
- permanently reserves usernames while their reservation row exists
- stores chat/DM history if desired

For a production public game, add Supabase Auth and rate limiting/moderation before opening it widely.

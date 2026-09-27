# Split Signal

Split Signal is a live asymmetric deduction game for 2–6 players. Every operator receives different private clues, but the crew must independently lock the same correct protocol before the synchronization window closes.

## Features

- Real multiplayer rooms with four-character invite codes
- Private, player-specific clues
- Procedurally generated logic puzzles
- Five-round cooperative missions with energy, streaks, and scoring
- Three difficulty levels
- QR-code invitations and automatic session recovery
- Responsive interface for phones and laptops
- Persistent room state using Upstash Redis

## Local development

```bash
npm install
npm run dev
```

Without Redis environment variables, local development uses an in-memory store. To test persistence, copy `.env.example` to `.env.local` and provide credentials for an Upstash Redis database.

## Production

The application is built with Next.js and deployed on Vercel. The live version is available at [split-signal-one.vercel.app](https://split-signal-one.vercel.app).

## Game rules

1. Create a room and invite 1–5 other players.
2. Each player reads their classified clues aloud.
3. Discuss which of the four candidate sequences satisfies every clue.
4. Every player locks a protocol independently.
5. The crew succeeds only when everyone locks the same correct protocol.

A wrong answer, split decision, or expired timer costs one energy cell. Survive all five incidents to complete the mission.

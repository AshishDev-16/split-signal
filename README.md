# Split Signal

Split Signal is a live asymmetric deduction game for 2–6 players. Every player receives different private clues, but the crew must discuss them and independently lock the same correct protocol before the synchronization window closes.

**Live game:** [split-signal-one.vercel.app](https://split-signal-one.vercel.app)

No accounts or installations are required—create a room, share its code or QR invitation, and play from separate phones or laptops.

## What makes it different

The answer cannot be solved from a single screen. Players have to communicate because each person holds only part of the evidence. Even after finding the likely answer, everyone must lock the same choice: a split decision still fails the round.

## Features

- Live multiplayer rooms with four-character invite codes
- Private, player-specific clues
- Procedurally generated logic puzzles
- Five-round cooperative missions with hearts, streaks, and team scoring
- Three difficulty levels: Chill, Spicy, and Chaos
- QR-code invitations and automatic session recovery
- Player readiness, quick communication pings, and timed rounds
- Reveal screens, round summaries, and replayable final results
- Host transfer and a clear quit flow when someone leaves
- Responsive interface for phones and laptops
- Persistent production room state using Upstash Redis

## Game rules

1. Create a room and invite 1–5 other players.
2. Each player reads their private clues aloud.
3. Discuss which of the four candidate sequences satisfies every clue.
4. Every player locks an answer independently.
5. The crew succeeds only when everyone chooses the same correct protocol.

A wrong answer, split decision, or expired timer costs one heart. Complete all five incidents before the crew runs out of hearts.

## Technology

- Next.js and React with TypeScript
- Vercel Functions for the multiplayer API
- Upstash Redis for shared room state and short-lived room locks
- QR code invitations
- Browser storage for session recovery

The clients poll lightweight room snapshots so separate devices stay synchronized. Private clues and the correct answer remain filtered on the server until the reveal phase.

## Run locally

```bash
git clone https://github.com/AshishDev-16/split-signal.git
cd split-signal
npm install
npm run dev
```

Without Redis environment variables, local development uses an in-memory store. To test persistent multiplayer state, copy `.env.example` to `.env.local` and provide credentials for an Upstash Redis database.

Useful checks:

```bash
npm run lint
npm run build
```

## Development transparency

This is a **vibe-coded, AI-assisted project**. Ashish Kadu defined the game concept, rules, multiplayer requirements, visual direction, testing scenarios, iteration priorities, and deployment. AI coding tools helped generate and refine parts of the implementation. This disclosure is intentional: the project demonstrates the ability to direct, test, improve, and ship an AI-built multiplayer experience—not a claim that every line was written by hand.

## Creator

Designed, directed, tested, and shipped by **Ashish Kadu**.

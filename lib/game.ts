export const GLYPHS = ["pulse", "delta", "orbit", "prism", "nova", "echo"] as const;
export type Glyph = (typeof GLYPHS)[number];

export type Candidate = Glyph[];
export type GamePhase = "lobby" | "playing" | "reveal" | "finished";

export interface Clue {
  id: string;
  text: string;
  type: string;
}

export interface Player {
  id: string;
  name: string;
  role: string;
  joinedAt: number;
  lastSeen: number;
  choice: number | null;
  ping: { type: string; at: number } | null;
}

export interface Puzzle {
  incident: string;
  candidates: Candidate[];
  correctIndex: number;
  clues: Record<string, Clue[]>;
  allClues: Clue[];
  startedAt: number;
  endsAt: number;
}

export interface RoundResult {
  success: boolean;
  unanimous: boolean;
  timedOut: boolean;
  correctIndex: number;
  points: number;
  message: string;
}

export interface Room {
  code: string;
  hostId: string;
  phase: GamePhase;
  createdAt: number;
  updatedAt: number;
  revision: number;
  difficulty: "cadet" | "operator" | "blackout";
  round: number;
  totalRounds: number;
  energy: number;
  score: number;
  streak: number;
  players: Player[];
  puzzle: Puzzle | null;
  result: RoundResult | null;
  history: RoundResult[];
}

const ROLES = ["Decoder", "Navigator", "Analyst", "Sentinel", "Liaison", "Auditor"];
const INCIDENTS = [
  "REACTOR HANDSHAKE LOST",
  "NAVIGATION ARRAY DESYNC",
  "OXYGEN GRID LOOP DETECTED",
  "UNKNOWN SIGNAL ON DECK 7",
  "SHIELD HARMONICS COLLAPSING",
  "MEMORY CORE SPLIT-BRAIN",
  "THRUSTER RELAY LOCKOUT",
  "CRYO VAULT AUTH FAILURE",
];

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seedText: string) {
  let seed = hash(seedText) || 1;
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function same(a: Candidate, b: Candidate) {
  return a.join("|") === b.join("|");
}

function cluePool(target: Candidate): Array<Clue & { test: (c: Candidate) => boolean }> {
  const ordinal = ["first", "second", "third", "fourth"];
  const pool: Array<Clue & { test: (c: Candidate) => boolean }> = [];
  target.forEach((glyph, index) => {
    pool.push({
      id: `pos-${index}-${glyph}`,
      text: `The ${ordinal[index]} glyph is ${glyph.toUpperCase()}.`,
      type: "POSITION",
      test: (c) => c[index] === glyph,
    });
    pool.push({
      id: `in-${glyph}`,
      text: `${glyph.toUpperCase()} appears somewhere in the protocol.`,
      type: "PRESENCE",
      test: (c) => c.includes(glyph),
    });
  });
  GLYPHS.filter((g) => !target.includes(g)).forEach((glyph) =>
    pool.push({
      id: `out-${glyph}`,
      text: `${glyph.toUpperCase()} is not part of the protocol.`,
      type: "EXCLUSION",
      test: (c) => !c.includes(glyph),
    }),
  );
  for (let i = 0; i < target.length - 1; i++) {
    const a = target[i];
    const b = target[i + 1];
    pool.push({
      id: `adj-${a}-${b}`,
      text: `${a.toUpperCase()} touches ${b.toUpperCase()}.`,
      type: "ADJACENCY",
      test: (c) => Math.abs(c.indexOf(a) - c.indexOf(b)) === 1,
    });
    pool.push({
      id: `before-${a}-${b}`,
      text: `${a.toUpperCase()} comes before ${b.toUpperCase()}.`,
      type: "ORDER",
      test: (c) => c.indexOf(a) >= 0 && c.indexOf(b) >= 0 && c.indexOf(a) < c.indexOf(b),
    });
  }
  [target[0], target[3]].forEach((glyph) =>
    pool.push({
      id: `edge-${glyph}`,
      text: `${glyph.toUpperCase()} sits on an outer edge.`,
      type: "EDGE",
      test: (c) => c[0] === glyph || c[3] === glyph,
    }),
  );
  return pool;
}

export function makePuzzle(room: Room): Puzzle {
  const random = rng(`${room.code}:${room.round}:${room.players.length}:${room.createdAt}`);
  const target = shuffle<Glyph>([...GLYPHS], random).slice(0, 4);
  const decoys: Candidate[] = [];
  let attempts = 0;
  while (decoys.length < 3 && attempts++ < 100) {
    const d = [...target];
    if (random() < 0.62) {
      const a = Math.floor(random() * 4);
      let b = Math.floor(random() * 4);
      if (a === b) b = (b + 1) % 4;
      [d[a], d[b]] = [d[b], d[a]];
    } else {
      const missing = GLYPHS.filter((g) => !d.includes(g));
      d[Math.floor(random() * 4)] = missing[Math.floor(random() * missing.length)];
    }
    if (!same(d, target) && !decoys.some((x) => same(x, d))) decoys.push(d);
  }

  const candidates = shuffle([target, ...decoys], random);
  const correctIndex = candidates.findIndex((c) => same(c, target));
  const pool = shuffle(cluePool(target), random);
  const selected: typeof pool = [];
  let alive = candidates.map((_, i) => i);
  while (alive.length > 1) {
    let best = pool.find((clue) => !selected.includes(clue) && clue.test(target));
    let bestRemaining = alive.length;
    for (const clue of pool) {
      if (selected.includes(clue) || !clue.test(target)) continue;
      const remaining = alive.filter((i) => clue.test(candidates[i])).length;
      if (remaining < bestRemaining) {
        best = clue;
        bestRemaining = remaining;
      }
    }
    if (!best || bestRemaining === alive.length) break;
    selected.push(best);
    alive = alive.filter((i) => best!.test(candidates[i]));
  }

  const desired = Math.max(6, room.players.length);
  for (const clue of pool) {
    if (selected.length >= desired) break;
    if (!selected.includes(clue) && clue.test(target)) selected.push(clue);
  }
  const publicClues = selected.map((clue) => ({ id: clue.id, text: clue.text, type: clue.type }));
  const assignments: Record<string, Clue[]> = {};
  room.players.forEach((p) => (assignments[p.id] = []));
  publicClues.forEach((clue, i) => {
    assignments[room.players[i % room.players.length].id].push(clue);
  });

  const seconds = room.difficulty === "cadet" ? 105 : room.difficulty === "operator" ? 80 : 60;
  const startedAt = Date.now();
  return {
    incident: INCIDENTS[Math.floor(random() * INCIDENTS.length)],
    candidates,
    correctIndex,
    clues: assignments,
    allClues: publicClues,
    startedAt,
    endsAt: startedAt + seconds * 1000,
  };
}

export function roleFor(index: number) {
  return ROLES[index % ROLES.length];
}

export function resolveRound(room: Room, timedOut = false) {
  if (!room.puzzle || room.phase !== "playing") return;
  const choices = room.players.map((p) => p.choice).filter((c): c is number => c !== null);
  const unanimous = choices.length === room.players.length && choices.every((c) => c === choices[0]);
  const success = unanimous && choices[0] === room.puzzle.correctIndex;
  const timeLeft = Math.max(0, Math.ceil((room.puzzle.endsAt - Date.now()) / 1000));
  const points = success ? 500 + timeLeft * 8 + room.streak * 150 : 0;
  if (success) {
    room.score += points;
    room.streak += 1;
  } else {
    room.energy = Math.max(0, room.energy - 1);
    room.streak = 0;
  }
  room.result = {
    success,
    unanimous,
    timedOut,
    correctIndex: room.puzzle.correctIndex,
    points,
    message: success
      ? "Signal aligned. The system accepted your shared protocol."
      : timedOut
        ? "The window closed before every operator locked a protocol."
        : unanimous
          ? "Perfect alignment—on the wrong protocol. Recheck every clue."
          : "Your signals split. Alignment requires the same final protocol.",
  };
  room.history.push(room.result);
  room.phase = "reveal";
}

export function newRoom(code: string, hostId: string, name: string): Room {
  const now = Date.now();
  return {
    code,
    hostId,
    phase: "lobby",
    createdAt: now,
    updatedAt: now,
    revision: 1,
    difficulty: "operator",
    round: 1,
    totalRounds: 5,
    energy: 3,
    score: 0,
    streak: 0,
    players: [{ id: hostId, name, role: roleFor(0), joinedAt: now, lastSeen: now, choice: null, ping: null }],
    puzzle: null,
    result: null,
    history: [],
  };
}

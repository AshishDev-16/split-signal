"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Copy,
  Crown,
  Eye,
  Gauge,
  Gamepad2,
  HelpCircle,
  LockKeyhole,
  LogOut,
  PartyPopper,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";

type Glyph = "pulse" | "delta" | "orbit" | "prism" | "nova" | "echo";
type Phase = "lobby" | "playing" | "reveal" | "finished";
type Clue = { id: string; text: string; type: string };
type PublicPlayer = {
  id: string;
  name: string;
  role: string;
  isHost: boolean;
  isYou: boolean;
  locked: boolean;
  choice?: number;
  ping: { type: string; at: number } | null;
};
type PublicRoom = {
  code: string;
  hostId: string;
  phase: Phase;
  revision: number;
  difficulty: "cadet" | "operator" | "blackout";
  round: number;
  totalRounds: number;
  energy: number;
  score: number;
  streak: number;
  players: PublicPlayer[];
  puzzle: null | {
    incident: string;
    candidates: Glyph[][];
    startedAt: number;
    endsAt: number;
    myClues: Clue[];
    allClues?: Clue[];
    correctIndex?: number;
  };
  result: null | {
    success: boolean;
    unanimous: boolean;
    timedOut: boolean;
    correctIndex: number;
    points: number;
    message: string;
  };
  history: Array<{ success: boolean; unanimous: boolean; points: number }>;
  myChoice: number | null;
  storage: string;
};

const GLYPH_META: Record<Glyph, { mark: string; label: string }> = {
  pulse: { mark: "⌁", label: "Pulse" },
  delta: { mark: "△", label: "Delta" },
  orbit: { mark: "◉", label: "Orbit" },
  prism: { mark: "◇", label: "Prism" },
  nova: { mark: "✦", label: "Nova" },
  echo: { mark: "≈", label: "Echo" },
};

const PING_LABELS: Record<string, string> = {
  "lean-a": "SIGNAL A",
  "lean-b": "SIGNAL B",
  "lean-c": "SIGNAL C",
  "lean-d": "SIGNAL D",
  conflict: "CLUE CONFLICT",
  time: "NEED TIME",
};

const API = "/api/game";
const SESSION_KEY = "split-signal-session";

function GlyphMark({ glyph }: { glyph: Glyph }) {
  return (
    <span className={`glyph glyph-${glyph}`} title={GLYPH_META[glyph].label} aria-label={GLYPH_META[glyph].label}>
      {GLYPH_META[glyph].mark}
    </span>
  );
}

function Logo() {
  return (
    <div className="brand" aria-label="Split Signal">
      <span className="brand-mark"><Gamepad2 size={20} /></span>
      <span>Split <span>Signal!</span></span>
    </div>
  );
}

function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button className="icon-button" onClick={onToggle} aria-label={muted ? "Turn sound on" : "Mute sound"}>
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}

function QuitDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <section className="modal quit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quit-icon"><LogOut size={28} /></div>
        <p className="eyebrow">LEAVE THIS GAME?</p>
        <h2>Calling it a round?</h2>
        <p>Your spot will open up for someone else. If you&apos;re the host, another player will become the host.</p>
        <div className="quit-actions">
          <button className="secondary" onClick={onCancel}>KEEP PLAYING</button>
          <button className="danger-button" onClick={onConfirm}>QUIT GAME</button>
        </div>
      </section>
    </div>
  );
}

function IntroHowTo({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <p className="eyebrow cyan">HOW TO PLAY</p>
        <h2>Put your clues together!</h2>
        <div className="steps">
          <div><span>1</span><div><b>Peek at your clues</b><p>Every player gets a different piece of the puzzle.</p></div></div>
          <div><span>2</span><div><b>Chat with your crew</b><p>Share what you know—nobody can solve it alone!</p></div></div>
          <div><span>3</span><div><b>Pick the same answer</b><p>Everyone locks the correct pattern before time runs out.</p></div></div>
        </div>
        <div className="warning-strip"><AlertTriangle size={18} /> A wrong or split answer costs one heart.</div>
        <button className="primary full" onClick={onClose}>LET&apos;S PLAY! <ArrowRight size={18} /></button>
      </section>
    </div>
  );
}

function Landing({ onEnter, busy, error }: { onEnter: (mode: "create" | "join", name: string, code: string) => void; busy: boolean; error: string }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [how, setHow] = useState(false);

  useEffect(() => {
    const invite = new URLSearchParams(location.search).get("room");
    if (invite) queueMicrotask(() => { setMode("join"); setCode(invite.toUpperCase().slice(0, 4)); });
  }, []);

  return (
    <main className="landing shell-grid">
      <div className="noise" />
      <nav><Logo /><button className="text-button" onClick={() => setHow(true)}><HelpCircle size={17} /> HOW TO PLAY</button></nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="floaty floaty-one">✦</div><div className="floaty floaty-two">◇</div><div className="floaty floaty-three">≈</div>
          <div className="status-chip"><PartyPopper size={17} /> THE TEAM BRAIN GAME</div>
          <h1>DIFFERENT<br /><em>CLUES.</em><br />ONE BIG<br /><strong>BRAIN!</strong></h1>
          <p className="hero-deck">Share your secret clues, crack colorful patterns, and try to think like one big brain. Made for 2–6 friends!</p>
          <div className="feature-row">
            <span><LockKeyhole size={16} /> SECRET CLUES</span>
            <span><Activity size={16} /> PLAY TOGETHER</span>
            <span><Users size={16} /> 2–6 FRIENDS</span>
          </div>
        </div>
        <div className="entry-panel">
          <div className="panel-top"><span>READY FOR FUN?</span><span className="tiny-bars">● ● ●</span></div>
          <div className="mode-tabs">
            <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>HOST A GAME</button>
            <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>JOIN A GAME</button>
          </div>
          <label>YOUR NAME<input autoFocus maxLength={18} placeholder="What should friends call you?" value={name} onChange={(e) => setName(e.target.value)} /></label>
          {mode === "join" && <label>ROOM CODE<input className="code-input" maxLength={4} placeholder="4X7Q" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></label>}
          {error && <div className="form-error"><AlertTriangle size={15} />{error}</div>}
          <button className="primary full" disabled={busy || name.trim().length < 2 || (mode === "join" && code.length !== 4)} onClick={() => onEnter(mode, name, code)}>
            {busy ? <><span className="spinner" /> GETTING READY...</> : mode === "create" ? <>CREATE GAME <ArrowRight size={18} /></> : <>JOIN THE FUN <ArrowRight size={18} /></>}
          </button>
          <p className="fine-print"><ShieldCheck size={14} /> No accounts or downloads. Just invite and play!</p>
        </div>
      </section>
      <footer><span>★ SPLIT SIGNAL</span><span>BETTER WITH FRIENDS</span><span>GOOD VIBES ONLY ★</span></footer>
      {how && <IntroHowTo onClose={() => setHow(false)} />}
    </main>
  );
}

function Topbar({ room, muted, onMute, onQuit }: { room: PublicRoom; muted: boolean; onMute: () => void; onQuit: () => void }) {
  return (
    <header className="game-topbar">
      <Logo />
      <div className="mission-readout">
        <span>ROUND</span><b>{room.round} / {room.totalRounds}</b>
      </div>
      <div className="energy-readout" aria-label={`${room.energy} energy cells remaining`}>
        <span>HEARTS</span><div>{[0, 1, 2].map((n) => <i key={n} className={n < room.energy ? "live" : ""}>♥</i>)}</div>
      </div>
      <div className="score-readout"><span>TEAM SCORE</span><b>{room.score.toLocaleString()}</b></div>
      <SoundToggle muted={muted} onToggle={onMute} />
      <button className="quit-button" onClick={onQuit}><LogOut size={17} /><span>QUIT</span></button>
    </header>
  );
}

function Lobby({ room, playerId, act }: { room: PublicRoom; playerId: string; act: (action: string, extra?: object) => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window === "undefined" ? "" : `${location.origin}?room=${room.code}`;
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const isHost = room.hostId === playerId;

  return (
    <main className="game-shell lobby-page">
      <section className="lobby-main">
        <div>
          <p className="eyebrow lime"><PartyPopper size={16} /> YOUR ROOM IS READY!</p>
          <h1>GATHER YOUR<br />CLUE CREW!</h1>
          <p className="subcopy">Share the code or QR with your friends. Everyone joins on their own screen and gets secret clues.</p>
        </div>
        <div className="invite-card">
          <div className="qr-wrap"><QRCodeSVG value={shareUrl || room.code} size={132} bgColor="#f3f4e8" fgColor="#081018" level="M" /></div>
          <div className="invite-details"><span>ROOM CODE</span><strong>{room.code}</strong><button onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "COPIED!" : "COPY INVITE LINK"}</button></div>
        </div>
      </section>
      <section className="crew-section">
        <div className="section-heading"><div><span>YOUR PLAYERS</span><b>{room.players.length} / 6</b></div><div className="scan-status"><ScanLine size={16} /> WAITING FOR FRIENDS...</div></div>
        <div className="crew-grid">
          {room.players.map((p, i) => <div className="crew-card" key={p.id} style={{ "--delay": `${i * 70}ms` } as React.CSSProperties}><div className="crew-avatar">{p.name[0].toUpperCase()}<i /></div><div><b>{p.name} {p.isYou && <small>YOU</small>}</b><span>{p.role}</span></div>{p.isHost && <Crown size={17} className="host-crown" />}</div>)}
          {Array.from({ length: 6 - room.players.length }).map((_, i) => <div className="crew-card empty" key={i}><div className="empty-avatar">+</div><span>EMPTY SPOT</span></div>)}
        </div>
      </section>
      <section className="launch-bar">
        <div className="difficulty"><span>CHALLENGE</span>{(["cadet", "operator", "blackout"] as const).map((d) => <button key={d} disabled={!isHost} className={room.difficulty === d ? "active" : ""} onClick={() => act("difficulty", { difficulty: d })}>{d === "cadet" ? "CHILL" : d === "operator" ? "SPICY" : "CHAOS"}</button>)}</div>
        <div className="launch-action">
          {!isHost && <p>Waiting for <b>{room.players.find((p) => p.isHost)?.name}</b> to begin…</p>}
          {isHost && room.players.length < 2 && <p>Invite at least one more operator.</p>}
          {isHost && <button className="primary" disabled={room.players.length < 2} onClick={() => act("start")}>START THE FUN <Zap size={18} /></button>}
        </div>
      </section>
    </main>
  );
}

function Timer({ endsAt, onExpire }: { endsAt: number; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const value = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(value);
      if (value === 0 && !fired.current) { fired.current = true; onExpire(); }
    };
    tick(); const id = setInterval(tick, 250); return () => clearInterval(id);
  }, [endsAt, onExpire]);
  const min = Math.floor(left / 60); const sec = String(left % 60).padStart(2, "0");
  return <div className={`timer ${left <= 15 ? "danger" : ""}`}><Clock3 size={18} /><b>{min}:{sec}</b><span>SYNC WINDOW</span></div>;
}

function CandidateCard({ glyphs, index, selected, locked, correct, wrong, onSelect }: { glyphs: Glyph[]; index: number; selected: boolean; locked: boolean; correct?: boolean; wrong?: boolean; onSelect: () => void }) {
  return (
    <button className={`candidate ${selected ? "selected" : ""} ${locked ? "locked" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`} onClick={onSelect} disabled={locked}>
      <span className="candidate-letter">{String.fromCharCode(65 + index)}</span>
      <div className="glyph-code">{glyphs.map((g, i) => <GlyphMark key={`${g}-${i}`} glyph={g} />)}</div>
      <span className="candidate-state">{correct ? "VALID PROTOCOL" : wrong ? "REJECTED" : selected ? "READY TO LOCK" : "SELECT"}</span>
    </button>
  );
}

function PlayerRail({ players }: { players: PublicPlayer[] }) {
  return (
    <aside className="player-rail">
      <div className="rail-title"><Users size={16} /> CREW SIGNALS</div>
      {players.map((p) => <div className="rail-player" key={p.id}><div className={`mini-avatar ${p.locked ? "locked" : ""}`}>{p.locked ? <Check size={14} /> : p.name[0].toUpperCase()}</div><div><b>{p.name}{p.isYou ? " (YOU)" : ""}</b><span>{p.locked ? "ANSWER LOCKED" : "THINKING"}</span>{p.ping && <small>{PING_LABELS[p.ping.type]}</small>}</div></div>)}
    </aside>
  );
}

function GameBoard({ room, act }: { room: PublicRoom; act: (action: string, extra?: object) => void }) {
  const [draft, setDraft] = useState<number | null>(room.myChoice);
  const [pingOpen, setPingOpen] = useState(false);
  const puzzle = room.puzzle!;
  const locked = room.myChoice !== null;
  const expire = useCallback(() => act("timeout"), [act]);

  return (
    <main className="board-shell">
      <div className="incident-bar"><span><Sparkles size={16} /> PUZZLE {room.round}</span><b>{puzzle.incident.replaceAll("_", " ")}</b><Timer endsAt={puzzle.endsAt} onExpire={expire} /></div>
      <div className="board-layout">
        <section className="intel-column">
          <div className="section-label"><Eye size={16} /> YOUR SECRET CLUES</div>
          <div className="privacy-note"><LockKeyhole size={15} /> SHH—THESE ARE JUST FOR YOU</div>
          <div className="clue-stack">{puzzle.myClues.map((clue, i) => <article className="clue-card" key={clue.id}><span>{clue.type} · {String(i + 1).padStart(2, "0")}</span><p>{clue.text}</p><i /></article>)}</div>
          <p className="intel-tip">Read your clues out loud. Mix them with your friends&apos; clues to find the one pattern that fits.</p>
        </section>
        <section className="protocol-column">
          <div className="protocol-head"><div><p className="section-label">PICK A PATTERN</p><h2>Which one fits every clue?</h2></div><span>{room.players.filter((p) => p.locked).length}/{room.players.length} READY</span></div>
          <div className="candidates-grid">{puzzle.candidates.map((candidate, i) => <CandidateCard key={i} glyphs={candidate} index={i} selected={draft === i} locked={locked} onSelect={() => setDraft(i)} />)}</div>
          <div className="lock-row"><div className="consensus-meter"><span>FRIENDS READY</span><div>{room.players.map((p) => <i key={p.id} className={p.locked ? "filled" : ""} />)}</div></div><button className="primary lock-button" disabled={draft === null || locked} onClick={() => act("choose", { choice: draft })}>{locked ? <><Check size={18} /> ANSWER LOCKED</> : <><LockKeyhole size={18} /> LOCK ANSWER {draft === null ? "" : String.fromCharCode(65 + draft)}</>}</button></div>
          <div className="quick-ping"><button onClick={() => setPingOpen(!pingOpen)}><Radio size={16} /> QUICK REACTION</button>{pingOpen && <div className="ping-menu">{["lean-a", "lean-b", "lean-c", "lean-d", "conflict", "time"].map((p) => <button key={p} onClick={() => { act("ping", { type: p }); setPingOpen(false); }}>{PING_LABELS[p]}</button>)}</div>}</div>
        </section>
        <PlayerRail players={room.players} />
      </div>
    </main>
  );
}

function Reveal({ room, playerId, act }: { room: PublicRoom; playerId: string; act: (action: string) => void }) {
  const puzzle = room.puzzle!; const result = room.result!; const isHost = room.hostId === playerId;
  const final = room.round >= room.totalRounds || room.energy <= 0;
  return (
    <main className={`reveal-page ${result.success ? "success" : "failure"}`}>
      <div className="reveal-glow" />
      <section className="reveal-head"><div className="result-icon">{result.success ? <PartyPopper size={38} /> : <X size={38} />}</div><p className="eyebrow">{result.success ? "EVERYONE CLICKED" : "NOT QUITE"}</p><h1>{result.success ? "NAILED IT!" : result.timedOut ? "TIME'S UP!" : "SIGNALS CROSSED"}</h1><p>{result.message}</p>{result.points > 0 && <div className="points-burst">+{result.points.toLocaleString()} POINTS</div>}</section>
      <section className="reveal-content">
        <div className="answer-panel"><span>THE RIGHT ANSWER</span><div className="answer-code"><b>{String.fromCharCode(65 + result.correctIndex)}</b>{puzzle.candidates[result.correctIndex].map((g, i) => <GlyphMark key={i} glyph={g} />)}</div></div>
        <div className="crew-answers"><span>WHAT EVERYONE PICKED</span><div>{room.players.map((p) => <article key={p.id}><div className={p.choice === result.correctIndex ? "right" : "wrong"}>{p.choice === undefined || p.choice === null ? "—" : String.fromCharCode(65 + p.choice)}</div><b>{p.name}</b><small>{p.choice === result.correctIndex ? "NICE!" : p.choice == null ? "NO PICK" : "OOPS"}</small></article>)}</div></div>
        <div className="debrief"><span>ALL THE CLUES</span><div>{puzzle.allClues?.map((clue) => <p key={clue.id}><Check size={14} />{clue.text}</p>)}</div></div>
      </section>
      <section className="reveal-footer"><div><span>HEARTS</span><b>{room.energy}/3</b></div><div><span>STREAK</span><b>×{room.streak}</b></div><div><span>TOTAL SCORE</span><b>{room.score.toLocaleString()}</b></div>{isHost ? <button className="primary" onClick={() => act("next")}>{final ? "SEE FINAL SCORE" : "NEXT PUZZLE"} <ArrowRight size={18} /></button> : <p>Waiting for the host…</p>}</section>
    </main>
  );
}

function Finale({ room, playerId, act }: { room: PublicRoom; playerId: string; act: (action: string) => void }) {
  const wins = room.history.filter((r) => r.success).length;
  const alignment = Math.round((room.history.filter((r) => r.unanimous).length / Math.max(1, room.history.length)) * 100);
  const rating = room.energy > 0 && wins === room.totalRounds ? "LEGENDARY" : wins >= 4 ? "ELITE" : wins >= 3 ? "STABLE" : "CHAOTIC";
  const isHost = room.hostId === playerId;
  return (
    <main className="finale-page">
      <div className="finale-orbit"><PartyPopper size={34} /></div><p className="eyebrow lime">GAME COMPLETE</p><h1>{room.energy > 0 ? "THAT WAS SOME SERIOUS TEAM BRAIN." : "SO CLOSE—RUN IT BACK?"}</h1><p className="finale-deck">You turned a pile of secret clues into one shared answer.</p>
      <section className="rating-card"><span>YOUR CREW VIBE</span><strong>{rating}</strong><div className="rating-line" /></section>
      <section className="stats-grid"><article><Gauge size={22} /><span>FINAL SCORE</span><b>{room.score.toLocaleString()}</b></article><article><ShieldCheck size={22} /><span>INCIDENTS SOLVED</span><b>{wins} / {room.totalRounds}</b></article><article><Users size={22} /><span>ALIGNMENT RATE</span><b>{alignment}%</b></article><article><Zap size={22} /><span>ENERGY LEFT</span><b>{room.energy} / 3</b></article></section>
      <section className="crew-roll"><span>YOUR CLUE CREW</span><div>{room.players.map((p) => <i key={p.id}>{p.name}<small>{p.role}</small></i>)}</div></section>
      {isHost ? <button className="primary" onClick={() => act("restart")}><RotateCcw size={18} /> PLAY AGAIN</button> : <p className="waiting-copy">Waiting for the host to start another…</p>}
      <button className="secondary" onClick={() => act("leave")}><LogOut size={16} /> QUIT GAME</button>
    </main>
  );
}

export default function Home() {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [showQuit, setShowQuit] = useState(false);
  const revision = useRef(0);
  const audio = useRef<AudioContext | null>(null);

  const beep = useCallback((kind: "soft" | "good" | "bad") => {
    if (muted || typeof window === "undefined") return;
    try {
      const ctx = audio.current ?? new AudioContext(); audio.current = ctx;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = kind === "bad" ? "sawtooth" : "sine";
      osc.frequency.value = kind === "good" ? 660 : kind === "bad" ? 130 : 330;
      gain.gain.setValueAtTime(0.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.18);
    } catch { /* sound is optional */ }
  }, [muted]);

  const updateRoom = useCallback((next: PublicRoom) => {
    setRoom((previous) => {
      if (previous && next.revision > previous.revision) {
        if (next.phase === "reveal" && previous.phase === "playing") beep(next.result?.success ? "good" : "bad");
        else beep("soft");
      }
      return next;
    });
    revision.current = next.revision;
  }, [beep]);

  const request = useCallback(async (payload: object) => {
    const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The signal could not be completed.");
    return data;
  }, []);

  const enter = async (mode: "create" | "join", name: string, code: string) => {
    setBusy(true); setError("");
    try {
      const data = await request({ action: mode, name, code });
      setPlayerId(data.playerId); updateRoom(data.room);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ code: data.room.code, playerId: data.playerId }));
      history.replaceState({}, "", `?room=${data.room.code}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try {
      const session = JSON.parse(saved); queueMicrotask(() => setPlayerId(session.playerId));
      fetch(`${API}?code=${session.code}&playerId=${session.playerId}`, { cache: "no-store" }).then(async (r) => {
        const data = await r.json(); if (!r.ok) throw new Error(data.error); updateRoom(data.room);
      }).catch(() => localStorage.removeItem(SESSION_KEY));
    } catch { localStorage.removeItem(SESSION_KEY); }
  }, [updateRoom]);

  useEffect(() => {
    if (!room || !playerId) return;
    const delay = room.phase === "lobby" ? 1700 : room.phase === "playing" ? 1100 : 1500;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`${API}?code=${room.code}&playerId=${playerId}&r=${revision.current}`, { cache: "no-store" });
        if (response.ok) { const data = await response.json(); if (!stopped && data.room.revision !== revision.current) updateRoom(data.room); }
      } catch { /* transient network loss */ }
    };
    const id = setInterval(poll, delay); return () => { stopped = true; clearInterval(id); };
  }, [room, playerId, updateRoom]);

  const act = useCallback(async (action: string, extra: object = {}) => {
    if (!room) return;
    setError("");
    try {
      const data = await request({ action, code: room.code, playerId, ...extra });
      if (action === "leave") {
        localStorage.removeItem(SESSION_KEY);
        history.replaceState({}, "", "/");
        setRoom(null);
        setPlayerId("");
        setShowQuit(false);
      } else updateRoom(data.room);
    }
    catch (e) { setError(e instanceof Error ? e.message : "Signal interrupted."); }
  }, [room, playerId, request, updateRoom]);

  let screen: React.ReactNode;
  if (!room) screen = <Landing onEnter={enter} busy={busy} error={error} />;
  else if (room.phase === "lobby") screen = <Lobby room={room} playerId={playerId} act={act} />;
  else if (room.phase === "playing") screen = <GameBoard key={room.round} room={room} act={act} />;
  else if (room.phase === "reveal") screen = <Reveal room={room} playerId={playerId} act={act} />;
  else screen = <Finale room={room} playerId={playerId} act={act} />;

  return <>{room && <Topbar room={room} muted={muted} onMute={() => setMuted(!muted)} onQuit={() => setShowQuit(true)} />}{error && room && <div className="toast-error"><AlertTriangle size={16} />{error}<button onClick={() => setError("")}><X size={15} /></button></div>}{screen}{showQuit && room && <QuitDialog onCancel={() => setShowQuit(false)} onConfirm={() => act("leave")} />}</>;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Clipboard,
  Clock3,
  Copy,
  Crown,
  Eye,
  Gauge,
  HelpCircle,
  LockKeyhole,
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
      <span className="brand-mark"><Radio size={18} /></span>
      <span>SPLIT<span>//</span>SIGNAL</span>
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

function IntroHowTo({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <p className="eyebrow cyan">FIELD MANUAL // 01</p>
        <h2>Different clues.<br />One shared answer.</h2>
        <div className="steps">
          <div><span>01</span><div><b>Read privately</b><p>Every operator receives different classified clues.</p></div></div>
          <div><span>02</span><div><b>Talk openly</b><p>Describe what you know. Nobody can solve the signal alone.</p></div></div>
          <div><span>03</span><div><b>Lock together</b><p>Everyone must select the same correct protocol before time expires.</p></div></div>
        </div>
        <div className="warning-strip"><AlertTriangle size={18} /> A wrong or split decision costs one energy cell.</div>
        <button className="primary full" onClick={onClose}>UNDERSTOOD <ArrowRight size={18} /></button>
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
    if (invite) { setMode("join"); setCode(invite.toUpperCase().slice(0, 4)); }
  }, []);

  return (
    <main className="landing shell-grid">
      <div className="noise" />
      <nav><Logo /><button className="text-button" onClick={() => setHow(true)}><HelpCircle size={17} /> HOW TO PLAY</button></nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="status-chip"><i /> COOPERATIVE TRANSMISSION ONLINE</div>
          <h1>YOUR CLUES<br />ARE <em>DIFFERENT.</em><br />YOUR ANSWER<br />MUST BE <strong>THE SAME.</strong></h1>
          <p className="hero-deck">A live asymmetric deduction game for 2–6 players. Decode five emergencies before your station runs out of energy.</p>
          <div className="feature-row">
            <span><LockKeyhole size={16} /> PRIVATE INTEL</span>
            <span><Activity size={16} /> LIVE SYNC</span>
            <span><Users size={16} /> 2–6 OPERATORS</span>
          </div>
        </div>
        <div className="entry-panel">
          <div className="panel-top"><span>SECURE UPLINK</span><span className="tiny-bars">▮▮▮▯</span></div>
          <div className="mode-tabs">
            <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>CREATE ROOM</button>
            <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>JOIN ROOM</button>
          </div>
          <label>OPERATOR CALLSIGN<input autoFocus maxLength={18} placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          {mode === "join" && <label>ROOM FREQUENCY<input className="code-input" maxLength={4} placeholder="4X7Q" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></label>}
          {error && <div className="form-error"><AlertTriangle size={15} />{error}</div>}
          <button className="primary full" disabled={busy || name.trim().length < 2 || (mode === "join" && code.length !== 4)} onClick={() => onEnter(mode, name, code)}>
            {busy ? <><span className="spinner" /> ESTABLISHING...</> : mode === "create" ? <>CREATE TRANSMISSION <ArrowRight size={18} /></> : <>JOIN TRANSMISSION <ArrowRight size={18} /></>}
          </button>
          <p className="fine-print"><ShieldCheck size={14} /> No accounts. No downloads. Room data expires automatically.</p>
        </div>
      </section>
      <footer><span>SS//26</span><span>BUILT FOR HUMAN CONNECTION</span><span>ENCRYPTION: SOCIAL</span></footer>
      {how && <IntroHowTo onClose={() => setHow(false)} />}
    </main>
  );
}

function Topbar({ room, muted, onMute }: { room: PublicRoom; muted: boolean; onMute: () => void }) {
  return (
    <header className="game-topbar">
      <Logo />
      <div className="mission-readout">
        <span>MISSION</span><b>{String(room.round).padStart(2, "0")} / {String(room.totalRounds).padStart(2, "0")}</b>
      </div>
      <div className="energy-readout" aria-label={`${room.energy} energy cells remaining`}>
        <span>ENERGY</span><div>{[0, 1, 2].map((n) => <i key={n} className={n < room.energy ? "live" : ""} />)}</div>
      </div>
      <div className="score-readout"><span>TEAM SCORE</span><b>{room.score.toLocaleString()}</b></div>
      <SoundToggle muted={muted} onToggle={onMute} />
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
          <p className="eyebrow lime"><i /> TRANSMISSION ESTABLISHED</p>
          <h1>ASSEMBLE YOUR<br />SIGNAL CREW.</h1>
          <p className="subcopy">Share this frequency. Each operator joins from their own screen and receives private intel.</p>
        </div>
        <div className="invite-card">
          <div className="qr-wrap"><QRCodeSVG value={shareUrl || room.code} size={132} bgColor="#f3f4e8" fgColor="#081018" level="M" /></div>
          <div className="invite-details"><span>ROOM FREQUENCY</span><strong>{room.code}</strong><button onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "COPIED" : "COPY INVITE LINK"}</button></div>
        </div>
      </section>
      <section className="crew-section">
        <div className="section-heading"><div><span>ACTIVE OPERATORS</span><b>{room.players.length} / 6</b></div><div className="scan-status"><ScanLine size={16} /> SCANNING FREQUENCY...</div></div>
        <div className="crew-grid">
          {room.players.map((p, i) => <div className="crew-card" key={p.id} style={{ "--delay": `${i * 70}ms` } as React.CSSProperties}><div className="crew-avatar">{p.name[0].toUpperCase()}<i /></div><div><b>{p.name} {p.isYou && <small>YOU</small>}</b><span>{p.role}</span></div>{p.isHost && <Crown size={17} className="host-crown" />}</div>)}
          {Array.from({ length: 6 - room.players.length }).map((_, i) => <div className="crew-card empty" key={i}><div className="empty-avatar">+</div><span>OPEN CHANNEL</span></div>)}
        </div>
      </section>
      <section className="launch-bar">
        <div className="difficulty"><span>DIFFICULTY</span>{(["cadet", "operator", "blackout"] as const).map((d) => <button key={d} disabled={!isHost} className={room.difficulty === d ? "active" : ""} onClick={() => act("difficulty", { difficulty: d })}>{d}</button>)}</div>
        <div className="launch-action">
          {!isHost && <p>Waiting for <b>{room.players.find((p) => p.isHost)?.name}</b> to begin…</p>}
          {isHost && room.players.length < 2 && <p>Invite at least one more operator.</p>}
          {isHost && <button className="primary" disabled={room.players.length < 2} onClick={() => act("start")}>BEGIN MISSION <Zap size={18} /></button>}
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
  const now = Date.now();
  return (
    <aside className="player-rail">
      <div className="rail-title"><Users size={16} /> CREW SIGNALS</div>
      {players.map((p) => <div className="rail-player" key={p.id}><div className={`mini-avatar ${p.locked ? "locked" : ""}`}>{p.locked ? <Check size={14} /> : p.name[0].toUpperCase()}</div><div><b>{p.name}{p.isYou ? " (YOU)" : ""}</b><span>{p.locked ? "PROTOCOL LOCKED" : "ANALYZING"}</span>{p.ping && now - p.ping.at < 15000 && <small>{PING_LABELS[p.ping.type]}</small>}</div></div>)}
    </aside>
  );
}

function GameBoard({ room, act }: { room: PublicRoom; act: (action: string, extra?: object) => void }) {
  const [draft, setDraft] = useState<number | null>(room.myChoice);
  const [pingOpen, setPingOpen] = useState(false);
  const puzzle = room.puzzle!;
  const locked = room.myChoice !== null;
  useEffect(() => setDraft(room.myChoice), [room.myChoice, room.round]);
  const expire = useCallback(() => act("timeout"), [act]);

  return (
    <main className="board-shell">
      <div className="incident-bar"><span><AlertTriangle size={16} /> INCIDENT {String(room.round).padStart(2, "0")}</span><b>{puzzle.incident}</b><Timer endsAt={puzzle.endsAt} onExpire={expire} /></div>
      <div className="board-layout">
        <section className="intel-column">
          <div className="section-label"><Eye size={16} /> YOUR CLASSIFIED INTEL</div>
          <div className="privacy-note"><LockKeyhole size={15} /> ONLY YOU CAN SEE THIS</div>
          <div className="clue-stack">{puzzle.myClues.map((clue, i) => <article className="clue-card" key={clue.id}><span>{clue.type} // {String(i + 1).padStart(2, "0")}</span><p>{clue.text}</p><i /></article>)}</div>
          <p className="intel-tip">Say your clues aloud. Combining everyone’s intel is the only way to isolate one protocol.</p>
        </section>
        <section className="protocol-column">
          <div className="protocol-head"><div><p className="section-label">CANDIDATE PROTOCOLS</p><h2>Which sequence restores the system?</h2></div><span>{room.players.filter((p) => p.locked).length}/{room.players.length} LOCKED</span></div>
          <div className="candidates-grid">{puzzle.candidates.map((candidate, i) => <CandidateCard key={i} glyphs={candidate} index={i} selected={draft === i} locked={locked} onSelect={() => setDraft(i)} />)}</div>
          <div className="lock-row"><div className="consensus-meter"><span>CREW ALIGNMENT</span><div>{room.players.map((p) => <i key={p.id} className={p.locked ? "filled" : ""} />)}</div></div><button className="primary lock-button" disabled={draft === null || locked} onClick={() => act("choose", { choice: draft })}>{locked ? <><Check size={18} /> PROTOCOL LOCKED</> : <><LockKeyhole size={18} /> LOCK PROTOCOL {draft === null ? "" : String.fromCharCode(65 + draft)}</>}</button></div>
          <div className="quick-ping"><button onClick={() => setPingOpen(!pingOpen)}><Radio size={16} /> SEND CREW SIGNAL</button>{pingOpen && <div className="ping-menu">{["lean-a", "lean-b", "lean-c", "lean-d", "conflict", "time"].map((p) => <button key={p} onClick={() => { act("ping", { type: p }); setPingOpen(false); }}>{PING_LABELS[p]}</button>)}</div>}</div>
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
      <section className="reveal-head"><div className="result-icon">{result.success ? <Check size={38} /> : <X size={38} />}</div><p className="eyebrow">{result.success ? "CONSENSUS VERIFIED" : "SIGNAL FRACTURED"}</p><h1>{result.success ? "SYSTEM RESTORED" : result.timedOut ? "SYNC WINDOW LOST" : "PROTOCOL REJECTED"}</h1><p>{result.message}</p>{result.points > 0 && <div className="points-burst">+{result.points.toLocaleString()} PTS</div>}</section>
      <section className="reveal-content">
        <div className="answer-panel"><span>CORRECT PROTOCOL</span><div className="answer-code"><b>{String.fromCharCode(65 + result.correctIndex)}</b>{puzzle.candidates[result.correctIndex].map((g, i) => <GlyphMark key={i} glyph={g} />)}</div></div>
        <div className="crew-answers"><span>CREW DECISIONS</span><div>{room.players.map((p) => <article key={p.id}><div className={p.choice === result.correctIndex ? "right" : "wrong"}>{p.choice === undefined || p.choice === null ? "—" : String.fromCharCode(65 + p.choice)}</div><b>{p.name}</b><small>{p.choice === result.correctIndex ? "MATCH" : p.choice == null ? "NO LOCK" : "MISMATCH"}</small></article>)}</div></div>
        <div className="debrief"><span>DECLASSIFIED INTEL</span><div>{puzzle.allClues?.map((clue) => <p key={clue.id}><Check size={14} />{clue.text}</p>)}</div></div>
      </section>
      <section className="reveal-footer"><div><span>ENERGY</span><b>{room.energy}/3</b></div><div><span>STREAK</span><b>×{room.streak}</b></div><div><span>TOTAL SCORE</span><b>{room.score.toLocaleString()}</b></div>{isHost ? <button className="primary" onClick={() => act("next")}>{final ? "VIEW MISSION REPORT" : "NEXT INCIDENT"} <ArrowRight size={18} /></button> : <p>Waiting for host to continue…</p>}</section>
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
      <div className="finale-orbit"><Sparkles size={34} /></div><p className="eyebrow lime">MISSION REPORT // COMPLETE</p><h1>{room.energy > 0 ? "THE STATION SURVIVED." : "THE SIGNAL WENT DARK."}</h1><p className="finale-deck">Your crew transformed scattered private intel into one shared decision.</p>
      <section className="rating-card"><span>CREW CLASSIFICATION</span><strong>{rating}</strong><div className="rating-line" /></section>
      <section className="stats-grid"><article><Gauge size={22} /><span>FINAL SCORE</span><b>{room.score.toLocaleString()}</b></article><article><ShieldCheck size={22} /><span>INCIDENTS SOLVED</span><b>{wins} / {room.totalRounds}</b></article><article><Users size={22} /><span>ALIGNMENT RATE</span><b>{alignment}%</b></article><article><Zap size={22} /><span>ENERGY LEFT</span><b>{room.energy} / 3</b></article></section>
      <section className="crew-roll"><span>SURVIVING CREW</span><div>{room.players.map((p) => <i key={p.id}>{p.name}<small>{p.role}</small></i>)}</div></section>
      {isHost ? <button className="primary" onClick={() => act("restart")}><RotateCcw size={18} /> RUN A NEW MISSION</button> : <p className="waiting-copy">Waiting for the host to reopen the channel…</p>}
      <button className="secondary" onClick={() => { localStorage.removeItem(SESSION_KEY); location.href = "/"; }}>LEAVE TRANSMISSION</button>
    </main>
  );
}

export default function Home() {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
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
      const session = JSON.parse(saved); setPlayerId(session.playerId);
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
  }, [room?.code, room?.phase, playerId, updateRoom]);

  const act = useCallback(async (action: string, extra: object = {}) => {
    if (!room) return;
    setError("");
    try { const data = await request({ action, code: room.code, playerId, ...extra }); updateRoom(data.room); }
    catch (e) { setError(e instanceof Error ? e.message : "Signal interrupted."); }
  }, [room, playerId, request, updateRoom]);

  const screen = useMemo(() => {
    if (!room) return <Landing onEnter={enter} busy={busy} error={error} />;
    if (room.phase === "lobby") return <Lobby room={room} playerId={playerId} act={act} />;
    if (room.phase === "playing") return <GameBoard room={room} act={act} />;
    if (room.phase === "reveal") return <Reveal room={room} playerId={playerId} act={act} />;
    return <Finale room={room} playerId={playerId} act={act} />;
  }, [room, playerId, act, busy, error]);

  return <>{room && <Topbar room={room} muted={muted} onMute={() => setMuted(!muted)} />}{error && room && <div className="toast-error"><AlertTriangle size={16} />{error}<button onClick={() => setError("")}><X size={15} /></button></div>}{screen}</>;
}

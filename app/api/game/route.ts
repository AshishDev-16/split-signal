import { NextRequest, NextResponse } from "next/server";
import { makePuzzle, newRoom, resolveRound, roleFor, type Room } from "@/lib/game";
import { getRoom, roomExists, saveRoom, storageMode, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 18);
}

function cleanCode(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function publicRoom(room: Room, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  const reveal = room.phase === "reveal" || room.phase === "finished";
  return {
    ...room,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      isHost: p.id === room.hostId,
      isYou: p.id === playerId,
      locked: p.choice !== null,
      choice: reveal ? p.choice : undefined,
      ping: p.ping,
    })),
    puzzle: room.puzzle
      ? {
          incident: room.puzzle.incident,
          candidates: room.puzzle.candidates,
          startedAt: room.puzzle.startedAt,
          endsAt: room.puzzle.endsAt,
          myClues: room.puzzle.clues[playerId] ?? [],
          allClues: reveal ? room.puzzle.allClues : undefined,
          correctIndex: reveal ? room.puzzle.correctIndex : undefined,
        }
      : null,
    result: reveal ? room.result : null,
    myChoice: player?.choice ?? null,
    storage: storageMode(),
  };
}

function error(message: string, status = 400) {
  const friendly: Record<string, string> = {
    ROOM_NOT_FOUND: "That room has expired or does not exist.",
    ROOM_BUSY: "The signal is busy. Try that again.",
  };
  return NextResponse.json({ error: friendly[message] ?? message }, { status });
}

async function uniqueCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!(await roomExists(code))) return code;
  }
  throw new Error("Could not allocate a room code.");
}

export async function GET(request: NextRequest) {
  const code = cleanCode(request.nextUrl.searchParams.get("code"));
  const playerId = request.nextUrl.searchParams.get("playerId") ?? "";
  if (!code || !playerId) return error("Missing room credentials.");
  const room = await getRoom(code);
  if (!room) return error("ROOM_NOT_FOUND", 404);
  if (!room.players.some((p) => p.id === playerId)) return error("You are no longer in this room.", 403);
  return NextResponse.json({ room: publicRoom(room, playerId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "create") {
      const name = cleanName(body.name);
      if (name.length < 2) return error("Enter a name with at least 2 characters.");
      const code = await uniqueCode();
      const playerId = crypto.randomUUID();
      const room = newRoom(code, playerId, name);
      await saveRoom(room);
      return NextResponse.json({ playerId, room: publicRoom(room, playerId) });
    }

    if (action === "join") {
      const code = cleanCode(body.code);
      const name = cleanName(body.name);
      if (name.length < 2) return error("Enter a name with at least 2 characters.");
      if (!code) return error("Enter the 4-character room code.");
      const playerId = crypto.randomUUID();
      const response = await withRoomLock(code, (room) => {
        if (room.phase !== "lobby") throw new Error("This mission has already started.");
        if (room.players.length >= 6) throw new Error("This room already has 6 operators.");
        if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error("That name is already in use.");
        const now = Date.now();
        room.players.push({ id: playerId, name, role: roleFor(room.players.length), joinedAt: now, lastSeen: now, choice: null, ping: null });
        return publicRoom(room, playerId);
      });
      return NextResponse.json({ playerId, room: response });
    }

    const code = cleanCode(body.code);
    const playerId = String(body.playerId ?? "");
    if (!code || !playerId) return error("Missing room credentials.");
    const response = await withRoomLock(code, (room) => {
      const player = room.players.find((p) => p.id === playerId);
      if (!player) throw new Error("You are no longer in this room.");
      player.lastSeen = Date.now();

      if (action === "difficulty") {
        if (room.hostId !== playerId || room.phase !== "lobby") throw new Error("Only the host can change difficulty.");
        if (!["cadet", "operator", "blackout"].includes(body.difficulty)) throw new Error("Unknown difficulty.");
        room.difficulty = body.difficulty;
      } else if (action === "start") {
        if (room.hostId !== playerId || room.phase !== "lobby") throw new Error("Only the host can start.");
        if (room.players.length < 2) throw new Error("At least 2 operators are required.");
        room.players.forEach((p) => { p.choice = null; p.ping = null; });
        room.puzzle = makePuzzle(room);
        room.phase = "playing";
        room.result = null;
      } else if (action === "choose") {
        if (room.phase !== "playing" || !room.puzzle) throw new Error("Voting is closed.");
        const choice = Number(body.choice);
        if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new Error("Unknown protocol.");
        player.choice = choice;
        if (room.players.every((p) => p.choice !== null)) resolveRound(room, false);
      } else if (action === "ping") {
        if (room.phase !== "playing") throw new Error("Pings are only available during a round.");
        const type = String(body.type ?? "");
        if (!["lean-a", "lean-b", "lean-c", "lean-d", "conflict", "time"].includes(type)) throw new Error("Unknown ping.");
        player.ping = { type, at: Date.now() };
      } else if (action === "timeout") {
        if (room.phase === "playing" && room.puzzle && Date.now() >= room.puzzle.endsAt) resolveRound(room, true);
      } else if (action === "next") {
        if (room.hostId !== playerId || room.phase !== "reveal") throw new Error("Only the host can continue.");
        if (room.round >= room.totalRounds || room.energy <= 0) {
          room.phase = "finished";
        } else {
          room.round += 1;
          room.players.forEach((p) => { p.choice = null; p.ping = null; });
          room.result = null;
          room.puzzle = makePuzzle(room);
          room.phase = "playing";
        }
      } else if (action === "restart") {
        if (room.hostId !== playerId || room.phase !== "finished") throw new Error("Only the host can restart.");
        room.phase = "lobby";
        room.round = 1;
        room.energy = 3;
        room.score = 0;
        room.streak = 0;
        room.history = [];
        room.puzzle = null;
        room.result = null;
        room.players.forEach((p) => { p.choice = null; p.ping = null; });
      } else if (action === "leave") {
        room.players = room.players.filter((p) => p.id !== playerId);
        if (room.players.length > 0 && room.hostId === playerId) room.hostId = room.players[0].id;
        if (room.phase === "playing") {
          if (room.players.length < 2) {
            room.phase = "lobby";
            room.puzzle = null;
            room.result = null;
            room.players.forEach((p) => { p.choice = null; p.ping = null; });
          } else {
            room.players.forEach((p) => { p.choice = null; p.ping = null; });
            room.puzzle = makePuzzle(room);
            room.result = null;
          }
        }
      } else {
        throw new Error("Unknown action.");
      }
      return publicRoom(room, playerId);
    });
    return NextResponse.json({ room: response });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Something interrupted the signal.";
    return error(message, message === "ROOM_NOT_FOUND" ? 404 : 400);
  }
}

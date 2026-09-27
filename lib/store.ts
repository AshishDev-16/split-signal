import { Redis } from "@upstash/redis";
import type { Room } from "./game";

const globalStore = globalThis as unknown as { splitSignalRooms?: Map<string, Room> };
const memory = globalStore.splitSignalRooms ?? new Map<string, Room>();
globalStore.splitSignalRooms = memory;

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

const key = (code: string) => `split-signal:room:${code}`;

export async function getRoom(code: string): Promise<Room | null> {
  if (redis) return (await redis.get<Room>(key(code))) ?? null;
  return memory.get(code) ?? null;
}

export async function saveRoom(room: Room) {
  room.updatedAt = Date.now();
  room.revision += 1;
  if (redis) await redis.set(key(room.code), room, { ex: 60 * 60 * 24 });
  else memory.set(room.code, structuredClone(room));
}

export async function roomExists(code: string) {
  if (redis) return Boolean(await redis.exists(key(code)));
  return memory.has(code);
}

export async function withRoomLock<T>(code: string, work: (room: Room) => Promise<T> | T): Promise<T> {
  if (!redis) {
    const room = await getRoom(code);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    const result = await work(room);
    await saveRoom(room);
    return result;
  }

  const lockKey = `${key(code)}:lock`;
  const lockValue = crypto.randomUUID();
  for (let attempt = 0; attempt < 8; attempt++) {
    const acquired = await redis.set(lockKey, lockValue, { nx: true, ex: 3 });
    if (acquired) {
      try {
        const room = await getRoom(code);
        if (!room) throw new Error("ROOM_NOT_FOUND");
        const result = await work(room);
        await saveRoom(room);
        return result;
      } finally {
        if ((await redis.get(lockKey)) === lockValue) await redis.del(lockKey);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 45 + attempt * 35));
  }
  throw new Error("ROOM_BUSY");
}

export function storageMode() {
  return redis ? "redis" : "memory";
}

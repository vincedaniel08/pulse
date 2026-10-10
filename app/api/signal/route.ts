import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isSessionId, unauthorized } from "@/lib/auth";
import type { SignalType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

// Only the WebRTC handshake carries a payload.
const HANDSHAKE_TYPES: SignalType[] = ["offer", "answer", "ice"];

const MAX_PAYLOAD = 16 * 1024; // a full SDP with video is ~5 KB
const MAX_QUEUED = 100; // undelivered signals one sender may park in one mailbox
const REQUEST_COOLDOWN_MS = 2_000;

function reject(error: string, status: number) {
  return Response.json({ error }, { status });
}

// POST /api/signal — body { toId, type, payload? }
// Drops one message into the recipient's mailbox, but only if it is a legal
// move in the connection flow:
//
//   request  A → B   A is free. Remembered as A.requestedId = B.
//   accept   B → A   only while A.requestedId = B. Pairs them (peerId).
//   decline  B → A   only while A.requestedId = B.
//   offer / answer / ice   only between a connected pair.
//   end      cancels my pending request, or ends my connection.
//
// The sender is whoever the token belongs to; it is never read from the body.
export async function POST(request: NextRequest) {
  const me = await authenticate(request);
  if (!me) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reject("invalid body", 400);
  }

  const { toId, type, payload } = (body ?? {}) as Record<string, unknown>;

  if (!isSessionId(toId) || toId === me.id) {
    return reject("invalid recipient", 400);
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return reject("invalid type", 400);
  }
  const signalType = type as SignalType;

  let payloadStr: string | null = null;
  if (HANDSHAKE_TYPES.includes(signalType)) {
    if (
      typeof payload !== "string" ||
      payload.length > MAX_PAYLOAD ||
      !isJsonObject(payload)
    ) {
      return reject("invalid payload", 400);
    }
    payloadStr = payload;
  } else if (payload !== undefined && payload !== null) {
    return reject("unexpected payload", 400);
  }

  const target = await prisma.presence.findUnique({
    where: { id: toId },
    select: { peerId: true, requestedId: true },
  });

  switch (signalType) {
    case "request": {
      if (me.peerId) return reject("already connected", 409);
      if (
        me.requestedAt &&
        Date.now() - me.requestedAt.getTime() < REQUEST_COOLDOWN_MS
      ) {
        return reject("too many requests", 429);
      }
      // "One active connection at a time": if the target is gone or already
      // talking to someone, answer for them instead of interrupting.
      if (!target || target.peerId) {
        await prisma.signal.create({
          data: { fromId: toId, toId: me.id, type: "decline" },
        });
        return Response.json({ ok: true, autoDeclined: true });
      }
      await prisma.presence.updateMany({
        where: { id: me.id },
        data: { requestedId: toId, requestedAt: new Date() },
      });
      break;
    }

    case "accept": {
      if (me.peerId) return reject("already connected", 409);
      // Claim the requester in one conditional update, so two people
      // accepting at the same moment cannot both win.
      const claimed = await prisma.presence.updateMany({
        where: { id: toId, requestedId: me.id, peerId: null },
        data: { peerId: me.id, requestedId: null },
      });
      if (claimed.count === 0) return reject("no pending request", 409);
      await prisma.presence.updateMany({
        where: { id: me.id },
        data: { peerId: toId, requestedId: null },
      });
      break;
    }

    case "decline": {
      const cleared = await prisma.presence.updateMany({
        where: { id: toId, requestedId: me.id },
        data: { requestedId: null },
      });
      if (cleared.count === 0) return reject("no pending request", 409);
      break;
    }

    case "end": {
      if (me.peerId === toId) {
        await prisma.presence.updateMany({
          where: { id: me.id },
          data: { peerId: null },
        });
        // Free the other side only if they are still paired with us.
        await prisma.presence.updateMany({
          where: { id: toId, peerId: me.id },
          data: { peerId: null },
        });
      } else if (me.requestedId === toId) {
        await prisma.presence.updateMany({
          where: { id: me.id },
          data: { requestedId: null },
        });
      } else {
        return reject("nothing to end", 409);
      }
      break;
    }

    default: {
      // offer / answer / ice
      if (me.peerId !== toId) return reject("not connected", 403);
      const queued = await prisma.signal.count({
        where: { toId, fromId: me.id },
      });
      if (queued >= MAX_QUEUED) return reject("mailbox full", 429);
    }
  }

  // Nobody to deliver to (they left): the state above is already cleaned up.
  if (!target) return Response.json({ ok: true });

  await prisma.signal.create({
    data: { fromId: me.id, toId, type: signalType, payload: payloadStr },
  });

  return Response.json({ ok: true });
}

function isJsonObject(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

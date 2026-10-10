import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { hashToken, newToken } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { lat, lng } (raw coords).
// Creates a session: the server picks the public id and a secret token,
// applies the 1–3 km privacy offset and stores only the offset position.
// Raw coordinates are never stored.
export async function POST(request: NextRequest) {
  // Joining is the one unauthenticated write, so it is the easy way to flood
  // the map with fake dots. The IP is only used as a counter key in memory.
  if (!rateLimit(`join:${clientIp(request)}`, 10, 60_000)) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { lat, lng } = (body ?? {}) as Record<string, unknown>;
  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const offset = applyPrivacyOffset(lat as number, lng as number);
  const token = newToken();

  const me = await prisma.presence.create({
    data: {
      tokenHash: hashToken(token).toString("hex"),
      lat: offset.lat,
      lng: offset.lng,
      lastSeen: new Date(),
    },
    select: { id: true },
  });

  // The token is only ever sent here. The offset position goes back too, so
  // the client can show the user the same dot everyone else sees.
  return Response.json({ id: me.id, token, lat: offset.lat, lng: offset.lng });
}

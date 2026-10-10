import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — removes the caller's presence row and any pending
// signals to/from them. Sent with fetch({ keepalive: true }) on tab close.
export async function POST(request: NextRequest) {
  const me = await authenticate(request);
  if (!me) return unauthorized();

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: me.id }, { fromId: me.id }] },
  });
  await prisma.presence.deleteMany({ where: { id: me.id } });

  return Response.json({ ok: true });
}

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

// A session has two halves. The id is public: every peer sees it in the poll
// response and needs it to address a signal. The token is secret: it is
// returned once from /api/join and proves the caller owns that id.
// Requests carry both as `Authorization: Bearer <id>.<token>`.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

// Resolves the caller's presence row, or null if the credentials are missing,
// malformed, wrong, or the session no longer exists.
export async function authenticate(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, credentials = ""] = header.split(" ");
  const dot = credentials.indexOf(".");
  if (scheme !== "Bearer" || dot < 0) return null;

  const id = credentials.slice(0, dot);
  const token = credentials.slice(dot + 1);
  if (!isSessionId(id) || !token || token.length > 128) return null;

  const me = await prisma.presence.findUnique({ where: { id } });
  if (!me) return null;

  const expected = Buffer.from(me.tokenHash, "hex");
  const actual = hashToken(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return me;
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

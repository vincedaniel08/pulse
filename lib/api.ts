// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";

export interface Session {
  id: string; // public, other peers see it
  token: string; // secret, proves we own the id
}

function auth(session: Session): HeadersInit {
  return { Authorization: `Bearer ${session.id}.${session.token}` };
}

export async function join(
  lat: number,
  lng: number,
): Promise<Session & { lat: number; lng: number }> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  return res.json();
}

// Resolves to null when the server no longer knows this session.
export async function poll(session: Session): Promise<PollResponse | null> {
  const res = await fetch("/api/poll", {
    headers: auth(session),
    cache: "no-store",
  });
  if (res.status === 410) return null;
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  session: Session,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<boolean> {
  const res = await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(session) },
    body: JSON.stringify({ toId, type, payload }),
  });
  return res.ok;
}

// Fire-and-forget leave. keepalive lets the request outlive the tab, and
// unlike sendBeacon it can carry the Authorization header.
export function leave(session: Session): void {
  void fetch("/api/leave", {
    method: "POST",
    headers: auth(session),
    keepalive: true,
  });
}

// Shared types across client + API.

import type { Vibe } from "@/lib/vibes";

// Signal mailbox message types.
export type SignalType =
  | "request" // connection request (tap a dot)
  | "accept" // recipient accepted
  | "decline" // recipient declined (or auto-declined while busy)
  | "offer" // WebRTC SDP offer
  | "answer" // WebRTC SDP answer
  | "ice" // WebRTC ICE candidate
  | "end" // hang up / leave the connection
  | "wave"; // a hello that asks for nothing back

export interface PeerDot {
  id: string;
  lat: number;
  lng: number;
  busy: boolean;
  vibe: Vibe | null;
}

export interface SignalMsg {
  id: string;
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
  createdAt: string;
}

export interface PollResponse {
  peers: PeerDot[];
  signals: SignalMsg[];
}

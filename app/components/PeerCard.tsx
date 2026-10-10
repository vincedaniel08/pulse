"use client";

import type { PeerDot } from "@/lib/types";
import { VIBES } from "@/lib/vibes";
import { dotColor } from "@/lib/color";
import { describeDistance, describeTimeOfDay, distanceKm } from "@/lib/geo";
import { BlockIcon, CloseIcon } from "./icons";

// Shown when a dot is tapped. Turns an anonymous dot into a little bit of a
// person (mood, how far, what time of day it is for them) before you decide
// whether to wave, ask to talk, or hide them.
export default function PeerCard({
  peer,
  me,
  onWave,
  onConnect,
  onBlock,
  onClose,
}: {
  peer: PeerDot;
  me: { lat: number; lng: number };
  onWave: () => void;
  onConnect: () => void;
  onBlock: () => void;
  onClose: () => void;
}) {
  const color = dotColor(peer.id);
  const vibe = peer.vibe ? VIBES[peer.vibe] : null;

  return (
    <section
      aria-label="Stranger"
      className="glass animate-rise absolute inset-x-3 bottom-3 z-30 rounded-3xl p-5 sm:inset-x-auto sm:bottom-8 sm:left-1/2 sm:w-[360px] sm:-translate-x-1/2"
    >
      <div className="flex items-start gap-3.5">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-xl"
          style={{
            background: `color-mix(in srgb, ${color} 24%, transparent)`,
            boxShadow: `inset 0 0 0 1.5px ${color}`,
          }}
        >
          {vibe?.emoji ?? "👤"}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-zinc-50">
            {vibe ? vibe.label : "A stranger"}
          </h2>
          <p className="text-sm text-zinc-400">
            {describeDistance(distanceKm(me, peer))} · {describeTimeOfDay(peer.lng)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-1 flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onWave}
          className="h-11 flex-1 rounded-full bg-white/[0.07] text-sm font-medium text-zinc-100 transition hover:bg-white/[0.12] active:scale-[0.98]"
        >
          👋 Wave
        </button>
        <button
          onClick={onConnect}
          disabled={peer.busy}
          className="h-11 flex-[1.4] rounded-full bg-pulse text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:bg-white/[0.07] disabled:text-zinc-500"
        >
          {peer.busy ? "In a conversation" : "Ask to talk"}
        </button>
      </div>

      <button
        onClick={onBlock}
        className="mx-auto mt-3.5 flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
      >
        <BlockIcon /> Hide this person for the rest of my session
      </button>
    </section>
  );
}

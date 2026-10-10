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
      className="surface animate-rise absolute inset-x-3 bottom-3 z-30 rounded-xl p-4 sm:inset-x-auto sm:bottom-8 sm:left-1/2 sm:w-[360px] sm:-translate-x-1/2"
    >
      <div className="flex items-start gap-3.5">
        <span
          className="mt-1 size-3 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-zinc-50">
            {vibe ?? "A stranger"}
          </h2>
          <p className="text-sm text-zinc-400">
            {describeDistance(distanceKm(me, peer))} · {describeTimeOfDay(peer.lng)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-1 flex size-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onWave}
          className="h-10 flex-1 rounded-lg border border-line text-sm font-medium text-zinc-100 transition hover:bg-white/[0.06]"
        >
          Wave
        </button>
        <button
          onClick={onConnect}
          disabled={peer.busy}
          className="h-10 flex-[1.4] rounded-lg bg-white text-sm font-medium text-black transition hover:bg-zinc-200 disabled:bg-white/[0.06] disabled:text-zinc-500"
        >
          {peer.busy ? "In a conversation" : "Ask to talk"}
        </button>
      </div>

      <button
        onClick={onBlock}
        className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
      >
        <BlockIcon /> Hide this person for the rest of my session
      </button>
    </section>
  );
}

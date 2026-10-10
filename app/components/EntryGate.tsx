"use client";

import { useState } from "react";
import { VIBES, type Vibe } from "@/lib/vibes";
import { GhostIcon, LockIcon, PinIcon } from "./icons";

const PROMISES = [
  {
    icon: <PinIcon />,
    title: "Roughly here",
    text: "Your dot lands 1–3 km from where you really are.",
  },
  {
    icon: <LockIcon />,
    title: "Just between you two",
    text: "Chat and video go directly between browsers, never through us.",
  },
  {
    icon: <GhostIcon />,
    title: "Gone when you go",
    text: "No account, no history. Close the tab and your dot disappears.",
  },
];

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number, vibe: Vibe | null) => Promise<void>;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState("");
  const [vibe, setVibe] = useState<Vibe | null>(null);

  function fail(message: string) {
    setStatus("error");
    setError(message);
  }

  function enter() {
    if (!("geolocation" in navigator)) {
      fail("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onReady(pos.coords.latitude, pos.coords.longitude, vibe).catch(() =>
          fail("Couldn't reach Pulse. Please try again."),
        );
      },
      (err) =>
        fail(
          err.code === err.PERMISSION_DENIED
            ? "Pulse needs your location to place your dot. Allow it in your browser's site settings, then try again."
            : "Couldn't get your location. Please try again.",
        ),
      // maximumAge: 0 forces a fresh fix instead of a cached one.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const locating = status === "locating";

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center overflow-y-auto bg-gradient-to-t from-ink via-ink/70 to-ink/10 p-4 sm:items-center sm:p-6">
      <div className="glass animate-rise w-full max-w-md rounded-[28px] p-7 sm:p-9">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-pulse opacity-70" />
            <span className="relative inline-flex size-3 rounded-full bg-pulse" />
          </span>
          <span className="text-sm font-medium tracking-[0.2em] text-zinc-300 uppercase">
            Pulse
          </span>
        </div>

        <h1 className="mt-6 text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl">
          Somewhere out there, a stranger is awake.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
          Everyone online is a dot on the globe. Tap one to talk, by text or
          video.
        </p>

        <ul className="mt-7 space-y-4">
          {PROMISES.map((p) => (
            <li key={p.title} className="flex gap-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-pulse-soft">
                {p.icon}
              </span>
              <span className="text-sm leading-snug">
                <span className="font-medium text-zinc-100">{p.title}</span>
                <span className="block text-zinc-400">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <fieldset className="mt-7">
          <legend className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            What are you up for? <span className="normal-case">(optional)</span>
          </legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(Object.keys(VIBES) as Vibe[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={vibe === key}
                onClick={() => setVibe(vibe === key ? null : key)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  vibe === key
                    ? "bg-white text-ink"
                    : "bg-white/[0.07] text-zinc-300 hover:bg-white/[0.12]"
                }`}
              >
                {VIBES[key].emoji} {VIBES[key].label}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          onClick={enter}
          disabled={locating}
          className="mt-7 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-pulse text-[15px] font-semibold text-white shadow-[0_10px_40px_-10px] shadow-pulse transition hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
        >
          {locating && (
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {locating ? "Finding you…" : "Drop me on the map"}
        </button>

        <p
          role="alert"
          className={`mt-4 text-center text-sm text-pulse-soft ${status === "error" ? "" : "hidden"}`}
        >
          {error}
        </p>
        <p className="mt-4 text-center text-xs text-zinc-500">
          Your browser will ask for your location. It is only used to place
          the dot.
        </p>
      </div>
    </div>
  );
}

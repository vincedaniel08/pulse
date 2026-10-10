"use client";

import { useState } from "react";
import { VIBES, type Vibe } from "@/lib/vibes";

const FACTS = [
  ["Location", "Your dot is placed 1–3 km away from where you are."],
  ["Messages", "Chat and video go browser to browser. Nothing is stored."],
  ["Session", "No account. Close the tab and your dot is gone."],
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

  // A sheet on phones, a side panel on wider screens, so the globe stays in view.
  return (
    <div className="animate-fade absolute inset-x-0 bottom-0 z-40 max-h-full overflow-y-auto border-t border-line bg-panel p-6 sm:inset-y-0 sm:right-auto sm:flex sm:w-[400px] sm:flex-col sm:border-t-0 sm:border-r sm:p-10">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="size-2 rounded-full bg-pulse" />
        Pulse
      </p>

      <div className="mt-8 sm:my-auto">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight">
          Talk to a stranger, anywhere.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
          Everyone online is a dot on the map. Pick one and start a
          conversation.
        </p>

        <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
          {FACTS.map(([term, detail]) => (
            <div key={term} className="flex gap-4 py-3">
              <dt className="w-20 shrink-0 text-zinc-500">{term}</dt>
              <dd className="text-zinc-300">{detail}</dd>
            </div>
          ))}
        </dl>

        <fieldset className="mt-8">
          <legend className="text-sm text-zinc-500">
            What do you feel like? Optional.
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(VIBES) as Vibe[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={vibe === key}
                onClick={() => setVibe(vibe === key ? null : key)}
                className={`rounded-md border px-2.5 py-1.5 text-sm transition ${
                  vibe === key
                    ? "border-white bg-white text-black"
                    : "border-line text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {VIBES[key]}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          onClick={enter}
          disabled={locating}
          className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-60"
        >
          {locating && (
            <span className="size-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black" />
          )}
          {locating ? "Finding you…" : "Enter the map"}
        </button>

        <p
          role="alert"
          className={`mt-3 text-sm text-pulse-soft ${status === "error" ? "" : "hidden"}`}
        >
          {error}
        </p>
      </div>

      <p className="mt-6 text-xs text-zinc-600">
        Your browser will ask for your location. It is only used to place the
        dot.
      </p>
    </div>
  );
}

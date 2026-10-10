"use client";

// Card for "someone wants to connect" and "someone wants to start video".
// It floats over the map instead of blocking it, and shows how long the
// other side will keep waiting.
export default function ConnectionPrompt({
  title,
  subtitle,
  accent,
  acceptLabel,
  declineLabel,
  timeoutMs,
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle: string;
  accent: string; // the asking stranger's dot colour
  acceptLabel: string;
  declineLabel: string;
  timeoutMs?: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={title}
      className="glass animate-rise absolute inset-x-3 bottom-3 z-40 overflow-hidden rounded-3xl p-5 sm:inset-x-auto sm:top-20 sm:bottom-auto sm:left-1/2 sm:w-[360px] sm:-translate-x-1/2"
    >
      <div className="flex items-center gap-3.5">
        <span
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${accent} 22%, transparent)` }}
        >
          <span
            className="absolute size-full animate-ping rounded-full opacity-30"
            style={{ background: accent }}
          />
          <span className="size-3.5 rounded-full" style={{ background: accent }} />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-zinc-50">{title}</h2>
          <p className="text-sm text-zinc-400">{subtitle}</p>
        </div>
      </div>

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onDecline}
          className="h-11 flex-1 rounded-full bg-white/[0.07] text-sm font-medium text-zinc-200 transition hover:bg-white/[0.12] active:scale-[0.98]"
        >
          {declineLabel}
        </button>
        <button
          autoFocus
          onClick={onAccept}
          className="h-11 flex-1 rounded-full bg-pulse text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
        >
          {acceptLabel}
        </button>
      </div>

      {timeoutMs && (
        <span
          className="animate-drain absolute inset-x-0 bottom-0 h-0.5 origin-left bg-pulse/70"
          style={{ animationDuration: `${timeoutMs}ms` }}
        />
      )}
    </div>
  );
}

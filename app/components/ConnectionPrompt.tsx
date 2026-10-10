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
      className="surface animate-rise absolute inset-x-3 bottom-3 z-40 overflow-hidden rounded-xl p-4 sm:inset-x-auto sm:top-20 sm:bottom-auto sm:left-1/2 sm:w-[360px] sm:-translate-x-1/2"
    >
      <div className="flex items-center gap-3">
        <span
          className="size-3 shrink-0 animate-pulse rounded-full"
          style={{ background: accent }}
        />
        <div className="min-w-0">
          <h2 className="font-semibold text-zinc-50">{title}</h2>
          <p className="text-sm text-zinc-400">{subtitle}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onDecline}
          className="h-10 flex-1 rounded-lg border border-line text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
        >
          {declineLabel}
        </button>
        <button
          autoFocus
          onClick={onAccept}
          className="h-10 flex-1 rounded-lg bg-white text-sm font-medium text-black transition hover:bg-zinc-200"
        >
          {acceptLabel}
        </button>
      </div>

      {timeoutMs && (
        <span
          className="animate-drain absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/40"
          style={{ animationDuration: `${timeoutMs}ms` }}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_CHAT_LENGTH } from "@/lib/webrtc";
import { BlockIcon, CloseIcon, LockIcon, SendIcon, VideoIcon } from "./icons";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

export default function ChatPanel({
  messages,
  connected,
  peerTyping,
  accent,
  videoBusy,
  onSend,
  onTyping,
  onStartVideo,
  onBlock,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  peerTyping: boolean;
  accent: string; // the stranger's dot colour
  videoBusy: boolean;
  onSend: (text: string) => void;
  onTyping: () => void;
  onStartVideo: () => void;
  onBlock: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, peerTyping]);

  useEffect(() => {
    if (connected) inputRef.current?.focus();
  }, [connected]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section
      aria-label="Chat with stranger"
      className="glass animate-rise absolute inset-0 z-20 flex flex-col sm:inset-y-4 sm:right-4 sm:left-auto sm:w-[380px] sm:rounded-[28px]"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <span
          className="size-9 shrink-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, white -40%, ${accent} 55%)`,
            boxShadow: `0 0 18px -2px ${accent}`,
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-semibold">Stranger</p>
          <p className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className={`size-1.5 rounded-full ${connected ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`}
            />
            {connected ? "Connected directly to you" : "Opening a direct line…"}
          </p>
        </div>
        <button
          onClick={onStartVideo}
          disabled={!connected || videoBusy}
          aria-label="Start video call"
          title="Start video call"
          className="flex size-10 items-center justify-center rounded-full bg-white/[0.07] text-zinc-100 transition hover:bg-white/[0.14] disabled:opacity-35"
        >
          <VideoIcon />
        </button>
        <button
          onClick={onBlock}
          aria-label="Block and leave"
          title="Block and leave"
          className="flex size-10 items-center justify-center rounded-full bg-white/[0.07] text-zinc-100 transition hover:bg-white/[0.14]"
        >
          <BlockIcon />
        </button>
        <button
          onClick={onEnd}
          aria-label="End conversation"
          title="End conversation"
          className="flex size-10 items-center justify-center rounded-full bg-pulse/15 text-pulse-soft transition hover:bg-pulse hover:text-white"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 flex max-w-[240px] flex-col items-center gap-3 text-center text-sm text-zinc-400">
            <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300">
              <LockIcon />
            </span>
            <p>
              {connected
                ? "Say hello. Messages travel straight between your two browsers and are never stored."
                : "Hang tight, connecting your browsers to each other."}
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          // Square off the corner between consecutive bubbles from one side.
          const follows = messages[i - 1]?.mine === m.mine;
          return (
            <div
              key={m.id}
              className={`animate-rise flex ${m.mine ? "justify-end" : "justify-start"} ${follows ? "" : "pt-2"}`}
            >
              <p
                className={`max-w-[82%] rounded-[20px] px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap ${
                  m.mine
                    ? `bg-pulse text-white ${follows ? "rounded-tr-md" : ""}`
                    : `bg-white/[0.09] text-zinc-100 ${follows ? "rounded-tl-md" : ""}`
                }`}
              >
                {m.text}
              </p>
            </div>
          );
        })}

        {peerTyping && (
          <div className="animate-fade flex justify-start pt-2" aria-label="Stranger is typing">
            <span className="flex gap-1 rounded-[20px] bg-white/[0.09] px-3.5 py-3">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1.5 animate-bounce rounded-full bg-zinc-400"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onTyping();
          }}
          placeholder={connected ? "Message" : "Connecting…"}
          aria-label="Message"
          disabled={!connected}
          maxLength={MAX_CHAT_LENGTH}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-full bg-white/[0.07] px-4 text-[15px] outline-none placeholder:text-zinc-500 focus:bg-white/[0.11] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pulse text-white transition hover:brightness-110 active:scale-95 disabled:opacity-35"
        >
          <SendIcon />
        </button>
      </form>
    </section>
  );
}

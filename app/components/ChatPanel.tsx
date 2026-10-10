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
      className="surface animate-rise absolute inset-0 z-20 flex flex-col sm:inset-y-4 sm:right-4 sm:left-auto sm:w-[380px] sm:rounded-xl"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="size-3 shrink-0 rounded-full" style={{ background: accent }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-medium">Stranger</p>
          <p className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className={`size-1.5 rounded-full ${connected ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`}
            />
            {connected ? "Connected, peer to peer" : "Connecting…"}
          </p>
        </div>
        <button
          onClick={onStartVideo}
          disabled={!connected || videoBusy}
          aria-label="Start video call"
          title="Start video call"
          className="flex size-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
        >
          <VideoIcon />
        </button>
        <button
          onClick={onBlock}
          aria-label="Block and leave"
          title="Block and leave"
          className="flex size-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
        >
          <BlockIcon />
        </button>
        <button
          onClick={onEnd}
          aria-label="End conversation"
          title="End conversation"
          className="flex size-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-pulse hover:text-white"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 flex max-w-[240px] flex-col items-center gap-3 text-center text-sm text-zinc-500">
            <LockIcon />
            <p>
              {connected
                ? "Say hello. Messages go straight between your two browsers and are never stored."
                : "Connecting your two browsers…"}
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
                className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-snug break-words whitespace-pre-wrap ${
                  m.mine
                    ? `bg-zinc-100 text-zinc-900 ${follows ? "rounded-tr-md" : ""}`
                    : `bg-white/[0.08] text-zinc-100 ${follows ? "rounded-tl-md" : ""}`
                }`}
              >
                {m.text}
              </p>
            </div>
          );
        })}

        {peerTyping && (
          <div className="animate-fade flex justify-start pt-2" aria-label="Stranger is typing">
            <span className="flex gap-1 rounded-2xl bg-white/[0.08] px-3 py-3">
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
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 text-sm outline-none placeholder:text-zinc-500 focus:border-zinc-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          aria-label="Send"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-black transition hover:bg-zinc-200 disabled:opacity-30"
        >
          <SendIcon />
        </button>
      </form>
    </section>
  );
}

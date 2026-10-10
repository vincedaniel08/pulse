"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import PeerCard from "./components/PeerCard";
import { join, leave, poll, sendSignal, type Session } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { dotColor } from "@/lib/color";
import type { Vibe } from "@/lib/vibes";
import {
  type PeerDot,
  type PollResponse,
  type SignalMsg,
  type SignalType,
} from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

interface Notice {
  text: string;
  action?: { label: string; run: () => void };
}

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;
const TYPING_SEND_EVERY_MS = 2_000; // how often we tell the peer we're typing
const TYPING_SHOWN_MS = 3_500; // how long one "typing" keeps the dots up

export default function Home() {
  // Null until the server has issued us a session (id + secret token).
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  // The dot whose card is open, the latest wave we got, and the people this
  // user hid. All of it lives in memory and dies with the tab.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [waveFrom, setWaveFrom] = useState<{ id: string; at: number } | null>(null);
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());

  // Real coordinates stay in memory only, so we can rejoin if the session expires.
  const rawLocation = useRef<{ lat: number; lng: number } | null>(null);
  const vibeRef = useRef<Vibe | null>(null);
  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function signal(toId: string, type: SignalType, payload?: string) {
    const s = sessionRef.current;
    if (!s) return Promise.resolve(false);
    return sendSignal(s, toId, type, payload).catch(() => false);
  }

  // Start (or restart) a session from the real coordinates. The "me" pin uses
  // the offset position that comes back, i.e. the dot everyone else sees.
  async function enter(lat: number, lng: number) {
    const me = await join(lat, lng, vibeRef.current);
    sessionRef.current = { id: me.id, token: me.token };
    setSession(sessionRef.current);
    setMyLocation({ lat: me.lat, lng: me.lng });
  }

  function showNotice(text: string, action?: Notice["action"]) {
    // Restart the clock, so an older toast can't dismiss a newer one early.
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, action });
    // Leave more time when there is something to tap.
    noticeTimer.current = setTimeout(() => setNotice(null), action ? 8000 : 4000);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
    if (!mine) setPeerTyping(false);
  }

  function sendTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current = now;
    peerRef.current?.sendControl("typing");
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);
    setPeerTyping(false);
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void signal(peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          teardown("Connection failed (network).");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "typing":
        setPeerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), TYPING_SHOWN_MS);
        break;
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        break;
    }
  }

  function wave(peerId: string) {
    void signal(peerId, "wave").then((ok) =>
      showNotice(ok ? "Wave sent." : "One wave at a time."),
    );
  }

  // Hide someone for the rest of this session: their dot disappears and their
  // requests and waves are dropped. It is local on purpose. There are no
  // accounts to attach a server-side block to, and it leaves no record.
  function block(peerId: string) {
    setBlocked((prev) => new Set(prev).add(peerId));
    setSelectedId(null);
    const c = connRef.current;
    if (c.kind !== "idle" && c.peerId === peerId) {
      if (c.kind === "incoming") declineIncoming();
      else endConnection();
    }
    showNotice("Hidden. You won't see or hear from them again this session.");
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setSelectedId(null);
    setConn({ kind: "requesting", peerId });
    void signal(peerId, "request").then((ok) => {
      const c = connRef.current;
      if (!ok && c.kind === "requesting" && c.peerId === peerId) {
        teardown("Couldn't send the request. Try again in a moment.");
      }
    });
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void signal(peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void signal(connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void signal(peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void signal(connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void signal(c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "wave": {
        if (blocked.has(sig.fromId)) break;
        setWaveFrom({ id: sig.fromId, at: Date.now() });
        showNotice("A stranger waved at you.", {
          label: "Wave back",
          run: () => wave(sig.fromId),
        });
        break;
      }
      case "request": {
        if (connRef.current.kind === "idle" && !blocked.has(sig.fromId)) {
          setSelectedId(null);
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void signal(sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  async function handlePoll(data: PollResponse | null) {
    if (!data) {
      // Our session is gone, and so is any connection that hung off it.
      if (connRef.current.kind !== "idle") teardown("Connection lost.");
      const raw = rawLocation.current;
      if (raw) await enter(raw.lat, raw.lng);
      return;
    }
    setPeers(data.peers);
    for (const s of data.signals) processSignal(s);

    // A peer that closed the tab or lost network never sends "end".
    // Once their dot is gone, stop waiting for them.
    const c = connRef.current;
    if (c.kind !== "idle" && !data.peers.some((p) => p.id === c.peerId)) {
      void signal(c.peerId, "end"); // clears our busy flag
      if (c.kind === "incoming") setConn({ kind: "idle" });
      else teardown("Stranger disconnected.");
    }
  }

  // The poll loop is set up once per session but must call the handler from
  // the latest render, so it goes through a ref.
  const handlePollRef = useRef(handlePoll);
  useEffect(() => {
    handlePollRef.current = handlePoll;
  });

  useEffect(() => {
    if (!session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(session);
        if (active) await handlePollRef.current(data);
      } catch {
        // Network blip: keep polling.
      } finally {
        if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const onLeave = () => leave(session);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [session]);

  async function handleReady(lat: number, lng: number, vibe: Vibe | null) {
    rawLocation.current = { lat, lng };
    vibeRef.current = vibe;
    await enter(lat, lng);
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const peerColor = conn.kind === "idle" ? "#fff" : dotColor(conn.peerId);
  const visiblePeers = peers.filter((p) => !blocked.has(p.id));
  const selected =
    conn.kind === "idle" ? visiblePeers.find((p) => p.id === selectedId) : undefined;
  const pill =
    "surface animate-rise absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg text-sm whitespace-nowrap";

  return (
    <main className="fixed inset-x-0 top-0 h-dvh overflow-hidden bg-ink">
      {/* The globe is always there; before joining it just spins behind the gate. */}
      <WorldMap
        peers={visiblePeers}
        me={myLocation}
        linkedPeerId={
          conn.kind === "idle" || conn.kind === "incoming"
            ? (selected?.id ?? null)
            : conn.peerId
        }
        waveFrom={waveFrom}
        onPeerClick={setSelectedId}
        canConnect={conn.kind === "idle"}
      />

      {!session && <EntryGate onReady={handleReady} />}

      {session && !inChat && (
        <header className="surface animate-fade absolute top-4 left-4 z-10 flex items-center gap-2.5 rounded-lg px-3 py-2">
          <span className="size-2 rounded-full bg-pulse" />
          <span className="text-sm font-semibold">Pulse</span>
          <span className="h-3.5 w-px bg-line" />
          <span className="text-sm text-zinc-400" aria-live="polite">
            {visiblePeers.length === 0
              ? "Just you so far"
              : `${visiblePeers.length} ${visiblePeers.length === 1 ? "stranger" : "strangers"} online`}
          </span>
        </header>
      )}

      {selected && myLocation && (
        <PeerCard
          peer={selected}
          me={myLocation}
          onWave={() => wave(selected.id)}
          onConnect={() => requestConnection(selected.id)}
          onBlock={() => block(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {session && conn.kind === "idle" && !selected && (
        <p className="animate-fade pointer-events-none absolute inset-x-0 bottom-10 z-10 px-6 text-center text-sm text-zinc-400 [text-shadow:0_1px_12px_#000]">
          {visiblePeers.length === 0
            ? "No one else is here yet. Dots appear the moment someone joins."
            : "Tap a dot to see who's there."}
        </p>
      )}

      {notice && (
        <div role="status" className={`${pill} top-20 py-2 pl-4 ${notice.action ? "pr-2" : "pr-4"}`}>
          {notice.text}
          {notice.action && (
            <button
              onClick={() => {
                notice.action?.run();
              }}
              className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-black transition hover:bg-zinc-200"
            >
              {notice.action.label}
            </button>
          )}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div role="status" className={`${pill} bottom-10 py-2 pr-2 pl-4`}>
          <span
            className="size-2.5 animate-pulse rounded-full"
            style={{ background: peerColor }}
          />
          Waiting for them to answer…
          <button
            onClick={cancelRequest}
            className="rounded-md border border-line px-2.5 py-1 text-xs font-medium transition hover:bg-white/[0.06]"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to talk"
          subtitle="Starts as text. Video only if you both agree."
          accent={peerColor}
          acceptLabel="Accept"
          declineLabel="Not now"
          timeoutMs={REQUEST_TIMEOUT_MS}
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          peerTyping={peerTyping}
          accent={peerColor}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onTyping={sendTyping}
          onStartVideo={startVideoRequest}
          onBlock={() => block(conn.peerId)}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div role="status" className={`${pill} top-20 px-4 py-2.5`}>
          <span className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          Waiting for them to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Turn on video?"
          subtitle="They would like to start a video call."
          accent={peerColor}
          acceptLabel="Start video"
          declineLabel="Not now"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}

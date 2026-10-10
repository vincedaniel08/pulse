"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { join, leave, poll, sendSignal, type Session } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { dotColor } from "@/lib/color";
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
  const [notice, setNotice] = useState<string | null>(null);
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

  // Real coordinates stay in memory only, so we can rejoin if the session expires.
  const rawLocation = useRef<{ lat: number; lng: number } | null>(null);
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
    const me = await join(lat, lng);
    sessionRef.current = { id: me.id, token: me.token };
    setSession(sessionRef.current);
    setMyLocation({ lat: me.lat, lng: me.lng });
  }

  function showNotice(text: string) {
    // Restart the clock, so an older toast can't dismiss a newer one early.
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
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

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
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
      case "request": {
        if (connRef.current.kind === "idle") {
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

  async function handleReady(lat: number, lng: number) {
    rawLocation.current = { lat, lng };
    await enter(lat, lng);
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const peerColor = conn.kind === "idle" ? "#fff" : dotColor(conn.peerId);
  const pill =
    "glass animate-rise absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full text-sm whitespace-nowrap";

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink">
      {/* The globe is always there; before joining it just spins behind the gate. */}
      <WorldMap
        peers={peers}
        me={myLocation}
        linkedPeerId={conn.kind === "idle" || conn.kind === "incoming" ? null : conn.peerId}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
      />

      {!session && <EntryGate onReady={handleReady} />}

      {session && !inChat && (
        <header className="glass animate-fade absolute top-4 left-4 z-10 flex items-center gap-3 rounded-full py-2 pr-4 pl-3.5">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-pulse opacity-70" />
            <span className="relative inline-flex size-2.5 rounded-full bg-pulse" />
          </span>
          <span className="text-sm font-semibold tracking-wide">Pulse</span>
          <span className="h-3.5 w-px bg-line" />
          <span className="text-sm text-zinc-400" aria-live="polite">
            {peers.length === 0
              ? "Just you so far"
              : `${peers.length} ${peers.length === 1 ? "stranger" : "strangers"} online`}
          </span>
        </header>
      )}

      {session && conn.kind === "idle" && (
        <p className="animate-fade pointer-events-none absolute inset-x-0 bottom-10 z-10 px-6 text-center text-sm text-zinc-400 [text-shadow:0_1px_12px_#000]">
          {peers.length === 0
            ? "No one else is here yet. Stay a while, dots appear the moment someone joins."
            : "Tap a glowing dot to ask a stranger to talk."}
        </p>
      )}

      {notice && (
        <div role="status" className={`${pill} top-20 px-4 py-2.5`}>
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div role="status" className={`${pill} bottom-10 py-2 pr-2 pl-4`}>
          <span
            className="size-2.5 animate-pulse rounded-full"
            style={{ background: peerColor }}
          />
          Asking a stranger to talk…
          <button
            onClick={cancelRequest}
            className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium transition hover:bg-white/20"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to talk"
          subtitle="Text first. Video only if you both agree."
          accent={peerColor}
          acceptLabel="Say hi"
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
          subtitle="The stranger would like to see and hear you."
          accent={peerColor}
          acceptLabel="Start video"
          declineLabel="Keep typing"
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

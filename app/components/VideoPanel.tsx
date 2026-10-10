"use client";

import { useEffect, useRef, useState } from "react";
import {
  EyeIcon,
  LockIcon,
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "./icons";

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  // A stranger's camera starts blurred. You decide when (and whether) to look.
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Muting just disables the track: the other side gets silence / black
  // frames immediately, with no renegotiation.
  function toggleMic() {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  }
  function toggleCam() {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  }

  const round =
    "flex size-11 items-center justify-center rounded-lg transition";

  return (
    <section
      aria-label="Video call"
      className="animate-fade absolute inset-0 z-30 bg-black"
    >
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={`h-full w-full object-cover transition duration-500 ${revealed ? "" : "scale-110 blur-3xl"}`}
      />
      {remoteStream && !revealed && (
        <div className="animate-fade absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="max-w-xs text-sm text-zinc-200">
            Their video is blurred until you choose to see it. You can blur it
            again at any time.
          </p>
          <button
            onClick={() => setRevealed(true)}
            className="flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-medium text-black transition hover:bg-zinc-200"
          >
            <EyeIcon /> Show video
          </button>
        </div>
      )}
      {!remoteStream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-zinc-400">
          <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          Waiting for their camera…
        </div>
      )}

      <p className="surface absolute top-4 left-4 flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-zinc-300">
        <LockIcon /> Peer to peer, not recorded
      </p>

      {/* Mirrored, like every selfie preview. */}
      <video
        ref={localRef}
        autoPlay
        playsInline
        muted
        className={`absolute top-4 right-4 h-44 w-32 -scale-x-100 rounded-xl border border-white/15 bg-zinc-900 object-cover sm:h-56 sm:w-40 ${camOn ? "" : "opacity-0"}`}
      />

      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={toggleMic}
          aria-pressed={!micOn}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          className={`${round} ${micOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-black"}`}
        >
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </button>
        <button
          onClick={toggleCam}
          aria-pressed={!camOn}
          aria-label={camOn ? "Turn camera off" : "Turn camera on"}
          className={`${round} ${camOn ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-black"}`}
        >
          {camOn ? <VideoIcon /> : <VideoOffIcon />}
        </button>
        {revealed && (
          <button
            onClick={() => setRevealed(false)}
            className="h-11 rounded-lg bg-white/15 px-4 text-sm font-medium text-white transition hover:bg-white/25"
          >
            Blur
          </button>
        )}
        <button
          onClick={onEnd}
          className="h-11 rounded-lg bg-pulse px-5 text-sm font-medium text-white transition hover:brightness-110"
        >
          End video
        </button>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { LockIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from "./icons";

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
    "flex size-13 items-center justify-center rounded-full transition active:scale-95";

  return (
    <section
      aria-label="Video call"
      className="animate-fade absolute inset-0 z-30 bg-black"
    >
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
      />
      {!remoteStream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-zinc-400">
          <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          Waiting for their camera…
        </div>
      )}

      <p className="glass absolute top-4 left-4 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs text-zinc-300">
        <LockIcon /> Direct call, not recorded
      </p>

      {/* Mirrored, like every selfie preview. */}
      <video
        ref={localRef}
        autoPlay
        playsInline
        muted
        className={`absolute top-4 right-4 h-44 w-32 -scale-x-100 rounded-2xl border border-white/15 bg-zinc-900 object-cover shadow-2xl sm:h-56 sm:w-40 ${camOn ? "" : "opacity-0"}`}
      />

      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
        <button
          onClick={onEnd}
          className="h-13 rounded-full bg-pulse px-7 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-95"
        >
          End video
        </button>
      </div>
    </section>
  );
}

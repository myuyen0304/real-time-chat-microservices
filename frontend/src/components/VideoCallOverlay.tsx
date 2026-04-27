"use client";

import { useEffect, useRef } from "react";
import { Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { User } from "@/context/AppContext";

type CallPhase = "ringing" | "connecting" | "active";

interface VideoCallOverlayProps {
  callPhase: CallPhase;
  peer: User;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  hasRemoteVideo: boolean;
  isMuted: boolean;
  isCameraEnabled: boolean;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}

const phaseLabels: Record<CallPhase, string> = {
  ringing: "Calling...",
  connecting: "Connecting...",
  active: "Live",
};

const VideoCallOverlay = ({
  callPhase,
  peer,
  localStream,
  remoteStream,
  hasRemoteVideo,
  isMuted,
  isCameraEnabled,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: VideoCallOverlayProps) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-black/90 text-white backdrop-blur-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.28),transparent_38%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.75),transparent_55%)]" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between p-4 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-blue-300/80">
              Video Call
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              {peer.name}
            </h2>
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-300">
              {callPhase === "connecting" && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
              )}
              <span>{phaseLabels[callPhase]}</span>
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center px-4 pb-28 sm:px-6">
          <div className="absolute inset-0 flex items-center justify-center px-4">
            {hasRemoteVideo ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full rounded-[2rem] border border-white/10 bg-gray-950 object-cover shadow-2xl"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 bg-gray-950/70 px-6 text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-600/15 text-blue-300">
                  <Video className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-semibold text-white">
                  {peer.name}
                </h3>
                <p className="mt-2 max-w-sm text-sm text-gray-400">
                  {callPhase === "ringing"
                    ? "Waiting for the other person to answer the call."
                    : "Negotiating the peer connection and preparing the remote stream."}
                </p>
              </div>
            )}
          </div>

          <div className="absolute bottom-5 right-4 h-32 w-24 overflow-hidden rounded-2xl border border-white/10 bg-gray-950 shadow-xl sm:bottom-8 sm:right-8 sm:h-44 sm:w-32">
            {localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gray-900 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!isCameraEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white">
                <VideoOff className="h-5 w-5" />
              </div>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-gray-950/90 px-4 py-3 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={onToggleMute}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                isMuted
                  ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {isMuted ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={onToggleCamera}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                !isCameraEnabled
                  ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {isCameraEnabled ? (
                <Video className="h-5 w-5" />
              ) : (
                <VideoOff className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={onEnd}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCallOverlay;

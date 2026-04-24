"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import { chat_service, useAppData, User } from "./AppContext";
import { SocketData } from "./SocketContext";
import IncomingCallPopup from "@/components/IncomingCallPopup";
import VideoCallOverlay from "@/components/VideoCallOverlay";

type SerializedCall = {
  _id: string;
  chatId: string;
  initiatorId: string;
  recipientId: string;
  participants: string[];
  mode: "video";
  status:
    | "ringing"
    | "accepted"
    | "declined"
    | "missed"
    | "ended"
    | "cancelled";
  endReason:
    | "declined"
    | "missed"
    | "hangup"
    | "disconnect"
    | "cancelled"
    | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
};

type IncomingCallState = {
  call: SerializedCall;
  caller: User;
};

type ActiveCallState = {
  call: SerializedCall;
  peer: User;
  initiatedByMe: boolean;
  phase: "ringing" | "connecting" | "active";
};

interface CallContextType {
  currentCall: ActiveCallState | null;
  incomingCall: IncomingCallState | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraEnabled: boolean;
  isStartingCall: boolean;
  isCallBusy: boolean;
  startVideoCall: (chatId: string, peer: User) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  endCurrentCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
}

type CallApiResponse = {
  call: SerializedCall;
  peer?: User;
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
];

const getIceServers = (): RTCIceServer[] => {
  const rawValue = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS?.trim();

  if (!rawValue) {
    return FALLBACK_ICE_SERVERS;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as RTCIceServer[];
    if (Array.isArray(parsedValue) && parsedValue.length > 0) {
      return parsedValue;
    }
  } catch (error) {
    console.warn("Invalid NEXT_PUBLIC_WEBRTC_ICE_SERVERS value", error);
  }

  return FALLBACK_ICE_SERVERS;
};

const getCallApiConfig = () => {
  const token = Cookies.get("token");

  if (!token) {
    throw new Error("Authentication token is missing");
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getTerminalCallMessage = (call: SerializedCall): string => {
  if (call.status === "declined") {
    return "Video call declined";
  }

  if (call.status === "missed") {
    return "Missed video call";
  }

  if (call.status === "cancelled") {
    return "Video call cancelled";
  }

  if (call.endReason === "disconnect") {
    return "Video call ended because the connection was lost";
  }

  return "Video call ended";
};

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallbackMessage;
  }

  if (error instanceof Error) {
    return error.message || fallbackMessage;
  }

  return fallbackMessage;
};

const getMediaAccessError = (error?: unknown) => {
  const isSecureContextUnavailable =
    typeof window !== "undefined" && !window.isSecureContext;

  if (isSecureContextUnavailable) {
    return new Error(
      "Camera access on iPhone requires HTTPS or localhost. Open this app over HTTPS to use video calls.",
    );
  }

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return new Error(
        "Camera and microphone permission was denied. Please allow access and try again.",
      );
    }

    if (error.name === "NotFoundError") {
      return new Error("No camera or microphone was found on this device.");
    }

    if (error.name === "NotReadableError" || error.name === "AbortError") {
      return new Error(
        "The camera or microphone is already being used by another app or browser tab.",
      );
    }
  }

  return new Error(
    "This browser cannot access the camera in the current context.",
  );
};

const CallContext = createContext<CallContextType | undefined>(undefined);

interface CallProviderProps {
  children: ReactNode;
}

export const CallProvider = ({ children }: CallProviderProps) => {
  const router = useRouter();
  const { fetchChats, user } = useAppData();
  const { socket } = SocketData();
  const [currentCall, setCurrentCall] = useState<ActiveCallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(
    null,
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isStartingCall, setIsStartingCall] = useState(false);

  const currentCallRef = useRef<ActiveCallState | null>(null);
  const incomingCallRef = useRef<IncomingCallState | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef(socket);
  const fetchChatsRef = useRef(fetchChats);

  useEffect(() => {
    currentCallRef.current = currentCall;
  }, [currentCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    fetchChatsRef.current = fetchChats;
  }, [fetchChats]);

  const resetPeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const stopStreamTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  };

  const cleanupCallResources = () => {
    resetPeerConnection();
    stopStreamTracks(localStreamRef.current);
    stopStreamTracks(remoteStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraEnabled(true);
  };

  const syncChats = async () => {
    try {
      await fetchChatsRef.current();
    } catch (error) {
      console.error("Failed to refresh chats after call update", error);
    }
  };

  const clearCallState = () => {
    setCurrentCall(null);
    setIncomingCall(null);
    cleanupCallResources();
  };

  const handleTerminalCall = async (
    call: SerializedCall,
    suppressToast = false,
  ) => {
    const activeCallId = currentCallRef.current?.call._id;
    const incomingCallId = incomingCallRef.current?.call._id;

    if (activeCallId === call._id || incomingCallId === call._id) {
      clearCallState();
    }

    if (!suppressToast) {
      toast(getTerminalCallMessage(call));
    }

    await syncChats();
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw getMediaAccessError();
    }

    let nextLocalStream: MediaStream;

    try {
      nextLocalStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (error) {
      throw getMediaAccessError(error);
    }

    localStreamRef.current = nextLocalStream;
    setLocalStream(nextLocalStream);
    setIsMuted(false);
    setIsCameraEnabled(true);
    return nextLocalStream;
  };

  const ensurePeerConnection = async (callId: string) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const nextLocalStream = await ensureLocalStream();
    const nextPeerConnection = new RTCPeerConnection({
      iceServers: getIceServers(),
    });
    const nextRemoteStream = new MediaStream();

    remoteStreamRef.current = nextRemoteStream;
    setRemoteStream(nextRemoteStream);

    nextLocalStream.getTracks().forEach((track) => {
      nextPeerConnection.addTrack(track, nextLocalStream);
    });

    nextPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("call:signal:ice-candidate", {
          callId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    nextPeerConnection.ontrack = (event) => {
      const activeRemoteStream = remoteStreamRef.current ?? new MediaStream();

      if (!remoteStreamRef.current) {
        remoteStreamRef.current = activeRemoteStream;
        setRemoteStream(activeRemoteStream);
      }

      const [stream] = event.streams;

      if (stream) {
        stream.getTracks().forEach((track) => {
          const hasTrack = activeRemoteStream
            .getTracks()
            .some((existingTrack) => existingTrack.id === track.id);

          if (!hasTrack) {
            activeRemoteStream.addTrack(track);
          }
        });
      }

      setCurrentCall((existingCall) =>
        existingCall && existingCall.call._id === callId
          ? { ...existingCall, phase: "active" }
          : existingCall,
      );
    };

    nextPeerConnection.onconnectionstatechange = () => {
      if (nextPeerConnection.connectionState === "connected") {
        setCurrentCall((existingCall) =>
          existingCall && existingCall.call._id === callId
            ? { ...existingCall, phase: "active" }
            : existingCall,
        );
      }
    };

    peerConnectionRef.current = nextPeerConnection;
    return nextPeerConnection;
  };

  const createOfferForCall = async (callId: string) => {
    const peerConnection = await ensurePeerConnection(callId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socketRef.current?.emit("call:signal:offer", {
      callId,
      sdp: peerConnection.localDescription,
    });
  };

  const startVideoCall = async (chatId: string, peer: User) => {
    if (!user?._id) {
      toast.error("Please login to start a call");
      return;
    }

    if (!socketRef.current) {
      toast.error("Socket connection is not ready yet");
      return;
    }

    if (currentCallRef.current || incomingCallRef.current) {
      toast.error("Finish the current call before starting a new one");
      return;
    }

    setIsStartingCall(true);

    try {
      await ensureLocalStream();
      const { data } = await axios.post<CallApiResponse>(
        `${chat_service}/api/v1/call/initiate`,
        { chatId },
        getCallApiConfig(),
      );

      setCurrentCall({
        call: data.call,
        peer,
        initiatedByMe: true,
        phase: "ringing",
      });
      setIncomingCall(null);
    } catch (error) {
      clearCallState();
      toast.error(getErrorMessage(error, "Failed to start the video call"));
    } finally {
      setIsStartingCall(false);
    }
  };

  const acceptIncomingCall = async () => {
    const activeIncomingCall = incomingCallRef.current;

    if (!activeIncomingCall) {
      return;
    }

    try {
      await ensureLocalStream();
      setCurrentCall({
        call: activeIncomingCall.call,
        peer: activeIncomingCall.caller,
        initiatedByMe: false,
        phase: "connecting",
      });
      setIncomingCall(null);

      const { data } = await axios.post<CallApiResponse>(
        `${chat_service}/api/v1/call/${activeIncomingCall.call._id}/accept`,
        {},
        getCallApiConfig(),
      );

      setCurrentCall((existingCall) =>
        existingCall && existingCall.call._id === data.call._id
          ? { ...existingCall, call: data.call, phase: "connecting" }
          : existingCall,
      );
      router.push(`/chat?chatId=${activeIncomingCall.call.chatId}`);
    } catch (error) {
      clearCallState();
      toast.error(getErrorMessage(error, "Failed to accept the video call"));
    }
  };

  const declineIncomingCall = async () => {
    const activeIncomingCall = incomingCallRef.current;

    if (!activeIncomingCall) {
      return;
    }

    try {
      await axios.post(
        `${chat_service}/api/v1/call/${activeIncomingCall.call._id}/decline`,
        {},
        getCallApiConfig(),
      );
      setIncomingCall(null);
      await syncChats();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to decline the video call"));
    }
  };

  const endCurrentCall = async () => {
    const activeCall = currentCallRef.current;

    if (!activeCall) {
      return;
    }

    try {
      await axios.post(
        `${chat_service}/api/v1/call/${activeCall.call._id}/end`,
        {},
        getCallApiConfig(),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to end the video call"));
    }
  };

  const toggleMute = () => {
    const activeLocalStream = localStreamRef.current;
    if (!activeLocalStream) {
      return;
    }

    const nextMutedState = !isMuted;
    activeLocalStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMutedState;
    });
    setIsMuted(nextMutedState);
  };

  const toggleCamera = () => {
    const activeLocalStream = localStreamRef.current;
    if (!activeLocalStream) {
      return;
    }

    const nextCameraState = !isCameraEnabled;
    activeLocalStream.getVideoTracks().forEach((track) => {
      track.enabled = nextCameraState;
    });
    setIsCameraEnabled(nextCameraState);
  };

  useEffect(() => {
    if (!socket || !user?._id) {
      clearCallState();
      return;
    }

    const handleIncomingCall = (payload: {
      call: SerializedCall;
      caller: User;
    }) => {
      if (currentCallRef.current || incomingCallRef.current) {
        return;
      }

      setIncomingCall({
        call: payload.call,
        caller: payload.caller,
      });
    };

    const handleAcceptedCall = async (payload: { call: SerializedCall }) => {
      if (incomingCallRef.current?.call._id === payload.call._id) {
        setIncomingCall(null);
      }

      const activeCall = currentCallRef.current;
      if (!activeCall || activeCall.call._id !== payload.call._id) {
        return;
      }

      setCurrentCall({
        ...activeCall,
        call: payload.call,
        phase: activeCall.initiatedByMe ? "connecting" : activeCall.phase,
      });

      if (activeCall.initiatedByMe) {
        try {
          await createOfferForCall(payload.call._id);
        } catch (error) {
          console.error("Failed to create WebRTC offer", error);
          toast.error("Failed to connect the video call");
        }
      }
    };

    const handleDeclinedCall = async (payload: { call: SerializedCall }) => {
      await handleTerminalCall(payload.call);
    };

    const handleEndedCall = async (payload: { call: SerializedCall }) => {
      await handleTerminalCall(payload.call);
    };

    const handleOffer = async (payload: {
      callId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const activeCall = currentCallRef.current;
      if (!activeCall || activeCall.call._id !== payload.callId) {
        return;
      }

      try {
        const peerConnection = await ensurePeerConnection(payload.callId);
        await peerConnection.setRemoteDescription(payload.sdp);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("call:signal:answer", {
          callId: payload.callId,
          sdp: peerConnection.localDescription,
        });
      } catch (error) {
        console.error("Failed to handle WebRTC offer", error);
        toast.error("Failed to join the video call");
      }
    };

    const handleAnswer = async (payload: {
      callId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const activeCall = currentCallRef.current;
      if (!activeCall || activeCall.call._id !== payload.callId) {
        return;
      }

      try {
        const peerConnection = await ensurePeerConnection(payload.callId);
        await peerConnection.setRemoteDescription(payload.sdp);
        setCurrentCall((existingCall) =>
          existingCall && existingCall.call._id === payload.callId
            ? { ...existingCall, phase: "connecting" }
            : existingCall,
        );
      } catch (error) {
        console.error("Failed to apply WebRTC answer", error);
        toast.error("Failed to finish the video call handshake");
      }
    };

    const handleIceCandidate = async (payload: {
      callId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const activeCall = currentCallRef.current;
      if (!activeCall || activeCall.call._id !== payload.callId) {
        return;
      }

      try {
        const peerConnection = await ensurePeerConnection(payload.callId);
        if (payload.candidate) {
          await peerConnection.addIceCandidate(payload.candidate);
        }
      } catch (error) {
        console.error("Failed to add ICE candidate", error);
      }
    };

    socket.on("call:incoming", handleIncomingCall);
    socket.on("call:accepted", handleAcceptedCall);
    socket.on("call:declined", handleDeclinedCall);
    socket.on("call:ended", handleEndedCall);
    socket.on("call:signal:offer", handleOffer);
    socket.on("call:signal:answer", handleAnswer);
    socket.on("call:signal:ice-candidate", handleIceCandidate);

    return () => {
      socket.off("call:incoming", handleIncomingCall);
      socket.off("call:accepted", handleAcceptedCall);
      socket.off("call:declined", handleDeclinedCall);
      socket.off("call:ended", handleEndedCall);
      socket.off("call:signal:offer", handleOffer);
      socket.off("call:signal:answer", handleAnswer);
      socket.off("call:signal:ice-candidate", handleIceCandidate);
    };
  }, [socket, user?._id, router]);

  useEffect(() => {
    return () => {
      cleanupCallResources();
    };
  }, []);

  const contextValue: CallContextType = {
    currentCall,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraEnabled,
    isStartingCall,
    isCallBusy: Boolean(currentCall || incomingCall),
    startVideoCall,
    acceptIncomingCall,
    declineIncomingCall,
    endCurrentCall,
    toggleMute,
    toggleCamera,
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      {incomingCall && !currentCall && (
        <IncomingCallPopup
          caller={incomingCall.caller}
          onAccept={() => {
            void acceptIncomingCall();
          }}
          onDecline={() => {
            void declineIncomingCall();
          }}
        />
      )}
      {currentCall && (
        <VideoCallOverlay
          callPhase={currentCall.phase}
          peer={currentCall.peer}
          localStream={localStream}
          remoteStream={remoteStream}
          isMuted={isMuted}
          isCameraEnabled={isCameraEnabled}
          onEnd={() => {
            void endCurrentCall();
          }}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
        />
      )}
    </CallContext.Provider>
  );
};

export const useCallData = () => {
  const context = useContext(CallContext);

  if (!context) {
    throw new Error("useCallData must be used within CallProvider");
  }

  return context;
};

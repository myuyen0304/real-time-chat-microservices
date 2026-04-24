import { Phone, PhoneOff, Video } from "lucide-react";
import { User } from "@/context/AppContext";

interface IncomingCallPopupProps {
  caller: User;
  onAccept: () => void;
  onDecline: () => void;
  disabled?: boolean;
}

const IncomingCallPopup = ({
  caller,
  onAccept,
  onDecline,
  disabled = false,
}: IncomingCallPopupProps) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-gray-900/95 p-5 text-white shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-300">
          <Video className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm uppercase tracking-[0.2em] text-blue-300/80">
            Incoming call
          </p>
          <h3 className="mt-1 truncate text-xl font-semibold text-white">
            {caller.name}
          </h3>
          <p className="mt-1 truncate text-sm text-gray-400">{caller.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDecline}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PhoneOff className="h-4 w-4" /> Decline
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Phone className="h-4 w-4" /> Accept
        </button>
      </div>
    </div>
  );
};

export default IncomingCallPopup;

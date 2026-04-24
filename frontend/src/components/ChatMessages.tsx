import { Message } from "@/app/chat/page";
import { User } from "@/context/AppContext";
import React, { useEffect, useMemo, useRef } from "react";
import moment from "moment";
import { Check, CheckCheck, Video } from "lucide-react";

interface ChatMessagesProps {
  selectedChatId: string | null;
  messages: Message[] | null;
  loggedInUser: User | null;
}

const formatCallDuration = (durationSeconds?: number) => {
  if (!durationSeconds && durationSeconds !== 0) {
    return null;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const ChatMessages = ({
  selectedChatId,
  messages,
  loggedInUser,
}: ChatMessagesProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  const uniqueMessages = useMemo(() => {
    if (!messages) {
      return [];
    }

    const seenMessageIds = new Set<string>();
    return messages.filter((message) => {
      if (seenMessageIds.has(message._id)) {
        return false;
      }

      seenMessageIds.add(message._id);
      return true;
    });
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedChatId, uniqueMessages]);

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full max-h-[calc(100vh-215px)] space-y-2 overflow-y-auto p-2 custom-scroll">
        {!selectedChatId ? (
          <p className="mt-20 text-center text-gray-400">
            Please select a user to start chatting
          </p>
        ) : (
          <>
            {uniqueMessages.map((message, index) => {
              const isSentByMe = message.sender === loggedInUser?._id;
              const uniqueKey = `${message._id}-${index}`;

              if (message.messageType === "call") {
                return (
                  <div
                    key={uniqueKey}
                    className="mt-4 flex flex-col items-center gap-2"
                  >
                    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-800/80 px-4 py-4 text-center shadow-lg shadow-black/20 backdrop-blur-xl">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-300">
                        <Video className="h-5 w-5" />
                      </div>
                      <p className="text-base font-semibold text-white">
                        {message.text || "Video call update"}
                      </p>
                      {message.call?.durationSeconds ? (
                        <p className="mt-1 text-sm text-gray-400">
                          Duration{" "}
                          {formatCallDuration(message.call.durationSeconds)}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-xs text-gray-400">
                      {moment(message.createdAt).format("hh:mm A . MMM D")}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={uniqueKey}
                  className={`mt-2 flex flex-col gap-1 ${
                    isSentByMe ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-sm rounded-lg p-3 ${
                      isSentByMe
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-white"
                    }`}
                  >
                    {message.image?.url && (
                      <div className="relative mb-2 group">
                        <img
                          src={message.image.url}
                          alt="shared image"
                          className="h-auto max-h-96 max-w-full rounded-lg object-cover"
                        />
                      </div>
                    )}

                    {message.text && <p>{message.text}</p>}
                  </div>

                  <div
                    className={`flex items-center gap-1 text-xs text-gray-400 ${
                      isSentByMe ? "pr-2 flex-row-reverse" : "pl-2"
                    }`}
                  >
                    <span>
                      {moment(message.createdAt).format("hh:mm A . MMM D")}
                    </span>
                    {isSentByMe && (
                      <div className="ml-1 flex items-center">
                        {message.seen ? (
                          <div className="flex items-center gap-1 text-blue-400">
                            <CheckCheck className="h-3 w-3" />
                            {message.seenAt && (
                              <span>
                                {moment(message.seenAt).format("hh:mm A")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Check className="h-3 w-3 text-gray-500" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef}></div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatMessages;

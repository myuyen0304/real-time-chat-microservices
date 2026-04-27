import { Chats, User } from "@/context/AppContext";
import { getChatTitle, getDirectChatPeer, safeCssUrl } from "@/utils/chat";
import { Loader2, Menu, UserCircle, Users, Video } from "lucide-react";
import React from "react";

interface ChatHeaderProps {
  activeChat: Chats | null;
  loggedInUser: User | null;
  selectedChatId: string | null;
  setSidebarOpen: (open: boolean) => void;
  isTyping: boolean;
  onlineUsers: string[];
  onStartVideoCall: () => void;
  isStartingCall: boolean;
  isCallBusy: boolean;
}

const ChatHeader = ({
  activeChat,
  loggedInUser,
  selectedChatId,
  setSidebarOpen,
  isTyping,
  onlineUsers,
  onStartVideoCall,
  isStartingCall,
  isCallBusy,
}: ChatHeaderProps) => {
  const directPeer = activeChat
    ? getDirectChatPeer(activeChat, loggedInUser?._id)
    : null;
  const isOnlineUser = directPeer
    ? onlineUsers.includes(directPeer._id)
    : false;
  const title = activeChat ? getChatTitle(activeChat, loggedInUser?._id) : null;
  const subtitle = activeChat
    ? activeChat.chat.chatType === "group"
      ? `${activeChat.participants.length} members`
      : isOnlineUser
        ? "Online"
        : "Offline"
    : null;
  const canStartCall = Boolean(
    directPeer &&
    selectedChatId &&
    isOnlineUser &&
    !isCallBusy &&
    !isStartingCall,
  );

  return (
    <>
      <div className="sm:hidden fixed top-4 right-4 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg bg-gray-800 p-3 transition-colors hover:bg-gray-700"
        >
          <Menu className="h-5 w-5 text-gray-200" />
        </button>
      </div>
      <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
        <div className="flex items-center gap-4">
          {activeChat ? (
            <>
              <div className="relative">
                {activeChat.chat.chatType === "group" ? (
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 bg-cover bg-center"
                    style={
                      activeChat.chat.groupAvatar
                        ? {
                            backgroundImage: safeCssUrl(activeChat.chat.groupAvatar),
                          }
                        : undefined
                    }
                  >
                    {!activeChat.chat.groupAvatar && (
                      <Users className="h-7 w-7 text-gray-300" />
                    )}
                  </div>
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700">
                    <UserCircle className="h-8 w-8 text-gray-300" />
                  </div>
                )}
                {activeChat.chat.chatType === "direct" && isOnlineUser && (
                  <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-gray-800 bg-green-500">
                    <span className="absolute inset-0 rounded-full bg-green-500 opacity-75 animate-ping"></span>
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1">
                  <h2 className="truncate text-2xl font-bold text-white">
                    {title}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {isTyping ? (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex gap-1">
                        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"></div>
                        <div
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                          style={{ animationDelay: "0.1s" }}
                        ></div>
                        <div
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                      </div>
                      <span className="font-medium text-blue-500">
                        typing...
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {activeChat.chat.chatType === "direct" ? (
                        <>
                          <div
                            className={`h-2 w-2 rounded-full ${
                              isOnlineUser ? "bg-green-500" : "bg-gray-500"
                            }`}
                          ></div>
                          <span
                            className={`text-sm font-medium ${
                              isOnlineUser ? "text-green-500" : "text-gray-400"
                            }`}
                          >
                            {subtitle}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-gray-400">
                          {subtitle}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {activeChat.chat.chatType === "direct" && (
                <button
                  type="button"
                  onClick={onStartVideoCall}
                  disabled={!canStartCall}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-gray-500"
                  aria-label="Start video call"
                >
                  {isStartingCall ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Video className="h-5 w-5" />
                  )}
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700">
                <UserCircle className="h-8 w-8 text-gray-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-400">
                  Select a conversation
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Choose a chat from the sidebar to start messaging
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ChatHeader;

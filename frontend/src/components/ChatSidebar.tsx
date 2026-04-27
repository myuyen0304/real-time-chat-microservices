"use client";
import { Chats, User } from "@/context/AppContext";
import { getChatTitle, getDirectChatPeer, safeCssUrl } from "@/utils/chat";
import {
  Check,
  CornerDownRight,
  CornerUpLeft,
  ImageIcon,
  Loader2,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { FormEvent, useMemo, useState } from "react";

interface ChatSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  showAllUsers: boolean;
  setShowAllUsers: (show: boolean | ((prev: boolean) => boolean)) => void;
  users: User[] | null;
  loggedInUser: User | null;
  chats: Chats[] | null;
  selectedChatId: string | null;
  setSelectedChatId: (chatId: string | null) => void;
  handleLogout: () => void;
  createChat: (user: User) => void;
  createGroupChat: (payload: {
    groupName: string;
    groupAvatar?: string;
    userIds: string[];
  }) => Promise<void>;
  onlineUsers: string[];
}

const ChatSidebar = ({
  sidebarOpen,
  setShowAllUsers,
  setSidebarOpen,
  showAllUsers,
  users,
  loggedInUser,
  chats,
  selectedChatId,
  setSelectedChatId,
  handleLogout,
  createChat,
  createGroupChat,
  onlineUsers,
}: ChatSidebarProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [composeMode, setComposeMode] = useState<"direct" | "group">("direct");
  const [groupName, setGroupName] = useState("");
  const [groupAvatar, setGroupAvatar] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const filteredUsers = useMemo(
    () =>
      users?.filter((u) => {
        const query = searchQuery.trim().toLowerCase();
        const isCurrentUser = u._id === loggedInUser?._id;
        const matchesQuery =
          !query ||
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query);

        return !isCurrentUser && matchesQuery;
      }) ?? [],
    [users, loggedInUser?._id, searchQuery],
  );

  const selectedMembers = useMemo(
    () => filteredUsers.filter((user) => selectedMemberIds.includes(user._id)),
    [filteredUsers, selectedMemberIds],
  );

  const resetComposer = () => {
    setSearchQuery("");
    setComposeMode("direct");
    setGroupName("");
    setGroupAvatar("");
    setSelectedMemberIds([]);
    setIsCreatingGroup(false);
  };

  const closeComposer = () => {
    resetComposer();
    setShowAllUsers(false);
  };

  const toggleComposer = () => {
    if (showAllUsers) {
      closeComposer();
      return;
    }

    resetComposer();
    setShowAllUsers(true);
  };

  const toggleMember = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId)
        ? prev.filter((currentId) => currentId !== userId)
        : [...prev, userId],
    );
  };

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedGroupName = groupName.trim();
    const trimmedGroupAvatar = groupAvatar.trim();

    if (!trimmedGroupName || selectedMemberIds.length === 0) {
      return;
    }

    setIsCreatingGroup(true);

    try {
      await createGroupChat({
        groupName: trimmedGroupName,
        groupAvatar: trimmedGroupAvatar || undefined,
        userIds: selectedMemberIds,
      });
      resetComposer();
      setSidebarOpen(false);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar backdrop"
          className="sm:hidden fixed inset-0 z-20 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } sm:translate-x-0 fixed sm:static inset-y-0 left-0 z-30 w-full sm:w-80 bg-gray-800 border-r border-gray-700 flex flex-col transition-transform duration-300 ease-in-out max-w-sm`}
      >
        <div className="p-6 border-b border-r-gray-700">
          <div className="sm:hidden flex justify-end mb-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-300" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 justify-between">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">
                {showAllUsers ? "New Chat" : "Messages"}
              </h2>
            </div>
            <button
              type="button"
              className={`p-2.5 rounded-lg transition-colors ${
                showAllUsers
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
              onClick={toggleComposer}
            >
              {showAllUsers ? (
                <X className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-4 py-2">
          {showAllUsers ? (
            <div className="flex h-full flex-col gap-4">
              <div className="grid grid-cols-2 rounded-lg border border-gray-700 bg-gray-900 p-1">
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    composeMode === "direct"
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                  onClick={() => setComposeMode("direct")}
                >
                  Direct
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    composeMode === "group"
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                  onClick={() => setComposeMode("group")}
                >
                  Group
                </button>
              </div>

              {composeMode === "group" && (
                <form className="space-y-3" onSubmit={handleCreateGroup}>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">
                      Group name
                    </label>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(event) => setGroupName(event.target.value)}
                      placeholder="Design team"
                      className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 outline-none focus:border-blue-500"
                      maxLength={80}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">
                      Avatar URL
                    </label>
                    <div className="relative">
                      <ImageIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        type="url"
                        value={groupAvatar}
                        onChange={(event) => setGroupAvatar(event.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-10 pr-3 text-white placeholder-gray-500 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={
                      isCreatingGroup ||
                      !groupName.trim() ||
                      selectedMemberIds.length === 0
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                  >
                    {isCreatingGroup ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                    Create group
                  </button>
                  <div className="text-sm text-gray-400">
                    {selectedMemberIds.length} selected
                    {selectedMembers.length > 0 && (
                      <span className="ml-2 text-gray-500">
                        {selectedMembers
                          .slice(0, 2)
                          .map((member) => member.name)
                          .join(", ")}
                        {selectedMembers.length > 2 ? "..." : ""}
                      </span>
                    )}
                  </div>
                </form>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 text-white placeholder-gray-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="space-y-2 overflow-y-auto pb-4">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const isSelectedMember = selectedMemberIds.includes(u._id);

                    return (
                    <button
                      key={u._id}
                      type="button"
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        composeMode === "group" && isSelectedMember
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-gray-700 hover:border-gray-600 hover:bg-gray-800"
                      }`}
                      onClick={() => {
                        if (composeMode === "group") {
                          toggleMember(u._id);
                          return;
                        }

                        void createChat(u);
                        resetComposer();
                        setSidebarOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <UserCircle className="w-6 h-6 text-gray-300" />
                          {onlineUsers.includes(u._id) && (
                            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-gray-900"></span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate font-medium text-white">
                            {u.name}
                          </span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {composeMode === "group"
                              ? u.email
                              : onlineUsers.includes(u._id)
                                ? "Online"
                                : "Offline"}
                          </div>
                        </div>
                        {composeMode === "group" && (
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                              isSelectedMember
                                ? "border-blue-500 bg-blue-600 text-white"
                                : "border-gray-600 text-transparent"
                            }`}
                          >
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </button>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <UserCircle className="mb-3 h-8 w-8 text-gray-500" />
                    <p className="text-sm text-gray-400">No users found</p>
                  </div>
                )}
              </div>
            </div>
          ) : chats && chats.length > 0 ? (
            <div className="space-y-2 overflow-y-auto h-full pb-4">
              {chats.map((chat) => {
                const latestMessage = chat.chat.latestMessage;
                const isSelected = selectedChatId === chat.chat._id;
                const isSentByMe = latestMessage?.sender === loggedInUser?._id;
                const unseenCount = chat.chat.unseenCount || 0;
                const directPeer = getDirectChatPeer(chat, loggedInUser?._id);
                const isOnline = Boolean(
                  directPeer && onlineUsers.includes(directPeer._id),
                );
                const title = getChatTitle(chat, loggedInUser?._id);

                return (
                  <button
                    key={chat.chat._id}
                    type="button"
                    onClick={() => {
                      setSelectedChatId(chat.chat._id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full text-left p-4 rounded-lg transition-colors ${
                      isSelected
                        ? "bg-blue-600 border border-blue-500"
                        : "bg-gray-700 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {chat.chat.chatType === "group" ? (
                          <div
                            className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center bg-cover bg-center"
                            style={
                              chat.chat.groupAvatar
                                ? {
                                    backgroundImage: safeCssUrl(chat.chat.groupAvatar),
                                  }
                                : undefined
                            }
                          >
                            {!chat.chat.groupAvatar && (
                              <Users className="w-6 h-6 text-gray-300" />
                            )}
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                            <UserCircle className="w-7 h-7 text-gray-300" />
                          </div>
                        )}
                        {isOnline && (
                          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-gray-900"></span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`font-semibold truncate ${
                              isSelected ? "text-white" : "text-gray-200"
                            }`}
                          >
                            {title}
                          </span>
                          {unseenCount > 0 && (
                            <div className="bg-red-600 text-white text-xs font-bold rounded-full min-w-[22px] h-5 flex items-center justify-center px-2">
                              {unseenCount > 99 ? "99+" : unseenCount}
                            </div>
                          )}
                        </div>
                        {latestMessage && (
                          <div className="flex items-center gap-2">
                            {isSentByMe ? (
                              <CornerUpLeft
                                size={14}
                                className="text-blue-400 text-shrink-0"
                              />
                            ) : (
                              <CornerDownRight
                                size={14}
                                className="text-green-400 text-shrink-0"
                              />
                            )}
                            <span className="text-sm text-gray-400 truncate flex-1">
                              {latestMessage.text || "📷 Image"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 bg-gray-800 rounded-full mb-4">
                <MessageCircle className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-400 font-medium">No conversation yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Start a new chat to begin messaging
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border border-gray-700 space-y-2">
          <Link
            href={"/profile"}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="p-1.5 bg-gray-700 rounded-lg">
              <UserCircle className="w-4 h-4 text-gray-300" />
            </div>
            <span className="font-medium text-gray-300"> Profile</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-600 transition-colors text-red-500 hover:text-white"
          >
            <div className="p-1.5 bg-red-600 rounded-lg">
              <LogOut className="w-4 h-4 text-gray-300" />
            </div>
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default ChatSidebar;

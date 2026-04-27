import type { Chats, User } from "@/context/AppContext";

export const getOtherParticipants = (
  participants: User[] | null | undefined,
  loggedInUserId?: string,
) =>
  (participants ?? []).filter(
    (participant) => participant._id !== loggedInUserId,
  );

export const getChatTitle = (chatItem: Chats, loggedInUserId?: string) => {
  const otherParticipants = getOtherParticipants(
    chatItem.participants,
    loggedInUserId,
  );

  if (chatItem.chat.chatType === "group") {
    return (
      chatItem.chat.groupName?.trim() ||
      otherParticipants.map((p) => p.name).join(", ") ||
      "Unnamed group"
    );
  }

  return otherParticipants[0]?.name || "Unknown User";
};

export const getDirectChatPeer = (
  chatItem: Chats,
  loggedInUserId?: string,
): User | null => {
  if (chatItem.chat.chatType !== "direct") return null;
  return getOtherParticipants(chatItem.participants, loggedInUserId)[0] ?? null;
};

/** Safely encode a user-supplied URL for use inside a CSS url("...") value. */
export const safeCssUrl = (url: string) =>
  `url("${url.replace(/\\/g, "\\\\").replace(/"/g, "%22")}")`;

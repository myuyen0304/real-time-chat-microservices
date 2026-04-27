"use client";

import ChatSidebar from "@/components/ChatSidebar";
import Loading from "@/components/Loading";
import {
  chat_service,
  type Chats,
  type Message as AppMessage,
  normalizeChatEntry,
  useAppData,
  User,
} from "@/context/AppContext";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import axios from "axios";
import ChatHeader from "@/components/ChatHeader";
import ChatMessages from "@/components/ChatMessages";
import MessageInput from "@/components/MessageInput";
import { SocketData } from "@/context/SocketContext";
import { useCallData } from "@/context/CallContext";
import { Suspense } from "react";

export type Message = AppMessage;

const ChatAppContent = () => {
  const {
    loading,
    isAuth,
    logoutUser,
    chats,
    user: loggedInUser,
    users,
    fetchChats,
    setChats,
  } = useAppData();
  const { onlineUsers, socket } = SocketData();
  const { startVideoCall, isStartingCall, isCallBusy } = useCallData();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [siderbarOpen, setSiderbarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [activeChat, setActiveChat] = useState<Chats | null>(null);
  const [showAllUser, setShowAllUser] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeOut, setTypingTimeOut] = useState<NodeJS.Timeout | null>(
    null,
  );

  const selectedChat =
    activeChat?.chat._id === selectedChatId
      ? activeChat
      : (chats?.find((chat) => chat.chat._id === selectedChatId) ?? null);
  const directChatUser =
    selectedChat?.chat.chatType === "direct"
      ? (selectedChat.participants.find(
          (participant) => participant._id !== loggedInUser?._id,
        ) ?? null)
      : null;

  useEffect(() => {
    if (!loading && !isAuth) {
      router.replace("/login");
    }
  }, [isAuth, router, loading]);

  useEffect(() => {
    const chatIdFromQuery = searchParams.get("chatId");

    if (chatIdFromQuery) {
      setSelectedChatId(chatIdFromQuery);
    }
  }, [searchParams]);

  const handleLogout = () => {
    setSelectedChatId(null);
    setMessages(null);
    setActiveChat(null);
    setIsTyping(false);
    setShowAllUser(false);
    setSiderbarOpen(false);
    void logoutUser();
    router.replace("/login");
  };

  const fetchChat = async () => {
    const token = Cookies.get("token");

    if (!selectedChatId || !token || !isAuth) {
      return;
    }

    try {
      const { data } = await axios.get(
        `${chat_service}/api/v1/message/${selectedChatId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      setMessages(data.messages);
      setActiveChat(
        normalizeChatEntry({
          chat: data.chat,
          participants: data.participants,
          user: data.user,
        }),
      );
      await fetchChats();
    } catch (error) {
      console.error(error);
      toast.error("Fail to load messages");
    }
  };

  const moveChatToTop = (
    chatId: string,
    newMessage: { text?: string; sender: string },
    updatedUnseenCount = true,
  ) => {
    setChats((prev) => {
      if (!prev) {
        return null;
      }

      const updatedChats = [...prev];
      const chatIndex = updatedChats.findIndex(
        (chat) => chat.chat._id === chatId,
      );

      if (chatIndex !== -1) {
        const [moveChat] = updatedChats.splice(chatIndex, 1);
        const previewText = newMessage.text?.trim() || "Image";

        updatedChats.unshift({
          ...moveChat,
          chat: {
            ...moveChat.chat,
            latestMessage: {
              text: previewText,
              sender: newMessage.sender,
            },
            updatedAt: new Date().toString(),
            unseenCount:
              updatedUnseenCount && newMessage.sender !== loggedInUser?._id
                ? (moveChat.chat.unseenCount || 0) + 1
                : moveChat.chat.unseenCount || 0,
          },
        });
      }

      return updatedChats;
    });
  };

  const resetUnseenCount = (chatId: string) => {
    setChats((prev) => {
      if (!prev) {
        return null;
      }

      return prev.map((chat) => {
        if (chat.chat._id === chatId) {
          return {
            ...chat,
            chat: {
              ...chat.chat,
              unseenCount: 0,
            },
          };
        }

        return chat;
      });
    });
  };

  const createChat = async (nextUser: User) => {
    try {
      const token = Cookies.get("token");
      const { data } = await axios.post(
        `${chat_service}/api/v1/chat/new`,
        {
          otherUserId: nextUser._id,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      setSelectedChatId(data.chatId);
      setShowAllUser(false);
      await fetchChats();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const existingChatId = error.response.data?.chatId as
          | string
          | undefined;

        if (existingChatId) {
          setSelectedChatId(existingChatId);
          setShowAllUser(false);
          await fetchChats();
          return;
        }
      }

      toast.error("Fail to start chat");
    }
  };

  const createGroupChat = async ({
    groupName,
    groupAvatar,
    userIds,
  }: {
    groupName: string;
    groupAvatar?: string;
    userIds: string[];
  }) => {
    try {
      const token = Cookies.get("token");
      const { data } = await axios.post(
        `${chat_service}/api/v1/chat/new`,
        {
          chatType: "group",
          groupName,
          groupAvatar,
          userIds,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setSelectedChatId(data.chatId);
      setShowAllUser(false);
      await fetchChats();
    } catch (error) {
      console.error(error);
      toast.error("Fail to create group");
      throw error;
    }
  };

  const handleStartVideoCall = async () => {
    if (!selectedChatId || !directChatUser) {
      return;
    }

    await startVideoCall(selectedChatId, directChatUser);
  };

  const handleMessageSend = async (imageFile?: File | null) => {
    if (!message.trim() && !imageFile) {
      return;
    }

    if (!selectedChatId) {
      return;
    }

    if (typingTimeOut) {
      clearTimeout(typingTimeOut);
      setTypingTimeOut(null);
    }

    socket?.emit("stopTyping", {
      chatId: selectedChatId,
      userId: loggedInUser?._id,
    });

    const token = Cookies.get("token");

    try {
      const trimmedMessage = message.trim();
      const payload = imageFile
        ? (() => {
            const formData = new FormData();
            formData.append("chatId", selectedChatId);

            if (trimmedMessage) {
              formData.append("text", trimmedMessage);
            }

            formData.append("image", imageFile);
            return formData;
          })()
        : {
            chatId: selectedChatId,
            text: trimmedMessage,
          };

      const { data } = await axios.post(
        `${chat_service}/api/v1/message`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(imageFile ? {} : { "Content-Type": "application/json" }),
          },
          timeout: 15000,
        },
      );

      setMessages((prev) => {
        const currentMessages = prev || [];
        const messageExists = currentMessages.some(
          (currentMessage) => currentMessage._id === data.message._id,
        );

        if (!messageExists) {
          return [...currentMessages, data.message];
        }

        return currentMessages;
      });

      setMessage("");

      moveChatToTop(
        selectedChatId,
        {
          text: imageFile ? "Image" : message,
          sender: data.sender,
        },
        false,
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to send message");
    }
  };

  const handleTyping = (value: string) => {
    setMessage(value);
    if (!selectedChatId || !socket) {
      return;
    }

    if (value.trim()) {
      socket.emit("typing", {
        chatId: selectedChatId,
        userId: loggedInUser?._id,
      });
    }

    if (typingTimeOut) {
      clearTimeout(typingTimeOut);
    }

    const timeout = setTimeout(() => {
      socket.emit("stopTyping", {
        chatId: selectedChatId,
        userId: loggedInUser?._id,
      });
    }, 2000);

    setTypingTimeOut(timeout);
  };

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleNewMessage = (nextMessage: Message) => {
      if (selectedChatId === nextMessage.chatId) {
        setMessages((prev) => {
          const currentMessages = prev || [];
          const messageExists = currentMessages.some(
            (currentMessage) => currentMessage._id === nextMessage._id,
          );

          if (!messageExists) {
            return [...currentMessages, nextMessage];
          }

          return currentMessages;
        });
        moveChatToTop(nextMessage.chatId, nextMessage, false);
      } else {
        moveChatToTop(nextMessage.chatId, nextMessage, true);
      }
    };

    const handleMessagesSeen = (data: {
      chatId: string;
      messageIds?: string[];
    }) => {
      if (selectedChatId === data.chatId) {
        setMessages((prev) => {
          if (!prev) {
            return null;
          }

          return prev.map((currentMessage) => {
            if (
              currentMessage.sender === loggedInUser?._id &&
              data.messageIds &&
              data.messageIds.includes(currentMessage._id)
            ) {
              return {
                ...currentMessage,
                seen: true,
                seenAt: new Date().toString(),
              };
            }

            if (
              currentMessage.sender === loggedInUser?._id &&
              !data.messageIds
            ) {
              return {
                ...currentMessage,
                seen: true,
                seenAt: new Date().toString(),
              };
            }

            return currentMessage;
          });
        });
      }
    };

    const handleUserTyping = (data: { chatId: string; userId: string }) => {
      if (data.chatId === selectedChatId && data.userId !== loggedInUser?._id) {
        setIsTyping(true);
      }
    };

    const handleUserStoppedTyping = (data: {
      chatId: string;
      userId: string;
    }) => {
      if (data.chatId === selectedChatId && data.userId !== loggedInUser?._id) {
        setIsTyping(false);
      }
    };

    socket.on("newMessage", handleNewMessage);
    socket.on("messagesSeen", handleMessagesSeen);
    socket.on("userTyping", handleUserTyping);
    socket.on("userStoppedTyping", handleUserStoppedTyping);

    return () => {
      socket.off("newMessage", handleNewMessage);
      socket.off("messagesSeen", handleMessagesSeen);
      socket.off("userTyping", handleUserTyping);
      socket.off("userStoppedTyping", handleUserStoppedTyping);
    };
  }, [socket, selectedChatId, setChats, loggedInUser?._id]);

  useEffect(() => {
    const loadChat = async () => {
      if (!selectedChatId || !isAuth) {
        setMessages(null);
        setActiveChat(null);
        setIsTyping(false);
        return;
      }

      await fetchChat();
      setIsTyping(false);
      resetUnseenCount(selectedChatId);
      socket?.emit("joinChat", selectedChatId);
    };

    void loadChat();

    return () => {
      if (selectedChatId) {
        socket?.emit("leaveChat", selectedChatId);
      }
    };
  }, [selectedChatId, socket, isAuth]);

  useEffect(() => {
    return () => {
      if (typingTimeOut) {
        clearTimeout(typingTimeOut);
      }
    };
  }, [typingTimeOut]);

  if (loading || !isAuth) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen flex overflow-hidden bg-gray-900 text-white">
      <ChatSidebar
        sidebarOpen={siderbarOpen}
        setSidebarOpen={setSiderbarOpen}
        showAllUsers={showAllUser}
        setShowAllUsers={setShowAllUser}
        users={users}
        loggedInUser={loggedInUser}
        chats={chats}
        selectedChatId={selectedChatId}
        setSelectedChatId={setSelectedChatId}
        handleLogout={handleLogout}
        createChat={createChat}
        createGroupChat={createGroupChat}
        onlineUsers={onlineUsers}
      />
      <div className="flex flex-1 flex-col justify-between border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <ChatHeader
          activeChat={selectedChat}
          loggedInUser={loggedInUser}
          selectedChatId={selectedChatId}
          setSidebarOpen={setSiderbarOpen}
          isTyping={isTyping}
          onlineUsers={onlineUsers}
          onStartVideoCall={() => {
            void handleStartVideoCall();
          }}
          isStartingCall={isStartingCall}
          isCallBusy={isCallBusy}
        />

        <ChatMessages
          selectedChatId={selectedChatId}
          messages={messages}
          loggedInUser={loggedInUser}
        />

        <MessageInput
          selectedChatId={selectedChatId}
          message={message}
          setMessage={handleTyping}
          handleMessageSend={handleMessageSend}
        />
      </div>
    </div>
  );
};

const ChatApp = () => {
  return (
    <Suspense fallback={<Loading />}>
      <ChatAppContent />
    </Suspense>
  );
};

export default ChatApp;

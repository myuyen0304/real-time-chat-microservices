"use client";

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import toast, { Toaster } from "react-hot-toast";
import Cookies from "js-cookie";
import axios from "axios";

interface ApiSuccessResponse {
  success: true;
  message: string;
  [key: string]: unknown;
}

const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim();

export const user_service =
  process.env.NEXT_PUBLIC_USER_SERVICE_URL?.trim() ??
  gatewayUrl ??
  "http://localhost:5000";

export const chat_service =
  process.env.NEXT_PUBLIC_CHAT_SERVICE_URL?.trim() ??
  gatewayUrl ??
  "http://localhost:5002";

export interface User {
  _id: string;
  name: string;
  email: string;
}

export type ChatType = "direct" | "group";

export interface ChatLatestMessage {
  text: string;
  sender: string;
}

export interface Chat {
  _id: string;
  chatType: ChatType;
  users: string[];
  groupName?: string;
  groupAvatar?: string;
  latestMessage?: ChatLatestMessage | null;
  createdAt: string;
  updatedAt: string;
  unseenCount?: number;
}

export interface Message {
  _id: string;
  chatId: string;
  sender: string;
  text?: string;
  image?: {
    url: string;
    publicId: string;
  };
  call?: {
    callId: string;
    mode: "video";
    status: "declined" | "missed" | "ended" | "cancelled";
    endReason?: "declined" | "missed" | "hangup" | "disconnect" | "cancelled";
    durationSeconds?: number;
    startedAt?: string;
    endedAt?: string;
    initiatedBy: string;
    endedBy?: string;
  };
  messageType: "text" | "image" | "call";
  readBy?: {
    userId: string;
    readAt: string;
  }[];
  seen: boolean;
  seenAt?: string;
  createdAt: string;
}

export interface Chats {
  chat: Chat;
  participants: User[];
}

type ChatApiEntry = {
  chat: Chat;
  participants?: User[] | null;
  user?: User | null;
};

export const normalizeChatEntry = (chatEntry: ChatApiEntry): Chats => {
  const participants = Array.isArray(chatEntry.participants)
    ? chatEntry.participants.filter(Boolean)
    : chatEntry.user
      ? [chatEntry.user]
      : [];

  return {
    chat: chatEntry.chat,
    participants,
  };
};

interface AppContextType {
  user: User | null;
  loading: boolean;
  isAuth: boolean;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setIsAuth: React.Dispatch<React.SetStateAction<boolean>>;
  logoutUser: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchChats: () => Promise<void>;
  chats: Chats[] | null;
  users: User[] | null;
  setChats: React.Dispatch<React.SetStateAction<Chats[] | null>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chats[] | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);

  const resetAuthState = () => {
    Cookies.remove("token");
    setUser(null);
    setIsAuth(false);
    setChats(null);
    setUsers(null);
  };

  const isUnauthorizedError = (error: unknown): boolean => {
    return axios.isAxiosError(error) && error.response?.status === 401;
  };

  async function fetchUser() {
    try {
      const token = Cookies.get("token");

      // Kiểm tra token trước khi gọi API
      if (!token) {
        setUser(null);
        setIsAuth(false);
        setLoading(false);
        return;
      }

      const { data } = await axios.get(`${user_service}/api/v1/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setUser((data as ApiSuccessResponse & { user: User }).user);
      setIsAuth(true);
      setLoading(false);
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        console.error(error);
      }

      resetAuthState();
      setLoading(false);
    }
  }

  async function logoutUser() {
    resetAuthState();
    toast.success("User logged out");
  }

  async function fetchChats() {
    const token = Cookies.get("token");
    // Kiểm tra token trước khi gọi API
    if (!token) {
      return;
    }

    try {
      const { data } = await axios.get(`${chat_service}/api/v1/chat/all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const response = data as ApiSuccessResponse & {
        chats: ChatApiEntry[];
      };
      setChats(response.chats.map(normalizeChatEntry));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        resetAuthState();
        return;
      }

      console.error(error);
    }
  }

  async function fetchUsers() {
    const token = Cookies.get("token");
    // Kiểm tra token trước khi gọi API
    if (!token) {
      return;
    }

    try {
      const { data } = await axios.get(`${user_service}/api/v1/user/all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setUsers((data as ApiSuccessResponse & { users: User[] }).users);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        resetAuthState();
        return;
      }

      console.error(error);
    }
  }
  useEffect(() => {
    const getUser = async () => {
      await fetchUser();
    };
    getUser();
  }, []);

  // Gọi fetchChats và fetchUsers chỉ khi đã authenticated
  useEffect(() => {
    if (isAuth && !loading) {
      const loadData = async () => {
        await fetchChats();
        await fetchUsers();
      };
      loadData();
    }
  }, [isAuth, loading]);

  return (
    <AppContext.Provider
      value={{
        user,
        loading,
        isAuth,
        setUser,
        setIsAuth,
        logoutUser,
        fetchChats,
        fetchUsers,
        chats,
        users,
        setChats,
      }}
    >
      {children}
      <Toaster />
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = React.useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
};

export const useAppData = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppData must be used within AppProvider");
  }
  return context;
};

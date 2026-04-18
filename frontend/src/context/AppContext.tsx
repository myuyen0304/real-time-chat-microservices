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

export interface Chat {
  _id: string;
  users: string[];
  latestMessage: {
    text: string;
    sender: string;
  };
  createdAt: string;
  updatedAt: string;
  unseenCount?: number;
}

export interface Chats {
  _id: string;
  user: User;
  chat: Chat;
}

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
      setUser(data);
      setIsAuth(true);
      setLoading(false);
    } catch (error) {
      console.error(error);
      // Quan trọng: Set isAuth = false khi có lỗi
      setUser(null);
      setIsAuth(false);
      setLoading(false);
    }
  }

  async function logoutUser() {
    Cookies.remove("token");
    setUser(null);
    setIsAuth(false);
    toast.success("User logged out");
  }
  const [chats, setChats] = useState<Chats[] | null>(null);
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
      setChats(data.chats);
    } catch (error) {
      console.error(error);
      // Không cần xử lý gì, chỉ log lỗi
    }
  }

  const [users, setUsers] = useState<User[] | null>(null);

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
      setUsers(data);
    } catch (error) {
      console.error(error);
      // Không cần xử lý gì, chỉ log lỗi
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

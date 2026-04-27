"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { chat_service, useAppData } from "./AppContext";
import Cookies from "js-cookie";

interface SocketContextType {
  socket: Socket | null;
  onlineUsers: string[];
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  onlineUsers: [],
});

interface ProviderProps {
  children: ReactNode;
}

export const SocketProvider = ({ children }: ProviderProps) => {
  const { user } = useAppData();
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  const socket = useMemo(() => {
    const token = Cookies.get("token");

    if (!user?._id || !token) {
      return null;
    }

    return io(chat_service, {
      autoConnect: false,
      reconnection: true,
      tryAllTransports: true,
      auth: {
        token,
      },
    });
  }, [user?._id]);

  useEffect(() => {
    if (!socket || !user?._id) {
      return;
    }

    socket.on("connect", () => {
      setOnlineUsers([]);
      socket.emit("syncOnlineUsers");
    });

    socket.on("getOnlineUser", (users: string[]) => {
      setOnlineUsers(users);
    });

    socket.on("disconnect", () => {
      setOnlineUsers((currentUsers) =>
        currentUsers.filter((onlineUserId) => onlineUserId !== user._id),
      );
    });

    socket.on("connect_error", (error) => {
      setOnlineUsers([]);

      if (error.message.startsWith("Authentication failed")) {
        console.warn("Socket authentication failed", error.message);
        return;
      }

      console.warn("Socket connection retrying", error.message);
    });

    socket.connect();

    return () => {
      socket.off("connect");
      socket.off("getOnlineUser");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.disconnect();
      setOnlineUsers([]);
    };
  }, [socket, user?._id]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const SocketData = () => useContext(SocketContext);

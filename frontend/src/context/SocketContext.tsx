"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const { user } = useAppData();
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    const token = Cookies.get("token");

    if (!user?._id || !token) {
      setSocket(null);
      setOnlineUsers([]);
      return;
    }

    const newSocket = io(chat_service, {
      autoConnect: false,
      reconnection: true,
      tryAllTransports: true,
      auth: {
        token,
      },
    });

    newSocket.on("connect", () => {
      setOnlineUsers([]);
      newSocket.emit("syncOnlineUsers");
    });

    newSocket.on("getOnlineUser", (users: string[]) => {
      setOnlineUsers(users);
    });

    newSocket.on("disconnect", () => {
      setOnlineUsers((currentUsers) =>
        currentUsers.filter((onlineUserId) => onlineUserId !== user._id),
      );
    });

    newSocket.on("connect_error", (error) => {
      setOnlineUsers([]);

      if (error.message.startsWith("Authentication failed")) {
        console.warn("Socket authentication failed", error.message);
        return;
      }

      console.warn("Socket connection retrying", error.message);
    });

    setSocket(newSocket);
    newSocket.connect();

    return () => {
      newSocket.off("connect");
      newSocket.off("getOnlineUser");
      newSocket.off("disconnect");
      newSocket.off("connect_error");
      newSocket.disconnect();
    };
  }, [user?._id]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const SocketData = () => useContext(SocketContext);

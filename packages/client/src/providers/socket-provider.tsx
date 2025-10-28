import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents
} from "@code-card/shared";
import { useAuth } from "./auth-provider";

type UnoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SocketContext = createContext<UnoSocket | null>(null);

interface SocketProviderProps {
  children: ReactNode;
}

const resolveServerUrl = () => {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }

  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  if (import.meta.env.VITE_SERVER_PORT) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${import.meta.env.VITE_SERVER_PORT}`;
  }

  if (import.meta.env.DEV) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000`;
  }

  return window.location.origin;
};

export const SocketProvider = ({ children }: SocketProviderProps) => {
  const [socket, setSocket] = useState<UnoSocket | null>(null);
  const { token } = useAuth();

  const serverUrl = useMemo(resolveServerUrl, []);

  useEffect(() => {
    const instance: UnoSocket = io(serverUrl, {
      transports: ["websocket"],
      autoConnect: true,
      auth: token ? { token } : undefined
    });

    setSocket(instance);

    return () => {
      instance.disconnect();
    };
  }, [serverUrl]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("updateAuth", { token: token ?? null });
  }, [socket, token]);

  const value = useMemo(() => socket, [socket]);

  if (!value) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-sm uppercase tracking-[0.3em] text-white/60">Connecting...</p>
      </div>
    );
  }

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);

  if (!ctx) {
    throw new Error("Socket context unavailable");
  }

  return ctx;
};

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  stats: {
    wins: number;
    losses: number;
    gamesPlayed: number;
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  initializing: boolean;
  login: (payload: { email: string; password: string }) => Promise<{ success: boolean; error?: string }>;
  register: (payload: { email: string; password: string; displayName: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const TOKEN_STORAGE_KEY = "card-rush-auth-token";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  const applySession = useCallback((nextToken: string, nextUser: AuthUser) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
  }, []);

  const fetchProfile = useCallback(
    async (activeToken: string | null) => {
      if (!activeToken) {
        setUser(null);
        return;
      }

      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${activeToken}`
        }
      });

      if (!response.ok) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setUser(null);
        setToken(null);
        return;
      }

      const data = (await response.json()) as { user: AuthUser };
      setUser(data.user);
      setToken(activeToken);
    },
    []
  );

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setInitializing(false);
      return;
    }
    fetchProfile(storedToken)
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        setInitializing(false);
      });
  }, [fetchProfile]);

  const login = useCallback<AuthContextValue["login"]>(
    async (payload) => {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          return { success: false, error: body.error ?? "Unable to login" };
        }

        const data = (await response.json()) as { token: string; user: AuthUser };
        applySession(data.token, data.user);
        return { success: true };
      } catch (error) {
        console.error("Login failed", error);
        return { success: false, error: "Unexpected error logging in" };
      }
    },
    [applySession]
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (payload) => {
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          return { success: false, error: body.error ?? "Unable to register" };
        }

        const data = (await response.json()) as { token: string; user: AuthUser };
        applySession(data.token, data.user);
        return { success: true };
      } catch (error) {
        console.error("Registration failed", error);
        return { success: false, error: "Unexpected error registering" };
      }
    },
    [applySession]
  );

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const refreshProfile = useCallback(async () => {
    await fetchProfile(token);
  }, [fetchProfile, token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      initializing,
      login,
      register,
      logout,
      refreshProfile
    }),
    [user, token, initializing, login, register, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};

export type { AuthUser };

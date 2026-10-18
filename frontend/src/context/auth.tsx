import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY } from "@/src/api/client";

type Role = "parent" | "partner";
type User = { id: string; email: string; role?: Role };

type AuthResp = { access_token: string; user: User };

type AuthState = {
  user: User | null;
  role: Role;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  registerParent: (email: string, password: string, organization_name: string) => Promise<void>;
  registerPartner: (email: string, password: string, invite_code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet(TOKEN_KEY, "");
      if (token) {
        try {
          const me = await api<User>("/me");
          setUser(me);
        } catch {
          await storage.secureRemove(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  const apply = useCallback(async (res: AuthResp) => {
    await storage.secureSet(TOKEN_KEY, res.access_token);
    const me = await api<User>("/me");
    setUser(me);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResp>("/auth/login", { method: "POST", body: { email, password } });
    await apply(res);
  }, [apply]);

  const registerParent = useCallback(async (email: string, password: string, organization_name: string) => {
    const res = await api<AuthResp>("/auth/register/parent", {
      method: "POST",
      body: { email, password, organization_name },
    });
    await apply(res);
  }, [apply]);

  const registerPartner = useCallback(async (email: string, password: string, invite_code: string) => {
    const res = await api<AuthResp>("/auth/register/partner", {
      method: "POST",
      body: { email, password, invite_code },
    });
    await apply(res);
  }, [apply]);

  const signOut = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  const role: Role = (user?.role as Role) || "parent";

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, registerParent, registerPartner, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

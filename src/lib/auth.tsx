import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthState = { user: User | null; session: Session | null; isAdmin: boolean; loading: boolean };
const AuthCtx = createContext<AuthState>({
  user: null,
  session: null,
  isAdmin: false,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isAdmin: false,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    const apply = async (session: Session | null) => {
      let isAdmin = false;
      if (session?.user) {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "admin")
          .maybeSingle();
        isAdmin = !!data;
      }
      if (active) setState({ user: session?.user ?? null, session, isAdmin, loading: false });
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setTimeout(() => apply(session), 0);
    });
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

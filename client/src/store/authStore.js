import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => {
        set({ token: token || null, user: user || null });
      },
      logout: () => {
        set({ token: null, user: null });
      }
    }),
    {
      name: "careerpilot-session",
      storage: createJSONStorage(() => localStorage)
    }
  )
);

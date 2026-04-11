"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatContext } from "@/lib/chat-context";

interface ChatProviderProps {
  children: React.ReactNode;
}

export default function ChatProvider({ children }: ChatProviderProps): JSX.Element {
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setIsChatOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const value = useMemo(
    () => ({
      isChatOpen,
      toggleChat: () => setIsChatOpen((current) => !current),
      openChat: () => setIsChatOpen(true),
      closeChat: () => setIsChatOpen(false),
    }),
    [isChatOpen]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

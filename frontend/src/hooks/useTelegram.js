import { useEffect, useState } from "react";
import WebApp from "@twa-dev/sdk";

export function useTelegram() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(WebApp.initDataUnsafe?.user || null);
  }, []);

  return { tg: WebApp, user };
}

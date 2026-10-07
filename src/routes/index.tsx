import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/LoginPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SafeVault — Your Documents. Your Control." },
      { name: "description", content: "Securely store, search and manage your important documents with an AI assistant and expiry reminders." },
      { property: "og:title", content: "SafeVault — Your Documents. Your Control." },
      { property: "og:description", content: "Securely store, search and manage your important documents with an AI assistant and expiry reminders." },
    ],
  }),
  component: LoginPage,
});

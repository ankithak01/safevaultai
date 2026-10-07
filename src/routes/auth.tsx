import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/LoginPage";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SafeVault" },
      { name: "description", content: "Sign in or create your SafeVault account to access your secure document vault." },
      { property: "og:title", content: "Sign in — SafeVault" },
      { property: "og:description", content: "Sign in or create your SafeVault account to access your secure document vault." },
    ],
  }),
  component: LoginPage,
});

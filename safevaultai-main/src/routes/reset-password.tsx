import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — SafeVault" },
      { name: "description", content: "Choose a new password for your SafeVault account." },
      { property: "og:title", content: "Reset password — SafeVault" },
      { property: "og:description", content: "Choose a new password for your SafeVault account." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        className="card w-full max-w-sm space-y-4 p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.auth.updateUser({ password: pw });
          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success("Password updated");
          navigate({ to: "/dashboard" });
        }}
      >
        <Logo />
        <h1 className="text-xl font-bold">Set a new password</h1>
        <input
          type="password"
          required
          minLength={6}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="input"
          placeholder="New password"
        />
        <button className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
          Update password
        </button>
      </form>
    </div>
  );
}

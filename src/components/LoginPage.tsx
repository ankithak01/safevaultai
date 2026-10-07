import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Search, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Logo } from "@/components/Logo";
import heroImg from "@/assets/vault-hero.png";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("Password reset link sent to your email.");
        setMode("in");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  const features = [
    { icon: Lock, t: "Secure Storage", d: "Your data, always encrypted" },
    { icon: Search, t: "Smart Search", d: "Find information in seconds" },
    { icon: Sparkles, t: "AI Assistant", d: "Ask questions, get answers" },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col overflow-hidden bg-accent/60 p-12 lg:flex">
        <Logo />
        <h1 className="mt-14 text-4xl font-extrabold tracking-tight text-primary">Your Documents. Your Control.</h1>
        <p className="mt-4 max-w-md text-muted-foreground">Store, manage and access your important documents with AI-powered insights — securely and effortlessly.</p>
        <div className="mt-10 grid max-w-lg grid-cols-2 gap-6">
          {features.map((f) => (
            <div key={f.t} className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card text-primary shadow-sm"><f.icon className="h-5 w-5" /></div>
              <div><p className="text-sm font-semibold">{f.t}</p><p className="text-xs text-muted-foreground">{f.d}</p></div>
            </div>
          ))}
        </div>
        <img src={heroImg} alt="Folder of documents protected by a shield" className="mt-auto w-full max-w-md self-center" />
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold">{mode === "in" ? "Welcome Back" : mode === "up" ? "Create your vault" : "Reset password"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "in" ? "Sign in to your SafeVault account" : mode === "up" ? "Start storing documents securely" : "We'll email you a reset link"}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "up" && (
              <Field label="Full name"><input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Your name" /></Field>
            )}
            <Field label="Email address">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
            </Field>
            {mode !== "reset" && (
              <Field label="Password">
                <div className="relative">
                  <input required minLength={6} type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="input pr-10" placeholder="Enter your password" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-2.5 text-muted-foreground" aria-label="Toggle password">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            )}
            {mode === "in" && (
              <div className="flex justify-end text-xs">
                <button type="button" onClick={() => setMode("reset")} className="font-medium text-primary hover:underline">Forgot password?</button>
              </div>
            )}
            <button disabled={busy} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
            </button>
          </form>
          {mode !== "reset" && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" /></div>
              <button onClick={google} className="flex w-full items-center justify-center gap-2 rounded-lg border bg-card py-2.5 text-sm font-medium hover:bg-muted">
                <ShieldCheck className="h-4 w-4 text-primary" /> Continue with Google
              </button>
            </>
          )}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {mode === "in" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="font-semibold text-primary hover:underline">{mode === "in" ? "Sign up" : "Sign in"}</button>
          </p>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium">{label}</span>{children}</label>;
}

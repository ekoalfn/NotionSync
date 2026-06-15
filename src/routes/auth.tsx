import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — NowTrack" },
      { name: "description", content: "Sign in to your NowTrack account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long");

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/", replace: true });
    }
  }, [user, loading, navigate]);

  const validate = () => {
    const e: Record<string, string> = {};
    const em = emailSchema.safeParse(email);
    if (!em.success) e.email = em.error.issues[0].message;
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) e.password = pw.error.issues[0].message;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back");
      navigate({ to: "/", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      // Generic message to avoid leaking which field is wrong
      if (/invalid/i.test(msg)) {
        toast.error("Invalid email or password");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async () => {
    const em = emailSchema.safeParse(email);
    if (!em.success) {
      setErrors({ email: "Enter your email above first" });
      return;
    }
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6">
      <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="aurora-blob w-[55vw] h-[55vw] -top-[15vw] -left-[10vw]" style={{ background: "var(--aurora-1)" }} />
        <div className="aurora-blob w-[50vw] h-[50vw] -top-[10vw] right-[-10vw]" style={{ background: "var(--aurora-2)", animationDelay: "-4s" }} />
      </div>

      <div className="w-full max-w-md glass-strong rounded-[2rem] p-8 animate-fade-in">
        <Link to="/" className="flex items-center gap-3 mb-8">
          <div className="size-8 rounded-full bg-foreground flex items-center justify-center">
            <div className="size-2.5 bg-background rounded-full animate-pulse" />
          </div>
          <span className="font-display font-extrabold tracking-[0.18em]">NOWTRACK</span>
        </Link>

        <h1 className="font-display text-2xl font-extrabold mb-1">Sign in</h1>
        <p className="text-sm text-foreground/50 mb-6">Welcome back. Enter your credentials.</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={255}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm"
            />
            {errors.email && <span className="text-xs text-destructive">{errors.email}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40 flex items-center justify-between">
              <span>Password</span>
              <button type="button" onClick={onForgot} className="normal-case text-foreground/50 hover:text-foreground underline">
                Forgot?
              </button>
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              minLength={8}
              maxLength={72}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm"
            />
            {errors.password && <span className="text-xs text-destructive">{errors.password}</span>}
          </label>

          <button
            type="submit"
            disabled={busy}
            className="mt-2 px-4 py-3 bg-foreground text-background rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {busy ? "Please wait…" : "Sign in"}
          </button>
        </form>

      </div>
    </div>
  );
}
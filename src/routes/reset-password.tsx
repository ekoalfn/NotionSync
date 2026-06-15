import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — NowTrack" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "At least 8 characters").max(72);

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase recovery link sets a session via the URL hash automatically
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return setError(pw.error.issues[0].message);
    if (password !== confirm) return setError("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    toast.success("Password updated");
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-strong rounded-[2rem] p-8">
        <h1 className="font-display text-2xl font-extrabold mb-2">Set a new password</h1>
        <p className="text-sm text-foreground/50 mb-6">
          {ready ? "Choose a strong password you don't use elsewhere." : "Verifying recovery link…"}
        </p>
        {ready && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40">New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40">Confirm password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur text-sm"
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-3 bg-foreground text-background rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
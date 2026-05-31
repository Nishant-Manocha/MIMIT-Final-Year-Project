import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — AdaptiveAI" }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup, user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/dashboard", replace: true });
  }, [authLoading, navigate, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    setLoading(true);
    try {
      await signup(name, email, password);
      toast.success("Account created! Welcome aboard.");
      navigate({ to: "/dashboard" });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Account creation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-1/4 h-[400px] w-[400px] rounded-full bg-secondary/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full bg-primary/25 blur-3xl" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="glass-strong gradient-border rounded-2xl p-8 shadow-elevated">
          <h1 className="font-display text-2xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start learning in under a minute.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field
              label="Display name"
              value={name}
              onChange={setName}
              placeholder="Ada Lovelace"
              required
            />
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Create account <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have one?{" "}
            <Link
              to="/login"
              className="font-medium text-foreground transition hover:text-secondary"
            >
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: { label: string; value: string; onChange: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background/40 px-3.5 py-2.5 text-sm outline-none ring-primary/40 transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2"
      />
    </label>
  );
}

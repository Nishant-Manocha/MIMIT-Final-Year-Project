import { Link } from "@tanstack/react-router";
import { Brain, Sparkles } from "lucide-react";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow-sm transition group-hover:scale-105">
        <Brain className="h-5 w-5 text-primary-foreground" strokeWidth={2.2} />
        <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-secondary animate-pulse" />
      </div>
      <span className="font-display text-lg font-bold tracking-tight">
        Adaptive<span className="text-gradient">AI</span>
      </span>
    </Link>
  );
}

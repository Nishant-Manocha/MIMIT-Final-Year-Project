import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Brain, Sparkles, Target, BarChart3, MessageSquare, Trophy,
  ArrowRight, Check, Star, Zap, Users, BookOpen,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AdaptiveAI — Learn smarter, not harder" },
      { name: "description", content: "An AI-powered adaptive learning platform with personalized quizzes, ML recommendations, and a 24/7 AI tutor." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, navigate, user]);

  if (loading || user) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* animated background blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/30 blur-3xl animate-float" />
        <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-secondary/25 blur-3xl animate-float" style={{ animationDelay: "2s" }} />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-accent/20 blur-3xl animate-float" style={{ animationDelay: "4s" }} />
        <div className="absolute inset-0 bg-grid opacity-40" style={{ maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)" }} />
      </div>

      <Nav />

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 md:pb-24 md:pt-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-secondary" />
            Powered by adaptive ML & Gemini
          </div>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-7xl">
            Learn what you don't know.
            <br />
            <span className="text-gradient">Skip what you do.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            AdaptiveAI adjusts every question to your level, finds your weak topics in seconds,
            and tutors you 24/7 with a real AI. Built for ambitious learners.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground glow transition hover:scale-[1.02]"
            >
              Start learning free
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl glass-strong px-6 py-3.5 text-sm font-semibold hover-lift"
            >
              Sign in
            </Link>
          </div>

          {/* stat ribbon */}
          <div className="mx-auto mt-10 grid max-w-2xl gap-3 sm:mt-16 sm:grid-cols-3 sm:gap-4">
            {[
              { v: "60k+", l: "Active learners" },
              { v: "94%", l: "Pass rate" },
              { v: "4.9★", l: "Avg rating" },
            ].map((s) => (
              <div key={s.l} className="glass rounded-xl px-3 py-4">
                <div className="font-display text-2xl font-bold text-gradient">{s.v}</div>
                <div className="text-xs text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* hero product card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative mx-auto mt-12 max-w-5xl sm:mt-20"
        >
          <div className="glass-strong gradient-border relative overflow-hidden rounded-2xl p-2 shadow-elevated">
            <div className="rounded-xl bg-background/60 p-4 sm:p-6 md:p-8">
              <div className="grid gap-6 md:grid-cols-3">
                {heroPanels.map((p, i) => (
                  <motion.div
                    key={p.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="glass rounded-xl p-5"
                  >
                    <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-gradient-primary glow-sm">
                      <p.icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div className="text-sm font-semibold">{p.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{p.desc}</div>
                    {p.body}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-secondary">Features</div>
          <h2 className="mt-3 font-display text-4xl font-bold md:text-5xl">Built around how you actually learn</h2>
          <p className="mt-4 text-muted-foreground">Seven ML systems working in the background so you don't have to think about what to study next.</p>
        </div>
        <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.05 }}
              className="glass gradient-border hover-lift group relative rounded-2xl p-6"
            >
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-gradient-primary glow-sm transition group-hover:scale-110">
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-secondary">Pricing</div>
          <h2 className="mt-3 font-display text-4xl font-bold md:text-5xl">Simple, fair pricing</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`glass relative rounded-2xl p-7 ${p.featured ? "gradient-border glow" : ""}`}
            >
              {p.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Most popular
                </div>
              )}
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold">{p.price}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{p.tag}</div>
              <ul className="mt-6 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`mt-7 inline-flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-semibold transition ${
                  p.featured
                    ? "bg-gradient-primary text-primary-foreground glow-sm hover:brightness-110"
                    : "glass-strong hover-lift"
                }`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="relative mx-auto max-w-3xl px-6 py-24">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-secondary">FAQ</div>
          <h2 className="mt-3 font-display text-4xl font-bold">Questions, answered</h2>
        </div>
        <div className="mt-12 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="glass group rounded-xl px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
                {f.q}
                <span className="text-secondary transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-5xl px-6 py-24">
        <div className="glass-strong gradient-border relative overflow-hidden rounded-3xl p-12 text-center glow">
          <div className="absolute inset-0 bg-grid opacity-20" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold md:text-5xl">Ready to study smarter?</h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">Join thousands of learners getting personalized study plans every day.</p>
            <Link
              to="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground glow"
            >
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <div className="glass-strong flex items-center justify-between rounded-2xl px-4 py-2.5">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition hover:text-foreground">Features</a>
            <a href="#pricing" className="transition hover:text-foreground">Pricing</a>
            <Link to="/courses" className="transition hover:text-foreground">Courses</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground sm:block">
              Sign in
            </Link>
            <Link to="/signup" className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground glow-sm">
              Start free
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-border/40 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
        <Logo />
        <div>© {new Date().getFullYear()} AdaptiveAI. All rights reserved.</div>
        <div className="flex gap-5">
          <a href="#" className="transition hover:text-foreground">Privacy</a>
          <a href="#" className="transition hover:text-foreground">Terms</a>
        </div>
      </div>
    </footer>
  );
}

const heroPanels = [
  {
    icon: Target,
    title: "Adaptive difficulty",
    desc: "Questions get harder as you improve.",
    body: (
      <div className="mt-4 space-y-1.5">
        {["Easy", "Medium", "Hard"].map((l, i) => (
          <div key={l} className="flex items-center gap-2 text-xs">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-gradient-primary" style={{ width: `${30 + i * 25}%` }} />
            </div>
            <span className="w-12 text-muted-foreground">{l}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: BarChart3,
    title: "Weak topic detection",
    desc: "ML pinpoints what to revise.",
    body: (
      <div className="mt-4 flex h-16 items-end gap-1">
        {[40, 65, 30, 80, 50, 70, 45].map((h, i) => (
          <div key={i} className="flex-1 rounded-sm bg-gradient-primary opacity-80" style={{ height: `${h}%` }} />
        ))}
      </div>
    ),
  },
  {
    icon: MessageSquare,
    title: "AI tutor, 24/7",
    desc: "Ask anything. Get clear answers.",
    body: (
      <div className="mt-4 space-y-2">
        <div className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">Why use ReLU over sigmoid?</div>
        <div className="rounded-lg bg-gradient-primary/20 px-2.5 py-1.5 text-xs">ReLU avoids vanishing gradients…</div>
      </div>
    ),
  },
];

const features = [
  { icon: Target, title: "Adaptive Difficulty Engine", desc: "Random Forest + weighted scoring picks the right next question for your level." },
  { icon: BarChart3, title: "Weak Topic Detection", desc: "K-means clustering on accuracy, speed, and consistency surfaces blind spots." },
  { icon: Sparkles, title: "Smart Recommendations", desc: "Cosine-similarity recommendations route you to the chapter you need next." },
  { icon: MessageSquare, title: "AI Tutor Chatbot", desc: "Powered by Gemini. Ask doubts, get worked solutions, drill follow-ups." },
  { icon: Trophy, title: "XP, Streaks & Badges", desc: "Daily goals and ranks keep you accountable. Compete on leaderboards." },
  { icon: Brain, title: "Predicted Exam Score", desc: "Regression model forecasts your performance and percentile early." },
  { icon: BookOpen, title: "Personalized Study Plans", desc: "Generated against your weak topics, available hours, and exam date." },
  { icon: Zap, title: "Real-time Sync", desc: "Live progress, notifications, and collaborative whiteboards." },
  { icon: Users, title: "Discussion & Notes", desc: "Bookmark questions, post doubts, learn from peers." },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    tag: "Perfect to try it out",
    features: ["3 courses", "Basic analytics", "Limited AI tutor", "Community access"],
    featured: false,
  },
  {
    name: "Pro",
    price: "$12",
    tag: "For serious learners",
    features: ["Unlimited courses", "Adaptive quizzes", "Unlimited AI tutor", "Study plan generator", "Priority support"],
    featured: true,
  },
  {
    name: "Teams",
    price: "$39",
    tag: "Classrooms & cohorts",
    features: ["Everything in Pro", "Up to 10 seats", "Instructor dashboard", "Cohort analytics", "SSO"],
    featured: false,
  },
];

const faqs = [
  { q: "How does the adaptive difficulty actually work?", a: "After each answer we update a profile of your skill on that topic. A classifier picks the next difficulty so you stay in the productive struggle zone — not bored, not overwhelmed." },
  { q: "Is the AI tutor really useful?", a: "It's powered by Google Gemini with your full quiz history as context. Ask why an answer is right, request a worked example, or get a 5-question drill on your weakest topic." },
  { q: "Do I need to install anything?", a: "No. It runs in your browser, syncs across devices, and works offline for review." },
  { q: "Can I cancel anytime?", a: "Yes. No contracts, no questions. You can switch back to Free whenever you want." },
];

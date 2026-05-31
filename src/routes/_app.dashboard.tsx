import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Download, FileText, Flame, Sparkles, Target, TrendingUp, Trophy, Zap } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  RadialBar,
  RadialBarChart,
  PolarAngleAxis,
} from "recharts";

type RecommendationItem = {
  id: string;
  title: string;
  description?: string;
};

type EnrollmentItem = {
  id: string;
  progress_pct?: number;
  courses?: {
    title?: string;
    instructor_name?: string;
    slug?: string;
  };
};

type AttemptItem = {
  completed_at?: string;
  accuracy?: number;
};

type SavedPdfItem = {
  id: string;
  title: string;
  scope?: string;
  size_bytes?: number;
  updated_at?: string;
};

type IconComponent = ComponentType<{ className?: string }>;

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AdaptiveAI" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: api.profile,
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["attempts", user?.id],
    enabled: !!user?.id,
    queryFn: () => api.attempts(50),
  });
  const { data: dailyActivity = [] } = useQuery({
    queryKey: ["daily-activity", user?.id, 1],
    enabled: !!user?.id,
    queryFn: () => api.dailyActivity(1),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["enrollments", user?.id],
    enabled: !!user?.id,
    queryFn: api.enrollments,
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ["recommendations", user?.id],
    enabled: !!user?.id,
    queryFn: api.recommendations,
  });

  const { data: savedPdfs = [] } = useQuery({
    queryKey: ["saved-pdfs", user?.id],
    enabled: !!user?.id,
    queryFn: () => api.savedPdfs(8),
  });

  const accuracySeries = buildAccuracySeries(attempts);
  const todayActivityCount = Number(dailyActivity[0]?.count ?? attempts.filter(isToday).length);
  const avgAccuracy =
    attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + Number(a.accuracy ?? 0), 0) / attempts.length)
      : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Your learning, at a glance.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adaptive insights, weak-topic detection, and what to study next.
        </p>
      </motion.div>

      {/* Stat strip */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Zap} label="Total XP" value={profile?.xp ?? 0} hint="Keep going 🚀" />
        <StatCard
          icon={Flame}
          label="Streak"
          value={`${profile?.streak_days ?? 0}d`}
          hint="Daily habit"
          tone="warning"
        />
        <StatCard
          icon={Target}
          label="Avg accuracy"
          value={`${avgAccuracy}%`}
          hint={`${attempts.length} attempts`}
          tone="success"
        />
        <StatCard
          icon={Trophy}
          label="Level"
          value={profile?.level ?? 1}
          hint="Climb the ranks"
          tone="secondary"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Accuracy trend */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass gradient-border rounded-2xl p-6 lg:col-span-2"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Performance
              </div>
              <h2 className="mt-1 font-display text-xl font-semibold">Accuracy over time</h2>
            </div>
            <TrendingUp className="h-5 w-5 text-secondary" />
          </div>
          <div className="mt-6 h-64">
            {accuracySeries.length === 0 ? (
              <EmptyState text="Take a quiz to see your trend." />
            ) : (
              <ResponsiveContainer>
                <AreaChart
                  data={accuracySeries}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="accGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.58 0.22 280)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="oklch(0.58 0.22 280)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="oklch(1 0 0 / 0.06)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "oklch(0.7 0.03 255)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "oklch(0.7 0.03 255)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.18 0.05 270)",
                      border: "1px solid oklch(1 0 0 / 0.08)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    stroke="oklch(0.62 0.2 275)"
                    strokeWidth={2.5}
                    fill="url(#accGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Daily goal radial */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass gradient-border rounded-2xl p-6"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Today
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold">Daily goal</h2>
          <div className="mt-4 h-48">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={[{ name: "g", value: Math.min(100, todayActivityCount * 25) }]}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  dataKey="value"
                  cornerRadius={20}
                  fill="oklch(0.58 0.22 280)"
                  background={{ fill: "oklch(1 0 0 / 0.06)" }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-sm text-muted-foreground">
            {todayActivityCount} of 4 study actions today
          </div>
        </motion.div>
      </div>

      {/* Recommendations & continue learning */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Recommended for you"
          icon={Sparkles}
          action={
            <Link to="/recommendations" className="text-xs text-secondary hover:underline">
              View all
            </Link>
          }
        >
          {recommendations.length === 0 ? (
            <div className="space-y-3">
              {defaultRecs.map((r) => (
                <RecCard key={r.title} title={r.title} description={r.description} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(recommendations as RecommendationItem[]).map((r) => (
                <RecCard key={r.id} title={r.title} description={r.description ?? ""} />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Continue learning"
          icon={Brain}
          action={
            <Link to="/courses" className="text-xs text-secondary hover:underline">
              All courses
            </Link>
          }
        >
          {enrollments.length === 0 ? (
            <div className="rounded-xl glass p-6 text-center">
              <p className="text-sm text-muted-foreground">
                You haven't enrolled in any courses yet.
              </p>
              <Link
                to="/courses"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-secondary"
              >
                Browse courses <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {(enrollments as EnrollmentItem[]).slice(0, 4).map((e) => (
                <div key={e.id} className="glass rounded-xl p-4 hover-lift">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{e.courses?.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.courses?.instructor_name}
                      </div>
                    </div>
                    <Link
                      to="/courses/$slug"
                      params={{ slug: e.courses?.slug }}
                      className="text-xs text-secondary hover:underline"
                    >
                      Resume
                    </Link>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-gradient-primary"
                      style={{ width: `${Number(e.progress_pct ?? 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Saved practice PDFs" icon={FileText}>
        {savedPdfs.length === 0 ? (
          <div className="rounded-xl glass p-6 text-center text-sm text-muted-foreground">
            Saved PDFs will appear here when you choose Save to dashboard from a quiz export.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(savedPdfs as SavedPdfItem[]).map((pdf) => (
              <button
                key={pdf.id}
                onClick={() => downloadSavedPdf(pdf.id)}
                className="glass group flex items-center gap-3 rounded-xl p-4 text-left transition hover:bg-muted/30"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-primary/20">
                  <Download className="h-4 w-4 text-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{pdf.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {pdf.scope ?? "practice"} {pdf.updated_at ? `- ${new Date(pdf.updated_at).toLocaleString()}` : ""}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

async function downloadSavedPdf(id: string) {
  const pdf = await api.savedPdf(id);
  const link = document.createElement("a");
  link.href = pdf.pdf_data;
  link.download = pdf.title || "practice-review.pdf";
  link.click();
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: IconComponent;
  label: string;
  value: ReactNode;
  hint: string;
  tone?: "primary" | "secondary" | "success" | "warning";
}) {
  const colors: Record<string, string> = {
    primary: "text-primary",
    secondary: "text-secondary",
    success: "text-success",
    warning: "text-warning",
  };
  return (
    <motion.div whileHover={{ y: -2 }} className="glass gradient-border rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Icon className={`h-4 w-4 ${colors[tone]}`} />
      </div>
      <div className="mt-2 font-display text-3xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </motion.div>
  );
}

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: IconComponent;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="glass gradient-border rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-secondary" />
          <h2 className="font-display text-lg font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function RecCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass group flex items-start gap-3 rounded-xl p-4 transition hover:bg-muted/30">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-primary/20">
        <Sparkles className="h-4 w-4 text-secondary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ArrowRight className="mt-2 h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">{text}</div>;
}

function isToday(a: AttemptItem) {
  const d = new Date(a.completed_at);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}

function buildAccuracySeries(attempts: AttemptItem[]) {
  if (attempts.length === 0) return [];
  const sorted = [...attempts].reverse();
  return sorted.map((a, i) => ({
    label: `#${i + 1}`,
    accuracy: Number(a.accuracy ?? 0),
  }));
}

const defaultRecs = [
  {
    title: "Start with TCS NQT demo questions",
    description: "Aptitude, reasoning, verbal, and coding in one short practice set.",
  },
  {
    title: "Try GATE CSE syllabus modules",
    description: "Cover DSA, OS, DBMS, CN, TOC, COA, and engineering mathematics.",
  },
  {
    title: "Ask the tutor for an exam plan",
    description: "Get direction for TCS, Infosys, ISRO, BARC, and more.",
  },
];

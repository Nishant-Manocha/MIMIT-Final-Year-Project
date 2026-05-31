import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { detectWeakTopics, type AnswerRecord } from "@/lib/ml";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_app/analytics")({
  head: () => ({ meta: [{ title: "Analytics — AdaptiveAI" }] }),
  component: AnalyticsPage,
});

const COLORS = [
  "oklch(0.58 0.22 280)",
  "oklch(0.55 0.23 295)",
  "oklch(0.62 0.2 195)",
  "oklch(0.78 0.17 75)",
  "oklch(0.7 0.17 160)",
];

function AnalyticsPage() {
  const { user } = useAuth();
  const { data: attempts = [] } = useQuery({
    queryKey: ["attempts", user?.id],
    enabled: !!user?.id,
    queryFn: api.attempts,
  });
  const { data: activity = [] } = useQuery({
    queryKey: ["daily-activity", user?.id, 84],
    enabled: !!user?.id,
    queryFn: () => api.dailyActivity(84),
  });

  const history: AnswerRecord[] = attempts.flatMap(
    (a: any) => (a.per_question ?? a.answers ?? []) as AnswerRecord[],
  );
  const topics = detectWeakTopics(history);

  const trend = attempts.map((a: any, i: number) => ({
    label: `#${i + 1}`,
    accuracy: Number(a.accuracy ?? 0),
    score: Number(a.score ?? 0),
  }));

  const difficultyDist = (() => {
    const m: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    history.forEach((r) => {
      m[r.difficulty] = (m[r.difficulty] ?? 0) + 1;
    });
    return Object.entries(m).map(([k, v]) => ({ name: k, value: v }));
  })();

  const heat = buildHeatmap(activity);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your learning behaviour, visualized.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass gradient-border rounded-2xl p-6 lg:col-span-2"
        >
          <h2 className="font-display text-lg font-semibold">Accuracy trend</h2>
          <div className="mt-4 h-64">
            {trend.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="acc2" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.58 0.22 280)" stopOpacity={0.55} />
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
                    fill="url(#acc2)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass gradient-border rounded-2xl p-6"
        >
          <h2 className="font-display text-lg font-semibold">Difficulty mix</h2>
          <div className="mt-4 h-64">
            {history.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={difficultyDist}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={4}
                  >
                    {difficultyDist.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} stroke="none" />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass gradient-border rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold">Topic accuracy</h2>
          <div className="mt-4 h-64">
            {topics.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer>
                <BarChart
                  data={topics.map((t) => ({
                    topic: t.topic,
                    accuracy: Math.round(t.accuracy * 100),
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="oklch(1 0 0 / 0.06)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="topic"
                    tick={{ fill: "oklch(0.7 0.03 255)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "oklch(0.7 0.03 255)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.18 0.05 270)",
                      border: "1px solid oklch(1 0 0 / 0.08)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="accuracy" fill="oklch(0.58 0.22 280)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="glass gradient-border rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold">Study activity (last 12 weeks)</h2>
          <div className="mt-5 grid grid-cols-12 gap-1.5">
            {heat.map((day, i) => (
              <div
                key={i}
                title={`${day.date}: ${day.count} study activity`}
                className="aspect-square rounded-sm"
                style={{ background: heatColor(day.count) }}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            Less
            {[0, 1, 2, 4, 7].map((n) => (
              <div key={n} className="h-3 w-3 rounded-sm" style={{ background: heatColor(n) }} />
            ))}
            More
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      Not enough data yet.
    </div>
  );
}

function buildHeatmap(activity: any[]) {
  const days = 84;
  if (activity.length > 0) {
    return activity.slice(-days).map((day) => ({
      date: day.date,
      count: Number(day.count ?? 0),
    }));
  }

  return Array.from({ length: days }, (_, i) => ({
    date: `Day ${i + 1}`,
    count: 0,
  }));
}

function heatColor(n: number): string {
  if (n === 0) return "oklch(1 0 0 / 0.05)";
  if (n < 2) return "oklch(0.58 0.22 280 / 0.25)";
  if (n < 4) return "oklch(0.58 0.22 280 / 0.5)";
  if (n < 7) return "oklch(0.58 0.22 280 / 0.75)";
  return "oklch(0.58 0.22 280 / 1)";
}

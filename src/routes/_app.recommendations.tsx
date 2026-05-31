import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { detectWeakTopics, predictExamScore, type AnswerRecord } from "@/lib/ml";
import { motion } from "framer-motion";
import { Brain, Sparkles, Target, TrendingUp, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/recommendations")({
  head: () => ({ meta: [{ title: "For You — AdaptiveAI" }] }),
  component: RecsPage,
});

function RecsPage() {
  const { user } = useAuth();

  const { data: attempts = [] } = useQuery({
    queryKey: ["attempts", user?.id],
    enabled: !!user?.id,
    queryFn: api.attempts,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: api.courses,
  });

  const history: AnswerRecord[] = attempts.flatMap(
    (a: any) => (a.per_question ?? a.answers ?? []) as AnswerRecord[],
  );
  const weakTopics = detectWeakTopics(history);
  const predictedScore = predictExamScore(history);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">For you</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ML-generated insights based on your performance.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="glass gradient-border rounded-2xl p-10 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-secondary" />
          <p className="mt-3 text-sm text-muted-foreground">
            Take at least one quiz so we can analyze your performance.
          </p>
          <Link
            to="/quizzes"
            className="mt-4 inline-block rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground glow-sm"
          >
            Take a quiz
          </Link>
        </div>
      ) : (
        <>
          {/* Predicted score */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong gradient-border rounded-2xl p-6 glow"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-secondary">
              <TrendingUp className="h-3.5 w-3.5" /> ML prediction
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-semibold">Your predicted exam score</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Weighted regression on your last {Math.min(20, history.length)} answers.
                </p>
              </div>
              <div className="font-display text-5xl font-bold text-gradient">{predictedScore}%</div>
            </div>
          </motion.div>

          {/* Weak topics */}
          <div className="glass gradient-border rounded-2xl p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="font-display text-lg font-semibold">Weak topics to focus on</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Detected by K-Means clustering on accuracy + response time.
            </p>
            <div className="mt-5 space-y-2.5">
              {weakTopics.slice(0, 6).map((t) => (
                <div key={t.topic} className="glass flex items-center gap-3 rounded-xl p-3.5">
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-lg ${t.isWeak ? "bg-destructive/20" : "bg-success/20"}`}
                  >
                    {t.isWeak ? (
                      <Target className="h-4 w-4 text-destructive" />
                    ) : (
                      <Brain className="h-4 w-4 text-success" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold capitalize">
                      {t.topic.replace(/-/g, " ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.attempts} attempts · avg {Math.round(t.avgTime)}s
                    </div>
                  </div>
                  <div className="w-20 text-right">
                    <div
                      className={`text-sm font-bold ${t.accuracy >= 0.7 ? "text-success" : t.accuracy >= 0.5 ? "text-warning" : "text-destructive"}`}
                    >
                      {Math.round(t.accuracy * 100)}%
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.isWeak ? "Revise" : "Strong"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Course recommendations (content-based) */}
          <div className="glass gradient-border rounded-2xl p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              <h2 className="font-display text-lg font-semibold">Recommended courses</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Matched to your weak topics via tag-based content similarity.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {recommendCourses(courses, weakTopics)
                .slice(0, 4)
                .map((c) => (
                  <Link
                    key={c.id}
                    to="/courses/$slug"
                    params={{ slug: c.slug }}
                    className="glass hover-lift block rounded-xl p-4"
                  >
                    <div className="text-xs text-secondary">{c.category}</div>
                    <div className="mt-1 font-display font-semibold">{c.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {c.description}
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function recommendCourses(courses: any[], weak: ReturnType<typeof detectWeakTopics>) {
  const weakSet = new Set(weak.filter((w) => w.isWeak).map((w) => w.topic.toLowerCase()));
  return courses
    .map((c) => {
      const tags = (c.tags ?? []).map((t: string) => t.toLowerCase());
      const overlap = tags.filter((t: string) =>
        Array.from(weakSet).some((w) => t.includes(w) || w.includes(t)),
      ).length;
      return { ...c, _score: overlap };
    })
    .sort((a, b) => b._score - a._score);
}

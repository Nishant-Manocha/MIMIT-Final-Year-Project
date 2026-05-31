import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Brain, CheckCircle2, Clock, FileQuestion, History } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";

type QuizSummary = {
  id: string;
  title: string;
  description?: string;
  difficulty?: string;
  time_limit_seconds?: number;
  quiz_type?: string;
  completed?: boolean;
  latest_score?: number | null;
  latest_max_score?: number | null;
  latest_accuracy?: number | null;
  courses?: {
    title?: string;
  };
};

export const Route = createFileRoute("/_app/quizzes/")({
  head: () => ({ meta: [{ title: "Question Sets - AdaptiveAI" }] }),
  component: QuizzesIndex,
});

function QuizzesIndex() {
  const [tab, setTab] = useState<"quizzes" | "papers">("quizzes");
  const { data: quizzes = [] } = useQuery<QuizSummary[]>({
    queryKey: ["all-quizzes"],
    queryFn: api.quizzes,
  });
  const filtered = useMemo(
    () =>
      quizzes.filter((quiz) =>
        tab === "papers" ? quiz.quiz_type === "previous-year" : quiz.quiz_type !== "previous-year",
      ),
    [quizzes, tab],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">Question Sets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose quick quizzes or full question papers with the same solving workspace.
          </p>
        </div>
        <div className="flex rounded-xl border border-border bg-card/60 p-1">
          <button
            onClick={() => setTab("quizzes")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === "quizzes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileQuestion className="h-4 w-4" />
            Quizzes
          </button>
          <button
            onClick={() => setTab("papers")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === "papers" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="h-4 w-4" />
            Question Papers
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((q, i) => (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Link
              to="/quizzes/$id"
              params={{ id: q.id }}
              className="glass gradient-border hover-lift block rounded-2xl p-5"
            >
              <div className="flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary/15">
                  {q.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <FileQuestion className="h-5 w-5 text-secondary" />
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {q.completed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      Given
                    </span>
                  )}
                  <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-semibold capitalize text-secondary">
                    {q.quiz_type === "previous-year" ? "PYQ" : q.difficulty}
                  </span>
                </div>
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold">{q.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{q.description}</p>
              {q.completed && (
                <div className="mt-4 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-xs font-semibold text-success">
                  Last score: {q.latest_score ?? 0}/{q.latest_max_score ?? 0}
                  {typeof q.latest_accuracy === "number" ? ` - ${Math.round(q.latest_accuracy)}%` : ""}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1">
                  <Brain className="h-3 w-3 shrink-0" />
                  <span className="truncate">{q.courses?.title}</span>
                </span>
                {q.time_limit_seconds && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {Math.round(q.time_limit_seconds / 60)}m
                  </span>
                )}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}


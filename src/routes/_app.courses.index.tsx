import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { BookOpen, Clock, FileQuestion, Search, Star, Target, Users } from "lucide-react";

type CourseSummary = {
  id: string;
  title: string;
  slug: string;
  description?: string;
  thumbnail_url?: string;
  difficulty?: string;
  category?: string;
  tags?: string[];
  duration_minutes?: number;
  rating?: number;
  enrolled_count?: number;
};

export const Route = createFileRoute("/_app/courses/")({
  head: () => ({ meta: [{ title: "Courses — AdaptiveAI" }] }),
  component: CoursesPage,
});

function CoursesPage() {
  const [q, setQ] = useState("");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");

  const { data: courses = [], isLoading } = useQuery<CourseSummary[]>({
    queryKey: ["courses"],
    queryFn: api.courses,
  });

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (difficulty !== "all" && c.difficulty !== difficulty) return false;
      if (category !== "all" && c.category !== category) return false;
      if (
        q &&
        !`${c.title} ${c.description} ${c.tags?.join(" ")}`.toLowerCase().includes(q.toLowerCase())
      )
        return false;
      return true;
    });
  }, [courses, q, difficulty, category]);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(courses.map((c) => c.category).filter(Boolean)))],
    [courses],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Exam prep courses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Placement, GATE, ISRO, BARC, and technical exam tracks with syllabus and demo questions.
        </p>
      </div>

      <div className="glass gradient-border flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses, topics, tags…"
            className="w-full rounded-lg border border-border bg-background/40 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c: string) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition ${
                category === c
                  ? "bg-secondary text-secondary-foreground"
                  : "glass hover:bg-muted/50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {["all", "beginner", "intermediate", "advanced"].map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition ${
                difficulty === d
                  ? "bg-gradient-primary text-primary-foreground glow-sm"
                  : "glass hover:bg-muted/50"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass animate-pulse rounded-2xl p-6">
              <div className="h-32 rounded-lg bg-muted" />
              <div className="mt-4 h-4 w-3/4 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          No courses match your filters.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Link to="/courses/$slug" params={{ slug: c.slug }} className="block">
                <div className="glass gradient-border hover-lift group h-full overflow-hidden rounded-2xl">
                  <div className="relative h-40 overflow-hidden bg-muted">
                    {c.thumbnail_url ? (
                      <img
                        src={c.thumbnail_url}
                        alt=""
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-full place-items-center bg-gradient-primary/20">
                        <BookOpen className="h-12 w-12 text-secondary/70" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/15 to-transparent" />
                    <div className="absolute bottom-3 left-3 flex gap-2">
                      <span className="rounded-full bg-background/70 px-2 py-1 text-[10px] font-semibold uppercase text-foreground backdrop-blur">
                        {c.category ?? "General"}
                      </span>
                      <span className="rounded-full bg-secondary/80 px-2 py-1 text-[10px] font-semibold capitalize text-secondary-foreground backdrop-blur">
                        {c.difficulty}
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg font-semibold leading-tight transition group-hover:text-gradient">
                      {c.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {c.description}
                    </p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-warning" /> {c.rating}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {c.enrolled_count?.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {Math.round((c.duration_minutes ?? 0) / 60)}h
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {(c.tags ?? []).slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground"
                        >
                          <Target className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-medium text-secondary">
                      <FileQuestion className="h-3.5 w-3.5" />
                      Syllabus, demo course, and practice questions
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

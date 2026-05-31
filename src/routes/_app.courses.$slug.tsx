import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileQuestion,
  Play,
  Star,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_app/courses/$slug")({
  component: CourseDetail,
});

function CourseDetail() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: course } = useQuery({
    queryKey: ["course", slug],
    queryFn: () => api.course(slug),
  });

  const { data: chapters = [] } = useQuery({
    queryKey: ["chapters", course?.id],
    enabled: !!course?.id,
    queryFn: () => api.chapters(course!.id),
  });

  const { data: quizzes = [] } = useQuery({
    queryKey: ["course-quizzes", course?.id],
    enabled: !!course?.id,
    queryFn: () => api.courseQuizzes(course!.id),
  });

  const { data: enrollment } = useQuery({
    queryKey: ["enrollment", course?.id, user?.id],
    enabled: !!course?.id && !!user?.id,
    queryFn: () => api.enrollment(course!.id),
  });

  const enroll = useMutation({
    mutationFn: async () => {
      await api.enroll(course!.id);
    },
    onSuccess: () => {
      toast.success("Enrolled. Let's go!");
      qc.invalidateQueries({ queryKey: ["enrollment", course?.id] });
      qc.invalidateQueries({ queryKey: ["enrollments"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Enrollment failed"),
  });

  if (!course) {
    return (
      <div className="grid h-64 place-items-center text-sm text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong gradient-border overflow-hidden rounded-2xl"
      >
        {course.thumbnail_url && (
          <div className="relative h-64 overflow-hidden md:h-80">
            <img src={course.thumbnail_url} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent" />
          </div>
        )}

        <div className="p-6 md:p-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/courses" className="hover:text-foreground">
              Courses
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>{course.category}</span>
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold md:text-4xl">{course.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{course.description}</p>

          <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
            <span>
              Taught by{" "}
              <span className="font-medium text-foreground">{course.instructor_name}</span>
            </span>
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 text-warning" /> {course.rating}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {course.enrolled_count?.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" /> {Math.round((course.duration_minutes ?? 0) / 60)}h
            </span>
            <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-xs font-semibold capitalize text-secondary">
              {course.difficulty}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(course.tags ?? []).slice(0, 6).map((tag: string) => (
              <span
                key={tag}
                className="rounded-md bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {enrollment ? (
              <button
                onClick={() =>
                  quizzes[0] && navigate({ to: "/quizzes/$id", params: { id: quizzes[0].id } })
                }
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-sm"
              >
                <Play className="h-4 w-4" /> Continue learning
              </button>
            ) : (
              <button
                onClick={() => enroll.mutate()}
                disabled={enroll.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-sm disabled:opacity-60"
              >
                {enroll.isPending ? "Enrolling..." : "Enroll free"}
              </button>
            )}
            {quizzes[0] && (
              <button
                onClick={() => navigate({ to: "/quizzes/$id", params: { id: quizzes[0].id } })}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/30 px-5 py-2.5 text-sm font-semibold hover:bg-muted/40"
              >
                <FileQuestion className="h-4 w-4" /> Try demo questions
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Syllabus and course modules</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Follow these modules as a study plan for the exam.
            </p>
          </div>
          <span className="hidden rounded-lg bg-secondary/15 px-3 py-1 text-xs font-semibold text-secondary sm:inline-flex">
            {chapters.length} modules
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {chapters.map((ch, i) => (
            <div key={ch.id} className="glass flex items-center gap-4 rounded-xl p-4">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary/20 text-sm font-semibold text-secondary">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{ch.title}</div>
                {ch.description && (
                  <div className="truncate text-xs text-muted-foreground">{ch.description}</div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {Math.round((ch.duration_seconds ?? 0) / 60)} min
              </div>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </section>

      {quizzes.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold">Demo questions and practice tests</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {quizzes.map((q) => (
              <Link
                key={q.id}
                to="/quizzes/$id"
                params={{ id: q.id }}
                className="glass gradient-border hover-lift rounded-xl p-5"
              >
                <Brain className="h-5 w-5 text-secondary" />
                <div className="mt-3 font-display font-semibold">{q.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{q.description}</div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="capitalize">{q.quiz_type}</span>
                  {q.time_limit_seconds && <span>{Math.round(q.time_limit_seconds / 60)} min</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

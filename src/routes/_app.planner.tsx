import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  BookOpen,
  CalendarDays,
  Clock,
  FileText,
  Loader2,
  Route as RouteIcon,
  Sparkles,
  Target,
  Upload,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_app/planner")({
  head: () => ({ meta: [{ title: "AI Study Planner - AdaptiveAI" }] }),
  component: StudyPlannerPage,
});

type UploadPayload = {
  name: string;
  mime_type: string;
  data: string;
};

type StudyPlan = {
  title?: string;
  mode_strategy?: string;
  extracted_overview?: string;
  priority_topics?: Array<{
    subject?: string;
    topic?: string;
    priority_score?: number;
    reason?: string;
    difficulty?: string;
    concept_type?: string;
    estimated_hours?: number;
  }>;
  daily_plan?: Array<{ day?: string; focus?: string; tasks?: string[]; output?: string }>;
  weekly_milestones?: string[];
  revision_schedule?: string[];
  mock_test_schedule?: string[];
  youtube_playlists?: Array<{
    title?: string;
    purpose?: string;
    search_query?: string;
    ranking_reason?: string;
    preferred_style?: string;
  }>;
  generated_outputs?: {
    summary_30_sec?: string;
    revision_5_min?: string[];
    deep_learning_20_min?: string[];
    formula_sheet?: string[];
    flashcards?: Array<{ front?: string; back?: string }>;
    quizzes?: Array<{ question?: string; answer?: string; type?: string; difficulty?: string }>;
  };
  adaptive_rules?: string[];
  architecture_next_steps?: string[];
};

type YoutubeRecommendations = {
  ranked_videos?: Array<{
    id?: string;
    title?: string;
    channel?: string;
    url?: string;
    score?: number;
    confidence?: number;
    reason?: string;
    ranking_basis?: string;
    score_breakdown?: Record<string, number>;
    estimated_study_time?: string;
    difficulty?: string;
    teaching_style?: string;
    language?: string;
  }>;
  ranked_playlists?: Array<{
    id?: string;
    title?: string;
    channel?: string;
    url?: string;
    score?: number;
    reason?: string;
    ranking_basis?: string;
    score_breakdown?: Record<string, number>;
    estimated_study_time?: string;
    teaching_style?: string;
  }>;
  learning_path?: Array<{ step?: number; topic?: string; subject?: string; target?: string; youtube_query?: string }>;
  best_picks?: Record<string, any>;
  strategy?: string;
};

const examModes = [
  "GATE Exam",
  "Semester Exams",
  "Placement Preparation",
  "Competitive Exams",
  "Last-Minute Revision",
  "Deep Concept Learning",
  "University Internal Exams",
];

const complexityLevels = ["Beginner", "Easy Scoring", "Moderate", "Deep Learning", "Research Level"];
const PLANNER_STATE_KEY = "adaptiveai_study_planner_state_v1";
const PLANNER_HISTORY_KEY = "adaptiveai_study_planner_history_v1";

type PersistedPlannerState = {
  fileMeta?: { name: string; mime_type: string } | null;
  goal?: string;
  complexity?: string;
  examDate?: string;
  hoursPerDay?: number;
  level?: string;
  personalizationContext?: string;
  language?: string;
  provider?: string | null;
  plan?: StudyPlan | null;
  youtubeRecs?: YoutubeRecommendations | null;
};

type SavedPlannerRun = PersistedPlannerState & {
  id: string;
  title: string;
  createdAt: string;
};

function StudyPlannerPage() {
  const savedState = loadPlannerState();
  const [file, setFile] = useState<UploadPayload | null>(
    savedState.fileMeta ? { ...savedState.fileMeta, data: "" } : null,
  );
  const [goal, setGoal] = useState(savedState.goal || "GATE Exam");
  const [complexity, setComplexity] = useState(savedState.complexity || "Moderate");
  const [examDate, setExamDate] = useState(savedState.examDate || "");
  const [hoursPerDay, setHoursPerDay] = useState(savedState.hoursPerDay || 3);
  const [level, setLevel] = useState(savedState.level || "beginner");
  const [personalizationContext, setPersonalizationContext] = useState(
    savedState.personalizationContext ||
      "Weak in Operating Systems and DBMS. Prefer PYQ-focused videos with examples.",
  );
  const [language, setLanguage] = useState(savedState.language || "English + Hindi if useful");
  const [loading, setLoading] = useState(false);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(savedState.provider || null);
  const [plan, setPlan] = useState<StudyPlan | null>(savedState.plan || null);
  const [youtubeRecs, setYoutubeRecs] = useState<YoutubeRecommendations | null>(
    savedState.youtubeRecs || null,
  );
  const [savedRuns, setSavedRuns] = useState<SavedPlannerRun[]>(() => loadPlannerHistory());

  useEffect(() => {
    savePlannerState({
      fileMeta: file ? { name: file.name, mime_type: file.mime_type } : null,
      goal,
      complexity,
      examDate,
      hoursPerDay,
      level,
      personalizationContext,
      language,
      provider,
      plan,
      youtubeRecs,
    });
  }, [
    file,
    goal,
    complexity,
    examDate,
    hoursPerDay,
    level,
    personalizationContext,
    language,
    provider,
    plan,
    youtubeRecs,
  ]);

  async function handleFile(nextFile: File | undefined) {
    if (!nextFile) return;
    const allowed = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
    if (!allowed.includes(nextFile.type)) {
      toast.error("Upload PDF, image, TXT, DOCX, or PPTX material.");
      return;
    }
    if (nextFile.size > 14 * 1024 * 1024) {
      toast.error("Keep the upload under 14 MB for this demo.");
      return;
    }
    const dataUrl = await readAsDataUrl(nextFile);
    setFile({
      name: nextFile.name,
      mime_type: nextFile.type,
      data: dataUrl.split(",")[1] || "",
    });
    setPlan(null);
    setYoutubeRecs(null);
    setProvider(null);
  }

  function clearForNextUpload() {
    setFile(null);
    setPlan(null);
    setYoutubeRecs(null);
    setProvider(null);
    toast.success("Ready for the next upload");
  }

  function restoreSavedRun(run: SavedPlannerRun) {
    setFile(run.fileMeta ? { ...run.fileMeta, data: "" } : null);
    setGoal(run.goal || "GATE Exam");
    setComplexity(run.complexity || "Moderate");
    setExamDate(run.examDate || "");
    setHoursPerDay(run.hoursPerDay || 3);
    setLevel(run.level || "beginner");
    setPersonalizationContext(run.personalizationContext || "");
    setLanguage(run.language || "English + Hindi if useful");
    setProvider(run.provider || "saved");
    setPlan(run.plan || null);
    setYoutubeRecs(run.youtubeRecs || null);
    toast.success("Saved result restored");
  }

  function saveCurrentRun(
    nextYoutubeRecs: YoutubeRecommendations | null = youtubeRecs,
    nextPlan: StudyPlan | null = plan,
  ) {
    const title = nextPlan?.title || file?.name || `${goal} recommendations`;
    const run: SavedPlannerRun = {
      id: createId(),
      title,
      createdAt: new Date().toISOString(),
      fileMeta: file ? { name: file.name, mime_type: file.mime_type } : null,
      goal,
      complexity,
      examDate,
      hoursPerDay,
      level,
      personalizationContext,
      language,
      provider,
      plan: nextPlan,
      youtubeRecs: nextYoutubeRecs,
    };
    const nextRuns = [run, ...savedRuns.filter((item) => item.title !== title)].slice(0, 8);
    setSavedRuns(nextRuns);
    savePlannerHistory(nextRuns);
  }

  async function generatePlan() {
    setLoading(true);
    try {
      const res = await api.generateStudyPlan({
        file,
        goal,
        complexity,
        exam_date: examDate,
        hours_per_day: hoursPerDay,
        current_level: level,
        weak_subjects: personalizationContext
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        personalization_context: personalizationContext,
        language_preference: language,
      });
      setProvider(res.provider || "ai");
      setPlan(res.plan);
      setYoutubeRecs(null);
      saveCurrentRun(null, res.plan);
      toast.success("Adaptive study plan generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate study plan");
    } finally {
      setLoading(false);
    }
  }

  async function generateYoutubeRecommendations() {
    const topics =
      plan?.priority_topics?.map((topic) => ({
        subject: topic.subject,
        topic: topic.topic,
        difficulty: topic.difficulty,
        concept_type: topic.concept_type,
        keywords: [topic.subject, topic.topic].filter(Boolean),
      })) || [];

    setYoutubeLoading(true);
    try {
      const res = await api.youtubeRecommendations({
        extracted_topics: topics,
        preferences: {
          exam_type: goal,
          language,
          teaching_style: complexity.includes("Deep") ? "deep concept" : "exam-oriented",
          study_time_minutes: hoursPerDay * 60,
          level,
          mode: goal.includes("Last") ? "revision" : complexity,
          prefer_short: goal.includes("Last") || hoursPerDay <= 1,
        },
        context: {
          weak_topics: personalizationContext
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          notes: personalizationContext,
        },
      });
      setYoutubeRecs(res);
      saveCurrentRun(res);
      toast.success("YouTube recommendations ranked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rank YouTube resources");
    } finally {
      setYoutubeLoading(false);
    }
  }

  return (
    <div className="min-h-dvh w-full space-y-6 px-5 py-5 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <RouteIcon className="h-5 w-5 text-secondary" />
            <h1 className="font-display text-3xl font-bold">AI Study Planner</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Upload notes, PYQs, syllabus, books, images, or PDFs. Pick a goal and the learning
            pipeline adapts for scoring, deep learning, revision, placements, or GATE.
          </p>
        </div>
        {provider && (
          <span className="rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
            Source: {provider}
          </span>
        )}
      </header>

      <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="glass gradient-border space-y-5 rounded-2xl p-5">
          <label className="grid min-h-48 cursor-pointer place-items-center rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center transition hover:bg-primary/10">
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,.docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary">
                <FileText className="h-7 w-7 text-primary-foreground" />
              </div>
              <div className="mt-4 text-sm font-semibold">
                {file ? file.name : "Upload study material"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {file
                  ? "Click here to replace it with the next image/PDF/docs"
                  : "PDF, notes image, TXT, DOCX, PPTX up to 14 MB"}
              </div>
            </div>
          </label>
          {file && (
            <button
              type="button"
              onClick={clearForNextUpload}
              className="w-full rounded-xl border border-border bg-background/40 px-4 py-2 text-sm font-bold text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
            >
              Clear and upload next material
            </button>
          )}

          {savedRuns.length > 0 && (
            <div className="rounded-2xl border border-border bg-background/30 p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Saved results
              </div>
              <div className="space-y-2">
                {savedRuns.slice(0, 4).map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => restoreSavedRun(run)}
                    className="w-full rounded-xl border border-border bg-card/40 px-3 py-2 text-left transition hover:border-primary/60 hover:bg-primary/10"
                  >
                    <div className="line-clamp-1 text-xs font-bold text-foreground">{run.title}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-semibold text-muted-foreground">
                      <span>{run.goal || "Study plan"}</span>
                      <span>{formatDate(run.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Preparation mode
            </div>
            <div className="flex flex-wrap gap-2">
              {examModes.map((item) => (
                <OptionButton key={item} active={goal === item} onClick={() => setGoal(item)}>
                  {item}
                </OptionButton>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Complexity
            </div>
            <div className="flex flex-wrap gap-2">
              {complexityLevels.map((item) => (
                <OptionButton key={item} active={complexity === item} onClick={() => setComplexity(item)}>
                  {item}
                </OptionButton>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Exam date" icon={CalendarDays}>
              <input
                type="date"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/70"
              />
            </Field>
            <Field label="Hours/day" icon={Clock}>
              <input
                type="number"
                min={1}
                max={14}
                value={hoursPerDay}
                onChange={(event) => setHoursPerDay(Number(event.target.value))}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/70"
              />
            </Field>
          </div>

          <Field label="Current preparation level" icon={Target}>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/70"
            >
              <option value="beginner">Beginner</option>
              <option value="basic">Basic concepts done</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced but needs testing</option>
            </select>
          </Field>

          <Field label="Anything that can improve your result" icon={BookOpen}>
            <textarea
              value={personalizationContext}
              onChange={(event) => setPersonalizationContext(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/70"
              placeholder="Weak topics, target marks, preferred teachers, language, college syllabus, PYQ focus, short videos, revision mode..."
            />
          </Field>

          <Field label="Language / teaching preference" icon={Youtube}>
            <input
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/70"
              placeholder="English, Hindi, bilingual, slow, one-shot..."
            />
          </Field>

          <button
            onClick={generatePlan}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate adaptive plan
          </button>
        </div>

        <PlanView
          plan={plan}
          goal={goal}
          complexity={complexity}
          youtubeRecs={youtubeRecs}
          youtubeLoading={youtubeLoading}
          onGenerateYoutube={generateYoutubeRecommendations}
        />
      </section>
    </div>
  );
}

function PlanView({
  plan,
  goal,
  complexity,
  youtubeRecs,
  youtubeLoading,
  onGenerateYoutube,
}: {
  plan: StudyPlan | null;
  goal: string;
  complexity: string;
  youtubeRecs: YoutubeRecommendations | null;
  youtubeLoading: boolean;
  onGenerateYoutube: () => void;
}) {
  const [activePage, setActivePage] = useState("overview");

  if (!plan) {
    return (
      <div className="glass gradient-border grid min-h-[680px] place-items-center rounded-2xl p-6 text-center">
        <div className="max-w-xl">
          <Sparkles className="mx-auto h-10 w-10 text-secondary" />
          <h2 className="mt-4 font-display text-2xl font-bold">Adaptive pipeline ready</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Current setup: {goal} with {complexity} complexity. Upload material or generate from
            your settings to get topic priorities, plan, revision notes, quizzes, and recommended
            YouTube search paths.
          </p>
        </div>
      </div>
    );
  }

  const pages = [
    { id: "overview", label: "Overview" },
    { id: "learn", label: "Learn" },
    { id: "schedule", label: "Schedule" },
    { id: "practice", label: "Practice" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="space-y-5">
      <section className="glass gradient-border rounded-2xl p-5">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-secondary">
          Adaptive strategy
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold">{plan.title || "Personalized plan"}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.mode_strategy}</p>
        {plan.extracted_overview && (
          <p className="mt-3 rounded-xl border border-border bg-background/35 p-3 text-sm leading-relaxed text-muted-foreground">
            {plan.extracted_overview}
          </p>
        )}
      </section>

      <div className="glass gradient-border rounded-2xl p-2">
        <div className="grid gap-2 sm:grid-cols-5">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setActivePage(page.id)}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                activePage === page.id
                  ? "bg-gradient-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {page.label}
            </button>
          ))}
        </div>
      </div>

      {activePage === "overview" && (
        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Priority Topics">
            <PriorityTopics topics={plan.priority_topics || []} />
          </Panel>
          <Panel title="Quick Outputs">
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-border bg-background/35 p-3">
                <div className="font-bold text-secondary">30-second summary</div>
                <p className="mt-2 text-muted-foreground">{plan.generated_outputs?.summary_30_sec}</p>
              </div>
              <List title="5-minute revision" items={plan.generated_outputs?.revision_5_min || []} />
            </div>
          </Panel>
        </section>
      )}

      {activePage === "learn" && (
        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Smart YouTube Paths">
            <button
              type="button"
              onClick={onGenerateYoutube}
              disabled={youtubeLoading}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition disabled:opacity-50"
            >
              {youtubeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
              Rank best YouTube resources
            </button>
            <YouTubePaths items={plan.youtube_playlists || []} />
          </Panel>
          <Panel title="Deep Learning Notes">
            <List title="20-minute deep explanation flow" items={plan.generated_outputs?.deep_learning_20_min || []} />
          </Panel>
          {youtubeRecs && (
            <div className="lg:col-span-2">
              <YoutubeRecommendationResults recommendations={youtubeRecs} />
            </div>
          )}
        </section>
      )}

      {activePage === "schedule" && (
        <div className="space-y-5">
          <Panel title="Daily Study Plan">
            <DailyPlan days={plan.daily_plan || []} />
          </Panel>
          <section className="grid gap-5 lg:grid-cols-2">
            <ListPanel title="Revision Schedule" items={plan.revision_schedule || []} />
            <ListPanel title="Mock Test Schedule" items={plan.mock_test_schedule || []} />
          </section>
        </div>
      )}

      {activePage === "practice" && (
        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Practice Questions">
            <PracticeQuestions quizzes={plan.generated_outputs?.quizzes || []} />
          </Panel>
          <Panel title="Flashcards + Formula Sheet">
            <Flashcards cards={plan.generated_outputs?.flashcards || []} />
            <div className="mt-5">
              <List title="Formula sheet" items={plan.generated_outputs?.formula_sheet || []} />
            </div>
          </Panel>
        </section>
      )}

      {activePage === "system" && (
        <section className="grid gap-5 lg:grid-cols-2">
          <ListPanel title="Adaptive Rules" items={plan.adaptive_rules || []} />
          <ListPanel title="Production Architecture Next Steps" items={plan.architecture_next_steps || []} />
        </section>
      )}
    </div>
  );
}

function PriorityTopics({ topics }: { topics: NonNullable<StudyPlan["priority_topics"]> }) {
  return (
    <div className="space-y-3">
      {topics.map((topic, index) => (
        <div key={`${topic.topic}-${index}`} className="rounded-xl border border-border bg-background/35 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold">{topic.topic}</div>
              <div className="text-xs text-muted-foreground">{topic.subject}</div>
            </div>
            <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-bold text-primary">
              {topic.priority_score ?? 0}
            </span>
          </div>
          <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{topic.reason}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase">
            <span className="rounded bg-secondary/15 px-2 py-1 text-secondary">{topic.difficulty}</span>
            <span className="rounded bg-success/15 px-2 py-1 text-success">{topic.concept_type}</span>
            <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
              {topic.estimated_hours ?? 1}h
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function YouTubePaths({ items }: { items: NonNullable<StudyPlan["youtube_playlists"]> }) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="rounded-xl border border-border bg-background/35 p-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Youtube className="h-4 w-4 text-secondary" />
            {item.title}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{item.purpose}</div>
                <div className="mt-2 rounded-lg bg-card/50 px-3 py-2 font-mono text-xs text-secondary">
            {item.search_query}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{item.ranking_reason}</div>
        </div>
      ))}
    </div>
  );
}

function YoutubeRecommendationResults({
  recommendations,
}: {
  recommendations: YoutubeRecommendations;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <Panel title="Ranked Videos">
        <div className="space-y-3">
          {(recommendations.ranked_videos || []).slice(0, 6).map((video) => (
            <YoutubeCard key={video.id || video.title} item={video} />
          ))}
        </div>
      </Panel>
      <Panel title="Ranked Playlists">
        <div className="space-y-3">
          {(recommendations.ranked_playlists || []).slice(0, 5).map((playlist) => (
            <YoutubeCard key={playlist.id || playlist.title} item={playlist} />
          ))}
        </div>
      </Panel>
      <Panel title="Learning Path">
        <div className="space-y-3">
          {(recommendations.learning_path || []).map((step) => (
            <a
              key={`${step.step}-${step.topic}`}
              href={step.youtube_query}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-border bg-background/35 p-3 transition hover:border-primary/60 hover:bg-primary/10"
            >
              <div className="text-sm font-bold">
                Step {step.step}: {step.topic}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{step.subject}</div>
              <div className="mt-2 text-xs text-secondary">{step.target}</div>
            </a>
          ))}
        </div>
      </Panel>
      <ListPanel
        title="Microservice Strategy"
        items={[
          recommendations.strategy || "Free YouTube search + educational scoring.",
          "Next: plug yt-dlp transcripts, youtube-transcript-api, embeddings, FAISS, Redis cache.",
          "Ranking avoids views-only sorting and uses topic, exam, transcript, PYQ, style, and time-fit signals.",
        ]}
      />
    </section>
  );
}

function YoutubeCard({
  item,
}: {
  item: {
    title?: string;
    channel?: string;
    url?: string;
    score?: number;
    confidence?: number;
    reason?: string;
    ranking_basis?: string;
    score_breakdown?: Record<string, number>;
    estimated_study_time?: string;
    difficulty?: string;
    teaching_style?: string;
    language?: string;
  };
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-border bg-background/35 p-3 transition hover:border-primary/60 hover:bg-primary/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-bold">{item.title}</div>
          <div className="mt-2 inline-flex max-w-full items-center rounded-full border border-secondary/40 bg-secondary/10 px-2.5 py-1 text-xs font-bold text-secondary shadow-sm shadow-secondary/10">
            <Youtube className="mr-1.5 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{item.channel || "Educational channel"}</span>
          </div>
        </div>
        <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-bold text-primary">
          {item.score ?? 0}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase">
        <span className="rounded bg-secondary/15 px-2 py-1 text-secondary">
          {item.estimated_study_time || "time fit"}
        </span>
        <span className="rounded bg-success/15 px-2 py-1 text-success">
          {item.teaching_style || "exam-oriented"}
        </span>
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
          {item.difficulty || "mixed"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
      {item.score_breakdown && (
        <div className="mt-3 rounded-lg border border-border bg-card/30 p-2">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">
            Why this rank
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(item.score_breakdown).map(([key, value]) => (
                <span
                  key={key}
                  className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground"
                >
                  {formatScoreLabel(key)}: {value}
                </span>
              ))}
          </div>
        </div>
      )}
    </a>
  );
}

function DailyPlan({ days }: { days: NonNullable<StudyPlan["daily_plan"]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {days.map((day, index) => (
        <div key={`${day.day}-${index}`} className="rounded-xl border border-border bg-background/35 p-3">
          <div className="text-sm font-bold">{day.day}</div>
          <div className="mt-1 text-xs text-secondary">{day.focus}</div>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {(day.tasks || []).map((task) => (
              <li key={task}>- {task}</li>
            ))}
          </ul>
          {day.output && <div className="mt-2 text-xs font-semibold text-success">Output: {day.output}</div>}
        </div>
      ))}
    </div>
  );
}

function PracticeQuestions({ quizzes }: { quizzes: NonNullable<StudyPlan["generated_outputs"]>["quizzes"] }) {
  return (
    <div className="space-y-3">
      {(quizzes || []).slice(0, 8).map((quiz, index) => (
        <div key={`${quiz.question}-${index}`} className="rounded-xl border border-border bg-background/35 p-3">
          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase">
            <span className="rounded bg-primary/15 px-2 py-1 text-primary">{quiz.type || "Question"}</span>
            <span className="rounded bg-secondary/15 px-2 py-1 text-secondary">{quiz.difficulty || "medium"}</span>
          </div>
          <div className="mt-2 text-sm font-semibold">{quiz.question}</div>
          <div className="mt-2 text-xs text-success">Answer: {quiz.answer}</div>
        </div>
      ))}
    </div>
  );
}

function Flashcards({ cards }: { cards: NonNullable<StudyPlan["generated_outputs"]>["flashcards"] }) {
  return (
    <div className="space-y-3">
      {(cards || []).map((card, index) => (
        <div key={`${card.front}-${index}`} className="rounded-xl border border-border bg-background/35 p-3">
          <div className="text-sm font-bold">{card.front}</div>
          <div className="mt-2 text-sm text-muted-foreground">{card.back}</div>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {children}
    </label>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass gradient-border rounded-2xl p-5">
      <h3 className="mb-4 font-display text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <Panel title={title}>
      <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="rounded-xl border border-border bg-background/35 p-3">
            {item}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-sm font-bold">{title}</div>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-primary bg-primary/20 text-primary"
          : "border-border bg-background/30 text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadPlannerState(): PersistedPlannerState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PLANNER_STATE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function savePlannerState(state: PersistedPlannerState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLANNER_STATE_KEY, JSON.stringify(state));
  } catch {
    // Large uploaded files are intentionally not persisted; ignore browser storage limits.
  }
}

function loadPlannerHistory(): SavedPlannerRun[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLANNER_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePlannerHistory(runs: SavedPlannerRun[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLANNER_HISTORY_KEY, JSON.stringify(runs));
  } catch {
    toast.error("Saved results storage is full. Remove older browser data and try again.");
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function formatScoreLabel(key: string) {
  return key.replaceAll("_", " ");
}

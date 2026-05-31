import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Circle,
  Download,
  Eraser,
  Highlighter,
  RotateCcw,
  ListRestart,
  Minus,
  MousePointer2,
  PenLine,
  RectangleHorizontal,
  RotateCw,
  Timer,
  Type,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { type AnswerRecord, type Difficulty } from "@/lib/ml";

export const Route = createFileRoute("/_app/quizzes/$id")({
  component: QuizWorkspace,
});

type Tool = "pen" | "eraser" | "text" | "line" | "rect" | "circle" | "select";
type Point = { x: number; y: number };
type ScratchElement =
  | { id: string; kind: "stroke"; color: string; size: number; points: Point[] }
  | { id: string; kind: "line"; color: string; size: number; start: Point; end: Point }
  | { id: string; kind: "rect"; color: string; size: number; start: Point; end: Point }
  | { id: string; kind: "circle"; color: string; size: number; start: Point; end: Point }
  | { id: string; kind: "text"; color: string; size: number; at: Point; text: string };
type ScratchDoc = { version: "scratch-v2"; elements: ScratchElement[] };

type Question = {
  id: string;
  question_text: string;
  question_type: "mcq" | "msq" | "nat";
  options: string[];
  image_url?: string | null;
  image_alt?: string | null;
  correct_answer: unknown;
  explanation?: string | null;
  concept_notes?: string | null;
  common_mistakes?: string[];
  subject?: string;
  topic: string | null;
  difficulty: Difficulty;
  marks: number;
  order_index: number;
};

type Quiz = {
  id: string;
  title: string;
  description?: string;
  time_limit_seconds?: number;
  negative_marking?: number;
  quiz_type?: string;
};

type QuestionState = {
  answer?: number | number[] | string | null;
  marked?: boolean;
  submitted?: boolean;
  correct?: boolean;
  marksEarned?: number;
  timeSeconds?: number;
  canvasJSON?: ScratchDoc | null;
  aiExplanation?: string;
  aiProvider?: string;
};

const PAPER_WIDTH = 1500;
const PAPER_HEIGHT = 1100;
const sessionKey = (quizId: string) => `intellilearn_quiz_workspace_${quizId}`;
const swatches = ["#8b5cf6", "#22c55e", "#06b6d4", "#f59e0b", "#ef4444", "#111827"];

function QuizWorkspace() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const elementsRef = useRef<ScratchElement[]>([]);
  const activeRef = useRef<ScratchElement | null>(null);
  const undoStack = useRef<ScratchElement[][]>([]);
  const redoStack = useRef<ScratchElement[][]>([]);
  const toolRef = useRef<Tool>("pen");
  const colorRef = useRef("#8b5cf6");
  const brushSizeRef = useRef(4);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [states, setStates] = useState<Record<string, QuestionState>>({});
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#8b5cf6");
  const [brushSize, setBrushSize] = useState(4);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [questionCollapsed, setQuestionCollapsed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [quizStart] = useState(Date.now());
  const [questionStart, setQuestionStart] = useState(Date.now());
  const [scratchTick, setScratchTick] = useState(0);
  const generatedReviewKey = useRef("");

  const { data: quiz } = useQuery<Quiz>({
    queryKey: ["quiz", id],
    queryFn: () => api.quiz(id),
  });

  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["quiz-questions", id],
    queryFn: async () => (await api.questions(id, { mode: "adaptive" })) as Question[],
  });

  const { data: dbProgress } = useQuery({
    queryKey: ["quiz-progress", id],
    queryFn: () => api.quizProgress(id),
  });

  const { data: bookmarks = [] } = useQuery({
    queryKey: ["question-bookmarks", id],
    queryFn: () => api.questionBookmarks(id),
  });

  const bookmarkIds = useMemo(
    () => new Set((bookmarks as { question_id: string }[]).map((bookmark) => String(bookmark.question_id))),
    [bookmarks],
  );

  const visibleQuestions = useMemo(
    () => {
      const subjectFiltered = selectedSubject
        ? questions.filter((question) => (question.subject || question.topic || "General") === selectedSubject)
        : questions;
      return bookmarkedOnly
        ? subjectFiltered.filter((question) => bookmarkIds.has(question.id))
        : subjectFiltered;
    },
    [bookmarkIds, bookmarkedOnly, questions, selectedSubject],
  );
  const current = visibleQuestions[currentIdx];
  const currentState = current ? (states[current.id] ?? {}) : {};

  useEffect(() => {
    toolRef.current = tool;
    colorRef.current = color;
    brushSizeRef.current = brushSize;
  }, [tool, color, brushSize]);

  const saveWorkspace = useMutation({
    mutationFn: ({ questionId, canvas_json }: { questionId: string; canvas_json: ScratchDoc }) =>
      api.saveQuestionWorkspace(questionId, {
        title: `${quiz?.title ?? "Quiz"} Q${currentIdx + 1}`,
        canvas_json,
      }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Workspace save failed"),
  });

  const saveAttempt = useMutation({
    mutationFn: async () => {
      const finalStates = submitAllUnsubmitted(updateCurrentCanvas());
      const history = buildHistory(questions, finalStates);
      const score = history.reduce((sum, item) => sum + item.marks_earned, 0);
      const maxScore = history.reduce((sum, item) => sum + item.marks_possible, 0);
      const accuracy =
        history.length > 0
          ? (history.filter((item) => item.correct).length / history.length) * 100
          : 0;
      const topic_breakdown: Record<string, { correct: number; total: number }> = {};

      for (const item of history) {
        const topic = item.topic ?? "general";
        const next = topic_breakdown[topic] ?? { correct: 0, total: 0 };
        next.total += 1;
        if (item.correct) next.correct += 1;
        topic_breakdown[topic] = next;
      }

      await api.saveAttempt({
        quiz_id: id,
        answers: history,
        score,
        max_score: maxScore,
        accuracy: Math.round(accuracy * 100) / 100,
        time_taken_seconds: Math.round((Date.now() - quizStart) / 1000),
        per_question: history,
        topic_breakdown,
        difficulty_used: current?.difficulty,
      });

      setStates(finalStates);
      localStorage.setItem(sessionKey(id), JSON.stringify({ states: finalStates, currentIdx, selectedSubject }));
      await api.saveQuizProgress(id, buildProgressPayload(finalStates, true));
      return { score, maxScore, accuracy, finalStates };
    },
    onSuccess: (result) => {
      toast.success(`Test saved: ${result.score}/${result.maxScore}`);
      qc.invalidateQueries({ queryKey: ["attempts"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setFinished(true);
      void generateReviewExplanations(result.finalStates);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save attempt"),
  });

  const saveProgress = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.saveQuizProgress(id, payload),
  });

  const stats = useMemo(() => {
    let answered = 0;
    let marked = 0;
    let submitted = 0;
    for (const question of visibleQuestions) {
      const state = states[question.id];
      if (!state) continue;
      if (hasAnswer(state.answer)) answered += 1;
      if (state.marked) marked += 1;
      if (state.submitted) submitted += 1;
    }
    return { answered, marked, submitted, left: Math.max(0, visibleQuestions.length - answered) };
  }, [visibleQuestions, states]);

  const review = useMemo(() => {
    const rows = questions.map((question) => ({
      question,
      state: states[question.id] ?? {},
    }));
    const score = rows.reduce((sum, row) => sum + (row.state.marksEarned ?? 0), 0);
    const maxScore = questions.reduce((sum, question) => sum + Number(question.marks), 0);
    const correct = rows.filter((row) => row.state.correct).length;
    return { rows, score, maxScore, correct };
  }, [questions, states]);
  const subjectGroups = useMemo(() => {
    const groups = new Map<string, { label: string; count: number; firstIndex: number }>();
    questions.forEach((question, index) => {
      const label = question.subject || question.topic || "General";
      const old = groups.get(label);
      groups.set(label, {
        label,
        count: (old?.count ?? 0) + 1,
        firstIndex: old?.firstIndex ?? index,
      });
    });
    return [...groups.values()];
  }, [questions]);

  useEffect(() => {
    if (currentIdx >= visibleQuestions.length) setCurrentIdx(0);
  }, [currentIdx, visibleQuestions.length]);

  useEffect(() => {
    const raw = localStorage.getItem(sessionKey(id));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        states?: Record<string, QuestionState>;
        currentIdx?: number;
        selectedSubject?: string | null;
      };
      setStates(parsed.states ?? {});
      setCurrentIdx(parsed.currentIdx ?? 0);
      setSelectedSubject(parsed.selectedSubject ?? null);
    } catch {
      localStorage.removeItem(sessionKey(id));
    }
  }, [id]);

  useEffect(() => {
    if (!dbProgress?.per_question) return;
    setStates(dbProgress.per_question ?? {});
    setCurrentIdx(Number(dbProgress.current_index ?? 0));
    setSelectedSubject(dbProgress.selected_subject ?? null);
    setFinished(Boolean(dbProgress.completed));
  }, [dbProgress]);

  useEffect(() => {
    if (!finished || questions.length === 0) return;
    const missingReview = questions.some((question) => {
      const state = states[question.id];
      return state?.submitted && !state.aiExplanation;
    });
    if (!missingReview) return;

    const key = `${id}:${questions.length}:${Object.keys(states).length}`;
    if (generatedReviewKey.current === key) return;
    generatedReviewKey.current = key;
    void generateReviewExplanations(states);
  }, [finished, id, questions, states]);

  useEffect(() => {
    if (!current) return;
    const saved = parseScratchDoc(states[current.id]?.canvasJSON);
    elementsRef.current = saved.elements;
    activeRef.current = null;
    undoStack.current = [cloneElements(saved.elements)];
    redoStack.current = [];
    setQuestionStart(Date.now());
    setScratchTick((value) => value + 1);
  }, [current?.id]);

  useEffect(() => {
    renderScratch(canvasRef.current, elementsRef.current, activeRef.current);
  }, [scratchTick]);

  useEffect(() => {
    const timer = window.setInterval(() => persistSession(), 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, currentIdx, states]);

  function scratchDoc(): ScratchDoc {
    return { version: "scratch-v2", elements: cloneElements(elementsRef.current) };
  }

  function updateCurrentCanvas(base = states) {
    if (!current) return base;
    const canvasJSON = scratchDoc();
    const next = { ...base, [current.id]: { ...base[current.id], canvasJSON } };
    setStates(next);
    saveWorkspace.mutate({ questionId: current.id, canvas_json: canvasJSON });
    return next;
  }

  function persistSession() {
    const next = updateCurrentCanvas();
    localStorage.setItem(sessionKey(id), JSON.stringify({ states: next, currentIdx, selectedSubject }));
    saveProgress.mutate(buildProgressPayload(next));
    setSaveState("saved");
  }

  function pushUndo() {
    undoStack.current.push(cloneElements(elementsRef.current));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }

  function redraw() {
    renderScratch(canvasRef.current, elementsRef.current, activeRef.current);
  }

  function pointerPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * PAPER_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * PAPER_HEIGHT,
    };
  }

  function onScratchDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "select") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPoint(event);

    if (tool === "text") {
      const text = window.prompt("Enter text for scratchbook");
      if (!text?.trim()) return;
      elementsRef.current = [
        ...elementsRef.current,
        {
          id: crypto.randomUUID(),
          kind: "text",
          color,
          size: Math.max(14, brushSize * 4),
          at: point,
          text: text.trim(),
        },
      ];
      pushUndo();
      setSaveState("saving");
      redraw();
      return;
    }

    if (tool === "eraser") {
      elementsRef.current = eraseElement(elementsRef.current, point, brushSize);
      pushUndo();
      setSaveState("saving");
      redraw();
      activeRef.current = { id: "erase", kind: "stroke", color, size: brushSize, points: [point] };
      return;
    }

    if (tool === "pen") {
      activeRef.current = {
        id: crypto.randomUUID(),
        kind: "stroke",
        color,
        size: brushSize,
        points: [point],
      };
      redraw();
      return;
    }

    const start = point;
    const base = { id: crypto.randomUUID(), color, size: brushSize, start, end: start };
    if (tool === "line") activeRef.current = { ...base, kind: "line" };
    if (tool === "rect") activeRef.current = { ...base, kind: "rect" };
    if (tool === "circle") activeRef.current = { ...base, kind: "circle" };
    redraw();
  }

  function onScratchMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active) return;
    event.preventDefault();
    const point = pointerPoint(event);

    if (tool === "eraser") {
      elementsRef.current = eraseElement(elementsRef.current, point, brushSize);
      redraw();
      return;
    }

    if (active.kind === "stroke") {
      activeRef.current = { ...active, points: [...active.points, point] };
    } else if (active.kind !== "text") {
      activeRef.current = { ...active, end: point };
    }
    redraw();
  }

  function onScratchUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!active) return;
    event.preventDefault();

    if (tool !== "eraser" && active.kind !== "text") {
      elementsRef.current = [...elementsRef.current, active];
    }
    activeRef.current = null;
    pushUndo();
    setSaveState("saving");
    redraw();
  }

  function undo() {
    if (undoStack.current.length <= 1) return;
    const currentSnapshot = undoStack.current.pop();
    if (currentSnapshot) redoStack.current.push(currentSnapshot);
    elementsRef.current = cloneElements(undoStack.current.at(-1) ?? []);
    setSaveState("saving");
    redraw();
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    elementsRef.current = cloneElements(next);
    undoStack.current.push(cloneElements(next));
    setSaveState("saving");
    redraw();
  }

  function clearCanvas() {
    elementsRef.current = [];
    activeRef.current = null;
    pushUndo();
    setSaveState("saving");
    setStates((prev) => {
      if (!current) return prev;
      const next = { ...prev, [current.id]: { ...(prev[current.id] ?? {}), canvasJSON: { version: "scratch-v2", elements: [] } } };
      localStorage.setItem(sessionKey(id), JSON.stringify({ states: next, currentIdx, selectedSubject }));
      saveProgress.mutate(buildProgressPayload(next));
      return next;
    });
    redraw();
  }

  function selectAnswer(option: number) {
    if (!current) return;
    setStates((prev) => {
      const old = prev[current.id] ?? {};
      let answer: QuestionState["answer"] = option;
      if (current.question_type === "msq") {
        const existing = Array.isArray(old.answer) ? old.answer : [];
        answer = existing.includes(option)
          ? existing.filter((item) => item !== option)
          : [...existing, option];
      } else if (old.answer === option) {
        answer = null;
      }
      return { ...prev, [current.id]: { ...old, answer } };
    });
    setSaveState("saving");
  }

  function setNatAnswer(answer: string) {
    if (!current) return;
    setStates((prev) => ({ ...prev, [current.id]: { ...(prev[current.id] ?? {}), answer } }));
    setSaveState("saving");
  }

  function markForReview() {
    if (!current) return;
    setStates((prev) => ({
      ...prev,
      [current.id]: { ...(prev[current.id] ?? {}), marked: !(prev[current.id]?.marked ?? false) },
    }));
    setSaveState("saving");
  }

  async function toggleBookmark() {
    if (!current) return;
    try {
      if (bookmarkIds.has(current.id)) {
        await api.unbookmarkQuestion(current.id);
        toast.success("Bookmark removed");
      } else {
        await api.bookmarkQuestion(current.id);
        toast.success("Question bookmarked");
      }
      qc.invalidateQueries({ queryKey: ["question-bookmarks", id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bookmark update failed");
    }
  }

  function clearAnswer() {
    if (!current) return;
    setStates((prev) => {
      const next = { ...prev, [current.id]: { ...(prev[current.id] ?? {}), answer: null } };
      localStorage.setItem(sessionKey(id), JSON.stringify({ states: next, currentIdx, selectedSubject }));
      saveProgress.mutate(buildProgressPayload(next));
      return next;
    });
    setSaveState("saving");
  }

  function resetPracticeSession() {
    elementsRef.current = [];
    activeRef.current = null;
    undoStack.current = [[]];
    redoStack.current = [];
    const next: Record<string, QuestionState> = {};
    setStates(next);
    setCurrentIdx(0);
    setFinished(false);
    generatedReviewKey.current = "";
    localStorage.setItem(sessionKey(id), JSON.stringify({ states: next, currentIdx: 0, selectedSubject }));
    saveProgress.mutate({
      answers: {},
      marked: [],
      per_question: {},
      current_index: 0,
      selected_subject: selectedSubject,
      completed: false,
    });
    setSaveState("saving");
    redraw();
    toast.success("Question set reset");
  }

  function clearAllMarked() {
    setStates((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).map(([questionId, state]) => [questionId, { ...state, marked: false }]),
      ) as Record<string, QuestionState>;
      localStorage.setItem(sessionKey(id), JSON.stringify({ states: next, currentIdx, selectedSubject }));
      saveProgress.mutate(buildProgressPayload(next));
      api.clearQuizMarked(id).catch(() => undefined);
      return next;
    });
    setSaveState("saving");
    toast.success("Marked questions cleared");
  }

  function submitCurrent() {
    if (!current || !hasAnswer(currentState.answer)) return;
    const result = evaluate(current, currentState.answer, Number(quiz?.negative_marking ?? 0));
    const answer = currentState.answer;
    setStates((prev) => {
      const next = {
        ...prev,
        [current.id]: {
          ...(prev[current.id] ?? {}),
          submitted: true,
          correct: result.correct,
          marksEarned: result.marks,
          timeSeconds: Math.round((Date.now() - questionStart) / 1000),
        },
      };
      localStorage.setItem(sessionKey(id), JSON.stringify({ states: next, currentIdx, selectedSubject }));
      saveProgress.mutate(buildProgressPayload(next));
      return next;
    });
    void generateAiExplanation(current, answer);
    setSaveState("saving");
  }

  async function generateAiExplanation(question: Question, answer: QuestionState["answer"]) {
    try {
      const res = await api.explainQuestion({ question_id: question.id, answer });
      setStates((prev) => {
        const next = {
          ...prev,
          [question.id]: {
            ...(prev[question.id] ?? {}),
            aiExplanation: res.content,
            aiProvider: res.provider,
          },
        };
        localStorage.setItem(sessionKey(id), JSON.stringify({ states: next, currentIdx, selectedSubject }));
        saveProgress.mutate(buildProgressPayload(next));
        return next;
      });
    } catch {
      // Static explanations remain visible if AI is unavailable.
    }
  }

  async function generateReviewExplanations(baseStates: Record<string, QuestionState>) {
    const missing = questions.filter((question) => {
      const state = baseStates[question.id];
      return state?.submitted && !state.aiExplanation;
    });
    for (const question of missing) {
      await generateAiExplanation(question, baseStates[question.id]?.answer);
    }
  }

  function goTo(index: number) {
    if (index < 0 || index >= visibleQuestions.length) return;
    updateCurrentCanvas();
    setCurrentIdx(index);
  }

  function submitAllUnsubmitted(base: Record<string, QuestionState>) {
    const next = { ...base };
    for (const question of questions) {
      const old = next[question.id] ?? {};
      if (!hasAnswer(old.answer) || old.submitted) continue;
      const result = evaluate(question, old.answer, Number(quiz?.negative_marking ?? 0));
      next[question.id] = {
        ...old,
        submitted: true,
        correct: result.correct,
        marksEarned: result.marks,
        timeSeconds: old.timeSeconds ?? 0,
      };
    }
    return next;
  }

  function finishQuiz() {
    if (!questions.every((question) => hasAnswer(states[question.id]?.answer))) {
      toast.info("Answer all questions first, then finish the test to view solutions.");
      return;
    }
    persistSession();
    saveAttempt.mutate();
  }

  function buildProgressPayload(nextStates: Record<string, QuestionState>, completed = finished) {
    const answers = Object.fromEntries(
      Object.entries(nextStates).map(([questionId, state]) => [questionId, state.answer ?? null]),
    );
    const marked = Object.entries(nextStates)
      .filter(([, state]) => state.marked)
      .map(([questionId]) => questionId);
    return {
      answers,
      marked,
      per_question: nextStates,
      current_index: currentIdx,
      selected_subject: selectedSubject,
      completed,
    };
  }

  async function exportPdf(scope: "current" | "attempted" | "all" = "attempted", saveToDashboard = false) {
    try {
      const next = updateCurrentCanvas();
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      let added = false;
      const rows = questions
        .map((question, index) => ({ question, index, state: next[question.id] ?? {} }))
        .filter(({ index, state }) => {
          if (scope === "current") return question.id === current?.id;
          if (scope === "attempted") return hasAnswer(state.answer) || parseScratchDoc(state.canvasJSON).elements.length > 0;
          return true;
        });

      if (rows.length === 0) {
        toast.info("No attempted questions to export yet");
        return;
      }

      rows.forEach(({ question, index, state }) => {
        if (added) pdf.addPage();
        added = true;
        addReviewPdfPage(pdf, quiz?.title ?? "Quiz", question, state, index, questions.length);
      });

      const fileName = `${safeFilename(quiz?.title ?? "quiz")}-${scope}-review.pdf`;
      if (saveToDashboard) {
        await api.savePdf({
          quiz_id: id,
          title: fileName,
          scope,
          question_ids: rows.map(({ question }) => question.id),
          pdf_data: pdf.output("datauristring"),
        });
        qc.invalidateQueries({ queryKey: ["saved-pdfs"] });
        toast.success("PDF saved to dashboard");
      } else {
        pdf.save(fileName);
        toast.success("PDF downloaded");
      }
      setExportOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF export failed");
    }
  }

  if (!quiz || questions.length === 0) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground">Loading quiz...</div>;
  }

  if (!current) {
    return (
      <div className="grid h-dvh place-items-center bg-background/40 px-4 text-center">
        <div className="max-w-md rounded-2xl border border-border bg-card/60 p-6">
          <Bookmark className="mx-auto h-8 w-8 text-secondary" />
          <h2 className="mt-3 font-display text-xl font-bold">No bookmarked questions yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bookmark questions from this set, then use the bookmarked-only filter to revise them.
          </p>
          <button
            onClick={() => setBookmarkedOnly(false)}
            className="mt-4 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Show all questions
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-dvh bg-background px-3 py-4 sm:px-4 sm:py-6 sm:pl-16">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/70 p-5">
            <div>
              <div className="text-sm text-muted-foreground">Test review</div>
              <h1 className="font-display text-2xl font-bold">{quiz.title}</h1>
            </div>
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold text-secondary">
                {review.score}/{review.maxScore}
              </div>
              <div className="text-xs text-muted-foreground">
                {review.correct}/{questions.length} correct
              </div>
            </div>
            <IconButton onClick={() => exportPdf("all")} icon={Download} label="Download review PDF" />
            <IconButton onClick={() => exportPdf("all", true)} icon={Check} label="Save PDF" />
            <IconButton onClick={resetPracticeSession} icon={RotateCcw} label="Retake test" />
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-primary/50"
            >
              Dashboard
            </button>
          </div>

          <div className="space-y-3">
            {review.rows.map(({ question, state }, index) => (
              <div key={question.id} className="rounded-2xl border border-border bg-card/55 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-md bg-secondary/15 px-2 py-1 text-xs font-bold uppercase text-secondary">
                    Q{index + 1} {question.question_type}
                  </span>
                  <span className={state.correct ? "text-success" : "text-destructive"}>
                    {state.correct ? "Correct" : "Review"}
                  </span>
                  <span className="ml-auto text-sm text-muted-foreground">
                    Marks: {state.marksEarned ?? 0}/{question.marks}
                  </span>
                </div>
                <div className="rounded-xl bg-background/35 p-3 text-sm font-semibold leading-relaxed">
                  {question.question_text}
                </div>
                {question.image_url && (
                  <img
                    src={question.image_url}
                    alt={question.image_alt || "Question diagram"}
                    className="mt-2 max-h-48 w-full rounded-xl border border-border bg-white object-contain p-2"
                  />
                )}
                <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                  {question.question_type === "nat" ? (
                    <>
                      <ReviewLine label="Your answer" value={answerText(question, state.answer)} />
                      <ReviewLine label="Correct answer" value={answerText(question, question.correct_answer)} />
                    </>
                  ) : (
                    question.options.map((option, optionIndex) => (
                      <div
                        key={option}
                        className={`rounded-lg border px-3 py-1.5 text-xs ${
                          isCorrectOption(question, optionIndex)
                            ? "border-success/60 bg-success/10"
                            : isOptionSelected(state.answer, optionIndex)
                              ? "border-destructive/60 bg-destructive/10"
                              : "border-border bg-background/30"
                        }`}
                      >
                        <span className="mr-2 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                        {option}
                        {isOptionSelected(state.answer, optionIndex) && " - your answer"}
                        {isCorrectOption(question, optionIndex) && " - correct"}
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 rounded-xl border border-secondary/25 bg-background/30 p-4 text-sm text-muted-foreground">
                  <div className="font-semibold text-foreground">AI response</div>
                  <div className="mt-2 whitespace-pre-wrap leading-relaxed">
                    {state.aiExplanation ||
                      question.explanation ||
                      question.concept_notes ||
                      "Generating AI response, or explanation is not available yet."}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const allQuestionsAnswered = questions.every((question) => hasAnswer(states[question.id]?.answer));
  const progress = (stats.answered / visibleQuestions.length) * 100;

  return (
    <div className="mx-auto flex h-dvh max-w-none flex-col overflow-hidden border-border bg-background/40 shadow-elevated lg:rounded-none lg:border-0">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card/70 py-3 pl-14 pr-3 sm:pl-16 sm:pr-4">
        <div className="min-w-0 truncate font-display text-lg font-bold">{quiz.title}</div>
        <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          {quiz.quiz_type ?? "practice"}
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${saveState === "saving" ? "animate-pulse bg-secondary" : "bg-muted-foreground"}`} />
            {saveState === "saving" ? "Saving..." : "All saved"}
          </div>
          <ElapsedTimer start={quizStart} limit={quiz.time_limit_seconds} onTimeUp={finishQuiz} />
          <IconButton onClick={clearCanvas} icon={ListRestart} label="Clear canvas" />
          <IconButton onClick={clearAllMarked} icon={Highlighter} label="Clear marked" />
          <IconButton onClick={resetPracticeSession} icon={RotateCcw} label="Reset answers" />
          <IconButton onClick={() => setBookmarkedOnly((value) => !value)} icon={Bookmark} label={bookmarkedOnly ? "All questions" : "Bookmarks"} />
          <IconButton onClick={() => setExportOpen(true)} icon={Download} label="Export" />
        </div>
      </header>

      <div className="h-1 bg-muted">
        <div className="h-full bg-gradient-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
      {quiz.quiz_type === "previous-year" && (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border bg-card/45 px-3 py-2 sm:px-16">
          <button
            onClick={() => {
              updateCurrentCanvas();
              setSelectedSubject(null);
              setCurrentIdx(0);
            }}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              selectedSubject === null
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-background/30 text-muted-foreground hover:border-primary/50"
            }`}
          >
            All subjects <span className="opacity-70">({questions.length})</span>
          </button>
          <button
            onClick={() => {
              updateCurrentCanvas();
              setBookmarkedOnly((value) => !value);
              setCurrentIdx(0);
            }}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              bookmarkedOnly
                ? "border-secondary bg-secondary/20 text-secondary"
                : "border-border bg-background/30 text-muted-foreground hover:border-secondary/50"
            }`}
          >
            Bookmarked only <span className="opacity-70">({bookmarkIds.size})</span>
          </button>
          {subjectGroups.map((subject) => (
            <button
              key={subject.label}
              onClick={() => {
                updateCurrentCanvas();
                setSelectedSubject(subject.label);
                setCurrentIdx(0);
              }}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selectedSubject === subject.label
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border bg-background/30 text-muted-foreground hover:border-primary/50"
              }`}
            >
              {subject.label} <span className="opacity-70">({subject.count})</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/45 lg:flex">
          <div className="border-b border-border p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Questions</div>
            <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
              <Legend className="bg-primary" label="Current" />
              <Legend className="bg-success" label="Answered" />
              <Legend className="bg-destructive" label="Marked" />
              <Legend className="bg-muted-foreground" label="Unattempted" />
            </div>
          </div>
          <div className="grid flex-1 auto-rows-[56px] grid-cols-3 content-start gap-2 overflow-y-auto p-3 xl:grid-cols-4">
            {visibleQuestions.map((question, index) => {
              const state = states[question.id] ?? {};
              const status =
                index === currentIdx
                  ? "current"
                  : state.marked
                    ? "marked"
                    : hasAnswer(state.answer)
                      ? "answered"
                      : "plain";
              return (
                <button key={question.id} onClick={() => goTo(index)} className={`relative rounded-lg border text-sm font-semibold transition ${paletteClass(status)}`}>
                  {bookmarkIds.has(question.id) && (
                    <Bookmark className="absolute right-1 top-1 h-3 w-3 fill-secondary text-secondary" />
                  )}
                  {index + 1}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 border-t border-border p-3 text-center">
            <SmallStat value={stats.answered} label="Answered" tone="text-success" />
            <SmallStat value={stats.marked} label="Marked" tone="text-destructive" />
            <SmallStat value={stats.left} label="Left" tone="text-secondary" />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className={`grid min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 ${questionCollapsed ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-[minmax(340px,440px)_minmax(520px,1fr)]"}`}>
            <section className={`min-h-0 flex-col gap-3 overflow-y-auto pr-1 ${questionCollapsed ? "hidden" : "flex"}`}>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-secondary/15 px-2 py-1 text-xs font-bold uppercase text-secondary">
                  {current.question_type}
                </span>
                <span className="text-sm text-muted-foreground">{current.subject ?? current.topic ?? "GATE"}</span>
                <span className="ml-auto text-xs text-muted-foreground">+{current.marks} / -{quiz.negative_marking ?? 0}</span>
              </div>
              <div className="glass-strong rounded-xl p-5 text-lg font-medium leading-relaxed">
                {current.question_text}
                {current.image_url && (
                  <img
                    src={current.image_url}
                    alt={current.image_alt || "Question diagram"}
                    className="mt-4 max-h-72 w-full rounded-xl border border-border bg-white object-contain p-2"
                  />
                )}
              </div>
              {current.question_type === "nat" ? (
                <input
                  value={typeof currentState.answer === "string" ? currentState.answer : ""}
                  onChange={(event) => setNatAnswer(event.target.value)}
                  className="rounded-xl border border-border bg-background/40 px-4 py-3 text-lg outline-none focus:border-primary"
                  placeholder="Enter numerical answer"
                  inputMode="decimal"
                />
              ) : (
                <div className="space-y-2">
                  {current.options.map((option, index) => {
                    const selected = isOptionSelected(currentState.answer, index);
                    return (
                      <button
                        key={option}
                        onClick={() => selectAnswer(index)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                          selected
                            ? "border-primary/70 bg-primary/10"
                            : "border-border bg-background/30 hover:border-primary/40"
                        }`}
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={markForReview}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${currentState.marked ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border bg-background/30 hover:border-primary/50"}`}
                >
                  <Highlighter className="h-4 w-4" />
                  {currentState.marked ? "Unmark" : "Mark"}
                </button>
                <button
                  onClick={toggleBookmark}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    bookmarkIds.has(current.id)
                      ? "border-secondary/60 bg-secondary/10 text-secondary"
                      : "border-border bg-background/30 hover:border-secondary/50"
                  }`}
                >
                  <Bookmark className={`h-4 w-4 ${bookmarkIds.has(current.id) ? "fill-current" : ""}`} />
                  {bookmarkIds.has(current.id) ? "Bookmarked" : "Bookmark"}
                </button>
                <button onClick={clearAnswer} className="inline-flex items-center gap-2 rounded-lg border border-destructive/50 px-3 py-2 text-sm font-semibold text-destructive">
                  <X className="h-4 w-4" /> Clear
                </button>
              </div>
            </section>

            <section className="flex min-h-0 min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Scratch Work</div>
                <button onClick={() => setQuestionCollapsed((value) => !value)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary/50">
                  {questionCollapsed ? "Show question" : "Focus canvas"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/55 p-2">
                <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} icon={PenLine} label="Pen" />
                <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} icon={Eraser} label="Eraser" />
                <ToolButton active={tool === "text"} onClick={() => setTool("text")} icon={Type} label="Text" />
                <ToolButton active={tool === "line"} onClick={() => setTool("line")} icon={Minus} label="Line" />
                <ToolButton active={tool === "rect"} onClick={() => setTool("rect")} icon={RectangleHorizontal} label="Rectangle" />
                <ToolButton active={tool === "circle"} onClick={() => setTool("circle")} icon={Circle} label="Circle" />
                <ToolButton active={tool === "select"} onClick={() => setTool("select")} icon={MousePointer2} label="Select" />
                <div className="mx-1 h-8 w-px bg-border" />
                {swatches.map((item) => (
                  <button key={item} title={item} onClick={() => setColor(item)} className={`h-7 w-7 rounded-full border-2 transition ${color === item ? "scale-110 border-foreground" : "border-transparent"}`} style={{ background: item }} />
                ))}
                <input type="range" min={1} max={18} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="h-2 w-28 accent-primary" title="Brush size" />
                <ToolButton onClick={undo} icon={RotateCcw} label="Undo" />
                <ToolButton onClick={redo} icon={RotateCw} label="Redo" />
              </div>
              <div className="relative min-h-[360px] flex-1 overflow-auto rounded-xl border border-border bg-background/30 p-3">
                <canvas
                  ref={canvasRef}
                  width={PAPER_WIDTH}
                  height={PAPER_HEIGHT}
                  onPointerDown={onScratchDown}
                  onPointerMove={onScratchMove}
                  onPointerUp={onScratchUp}
                  onPointerCancel={onScratchUp}
                  className="block h-[1100px] w-[1500px] touch-none rounded-xl bg-[#fbfaf5] shadow-sm"
                />
              </div>
            </section>
          </div>

          <footer className="flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card/50 px-3 py-3 sm:gap-3 sm:px-4">
            <BottomButton disabled={currentIdx === 0} onClick={() => goTo(currentIdx - 1)} label="Prev" icon={ArrowLeft} />
            <div className="min-w-20 text-center text-sm text-muted-foreground">
              <span className="font-semibold text-secondary">{currentIdx + 1}</span> / {visibleQuestions.length}
            </div>
            <BottomButton disabled={currentIdx === visibleQuestions.length - 1} onClick={() => goTo(currentIdx + 1)} label="Next" icon={ArrowRight} />
            <div className="flex-1" />
            <button onClick={() => goTo(Math.min(visibleQuestions.length - 1, currentIdx + 1))} className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold hover:border-primary/50">
              Save & Next
            </button>
            <button
              onClick={finishQuiz}
              disabled={saveAttempt.isPending || !allQuestionsAnswered}
              title={allQuestionsAnswered ? "Finish and view answers" : "Answer all questions to view answers"}
              className="rounded-xl bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground disabled:opacity-60"
            >
              {allQuestionsAnswered ? "Finish Test" : "Answer all to finish"}
            </button>
          </footer>
        </main>
      </div>
      {exportOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-elevated">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Export PDF</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose what to include from your current practice session.
                </p>
              </div>
              <button onClick={() => setExportOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <ExportChoice
                title="Only this question"
                description="Question, options, your answer, correct answer, explanation, and this scratchbook."
                onDownload={() => exportPdf("current")}
                onSave={() => exportPdf("current", true)}
              />
              <ExportChoice
                title="All attempted in this session"
                description="Everything you solved or wrote on today. It also works if you continue tomorrow from the saved session."
                onDownload={() => exportPdf("attempted")}
                onSave={() => exportPdf("attempted", true)}
              />
              <ExportChoice
                title="All questions in this set"
                description="Full review PDF for the whole paper, including unanswered questions."
                onDownload={() => exportPdf("all")}
                onSave={() => exportPdf("all", true)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderScratch(canvas: HTMLCanvasElement | null, elements: ScratchElement[], active?: ScratchElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT);
  ctx.fillStyle = "#fbfaf5";
  ctx.fillRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT);
  ctx.strokeStyle = "rgba(139, 92, 246, 0.10)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= PAPER_WIDTH; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, PAPER_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= PAPER_HEIGHT; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(PAPER_WIDTH, y);
    ctx.stroke();
  }
  [...elements, ...(active ? [active] : [])].forEach((element) => drawElement(ctx, element));
}

function drawElement(ctx: CanvasRenderingContext2D, element: ScratchElement) {
  ctx.save();
  ctx.strokeStyle = element.color;
  ctx.fillStyle = element.color;
  ctx.lineWidth = element.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (element.kind === "stroke") {
    drawStroke(ctx, element.points);
  } else if (element.kind === "line") {
    ctx.beginPath();
    ctx.moveTo(element.start.x, element.start.y);
    ctx.lineTo(element.end.x, element.end.y);
    ctx.stroke();
  } else if (element.kind === "rect") {
    ctx.strokeRect(
      Math.min(element.start.x, element.end.x),
      Math.min(element.start.y, element.end.y),
      Math.abs(element.end.x - element.start.x),
      Math.abs(element.end.y - element.start.y),
    );
  } else if (element.kind === "circle") {
    ctx.beginPath();
    ctx.ellipse(
      (element.start.x + element.end.x) / 2,
      (element.start.y + element.end.y) / 2,
      Math.abs(element.end.x - element.start.x) / 2,
      Math.abs(element.end.y - element.start.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } else {
    ctx.font = `${element.size}px Inter, Arial, sans-serif`;
    ctx.fillText(element.text, element.at.x, element.at.y);
  }
  ctx.restore();
}

function drawStroke(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y + 0.01);
  ctx.stroke();
}

function eraseElement(elements: ScratchElement[], point: Point, brushSize: number) {
  const radius = Math.max(14, brushSize * 5);
  const index = [...elements].reverse().findIndex((element) => elementHit(element, point, radius));
  if (index === -1) return elements;
  const realIndex = elements.length - 1 - index;
  return elements.filter((_, i) => i !== realIndex);
}

function elementHit(element: ScratchElement, point: Point, radius: number) {
  if (element.kind === "stroke") return element.points.some((p) => distance(p, point) <= radius);
  if (element.kind === "text") return distance(element.at, point) <= radius + element.text.length * 4;
  const minX = Math.min(element.start.x, element.end.x) - radius;
  const maxX = Math.max(element.start.x, element.end.x) + radius;
  const minY = Math.min(element.start.y, element.end.y) - radius;
  const maxY = Math.max(element.start.y, element.end.y) + radius;
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function parseScratchDoc(value: unknown): ScratchDoc {
  if (value && typeof value === "object" && (value as ScratchDoc).version === "scratch-v2") {
    return { version: "scratch-v2", elements: cloneElements((value as ScratchDoc).elements ?? []) };
  }
  return { version: "scratch-v2", elements: [] };
}

function cloneElements(elements: ScratchElement[]) {
  return structuredClone(elements);
}

function renderScratchToDataUrl(elements: ScratchElement[]) {
  const canvas = document.createElement("canvas");
  canvas.width = PAPER_WIDTH;
  canvas.height = PAPER_HEIGHT;
  renderScratch(canvas, elements);
  return canvas.toDataURL("image/png");
}

function addReviewPdfPage(
  pdf: import("jspdf").jsPDF,
  quizTitle: string,
  question: Question,
  state: QuestionState,
  index: number,
  total: number,
) {
  const scratch = parseScratchDoc(state.canvasJSON);
  const canvasImage = renderScratchToDataUrl(scratch.elements);
  const attempted = hasAnswer(state.answer);
  const knownResult = state.correct !== undefined;
  const resultLabel = knownResult ? (state.correct ? "Correct" : "Needs review") : attempted ? "Attempted" : "Not attempted";

  pdf.setFillColor(12, 12, 28);
  pdf.rect(0, 0, 297, 210, "F");

  pdf.setFillColor(23, 24, 45);
  pdf.roundedRect(8, 7, 281, 18, 4, 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(245, 246, 255);
  pdf.text(quizTitle, 13, 18, { maxWidth: 150 });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(164, 170, 205);
  pdf.text(`Question ${index + 1} of ${total}`, 284, 18, { align: "right" });

  pdf.setFillColor(31, 33, 60);
  pdf.roundedRect(8, 31, 132, 76, 5, 5, "F");
  pdf.setFillColor(92, 68, 220);
  pdf.roundedRect(13, 36, 18, 7, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(255, 255, 255);
  pdf.text(question.question_type.toUpperCase(), 22, 41, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(172, 176, 210);
  pdf.text(`${question.subject ?? question.topic ?? "General"} | +${question.marks}`, 35, 41);

  pdf.setFillColor(15, 17, 35);
  pdf.roundedRect(13, 48, 122, 20, 4, 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(246, 247, 255);
  writeClampedPdfText(pdf, question.question_text, 18, 56, 112, 3, 4);
  if (question.image_url) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.5);
    pdf.setTextColor(172, 176, 210);
    pdf.text("Diagram/image is shown in the app question view.", 18, 66, { maxWidth: 112 });
  }

  let y = 74;
  if (question.question_type === "nat") {
    pdfSetAnswerCard(pdf, 13, y, "Your answer", answerText(question, state.answer), attempted ? [76, 94, 180] : [60, 62, 90], 8);
    y += 9;
    pdfSetAnswerCard(pdf, 13, y, "Correct answer", answerText(question, question.correct_answer), [40, 150, 105], 8);
    y += 10;
  } else {
    question.options.forEach((option, optionIndex) => {
      const selected = isOptionSelected(state.answer, optionIndex);
      const correct = isCorrectOption(question, optionIndex);
      const fill: [number, number, number] = correct
        ? [19, 75, 55]
        : selected
          ? [92, 42, 52]
          : [21, 23, 42];
      const stroke: [number, number, number] = correct
        ? [54, 211, 153]
        : selected
          ? [248, 113, 113]
          : [58, 62, 100];
      pdf.setFillColor(...fill);
      pdf.setDrawColor(...stroke);
      pdf.roundedRect(13, y - 4.5, 122, 7.5, 2, 2, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(5.6);
      pdf.setTextColor(235, 238, 255);
      pdf.text(String.fromCharCode(65 + optionIndex), 18, y + 0.8);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(5.6);
      pdf.text(option, 25, y + 0.8, { maxWidth: 86 });
      if (selected || correct) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(4.8);
        pdf.text(selected && correct ? "Your + correct" : selected ? "Your answer" : "Correct", 132, y + 0.8, { align: "right" });
      }
      y += 8.3;
    });
    y += 0.5;
  }

  const badgeColor: [number, number, number] = state.correct ? [16, 185, 129] : attempted ? [248, 113, 113] : [148, 163, 184];
  y = Math.min(y, 98);
  pdf.setFillColor(...badgeColor);
  pdf.roundedRect(13, y, 34, 6, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.8);
  pdf.setTextColor(8, 11, 25);
  pdf.text(resultLabel, 30, y + 4.4, { align: "center" });

  pdf.setFillColor(31, 33, 60);
  pdf.roundedRect(146, 31, 143, 76, 5, 5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(245, 246, 255);
  pdf.text("Answer summary", 153, 41);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(210, 214, 235);
  pdf.text(`Your answer: ${answerText(question, state.answer)}`, 153, 50, { maxWidth: 126 });
  pdf.text(`Correct answer: ${answerText(question, question.correct_answer)}`, 153, 58, { maxWidth: 126 });

  if (scratch.elements.length > 0) {
    pdf.setFillColor(251, 250, 245);
    pdf.roundedRect(153, 66, 58, 34, 3, 3, "F");
    pdf.addImage(canvasImage, "PNG", 155, 68, 54, 30);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6);
    pdf.setTextColor(164, 170, 205);
    pdf.text("Scratchbook", 218, 83);
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.setTextColor(164, 170, 205);
    pdf.text("No scratchbook work saved for this question.", 153, 72, { maxWidth: 126 });
  }

  y = 114;
  const whyBottom = 198;
  const whyHeight = whyBottom - y;
  pdf.setFillColor(15, 17, 35);
  pdf.roundedRect(8, y, 281, whyHeight, 4, 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(245, 246, 255);
  pdf.text("Gemini review", 14, y + 8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(190, 196, 225);
  writeFittingPdfText(
    pdf,
    state.aiExplanation ||
      question.explanation ||
      question.concept_notes ||
      "Explanation is not available for this question yet.",
    14,
    y + 17,
    269,
    whyHeight - 22,
  );
}

function pdfSetAnswerCard(
  pdf: import("jspdf").jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  fill: [number, number, number],
  height = 11,
) {
  pdf.setFillColor(...fill);
  pdf.roundedRect(x, y, 122, height, 3, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6);
  pdf.setTextColor(235, 238, 255);
  pdf.text(label, x + 5, y + 3.5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6);
  pdf.text(value, x + 5, y + height - 2.2, { maxWidth: 112 });
}

function writeFittingPdfText(
  pdf: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const sizes = [7, 6.5, 6, 5.5, 5];
  for (const size of sizes) {
    pdf.setFontSize(size);
    const lineHeight = size * 0.45;
    const lines = pdf.splitTextToSize(text, maxWidth) as string[];
    if (lines.length * lineHeight <= maxHeight) {
      lines.forEach((line, index) => pdf.text(line, x, y + index * lineHeight));
      return;
    }
  }
  pdf.setFontSize(5);
  writeClampedPdfText(pdf, text, x, y, maxWidth, Math.floor(maxHeight / 2.3), 2.3);
}

function writeClampedPdfText(
  pdf: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  lineHeight: number,
) {
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length > 0) {
    visible[visible.length - 1] = `${visible[visible.length - 1].replace(/\s+$/, "")}...`;
  }
  visible.forEach((line, index) => {
    pdf.text(line, x, y + index * lineHeight);
  });
}

function evaluate(question: Question, answer: QuestionState["answer"], negative: number) {
  if (question.question_type === "nat") {
    const expected = Number(question.correct_answer);
    const actual = Number(answer);
    const correct = Number.isFinite(actual) && Math.abs(actual - expected) <= 0.01;
    return { correct, marks: correct ? Number(question.marks) : 0 };
  }
  if (question.question_type === "msq") {
    const correctAnswer = Array.isArray(question.correct_answer)
      ? [...question.correct_answer].map(Number).sort()
      : [];
    const selected = Array.isArray(answer) ? [...answer].map(Number).sort() : [];
    const correct =
      correctAnswer.length === selected.length &&
      correctAnswer.every((value, index) => value === selected[index]);
    return { correct, marks: correct ? Number(question.marks) : 0 };
  }
  const correct = Number(answer) === Number(question.correct_answer);
  return { correct, marks: correct ? Number(question.marks) : -negative };
}

function buildHistory(questions: Question[], states: Record<string, QuestionState>): AnswerRecord[] {
  return questions
    .filter((question) => states[question.id]?.submitted)
    .map((question) => ({
      question_id: question.id,
      topic: question.topic,
      difficulty: question.difficulty,
      correct: !!states[question.id]?.correct,
      time_seconds: states[question.id]?.timeSeconds ?? 0,
      marks_earned: states[question.id]?.marksEarned ?? 0,
      marks_possible: Number(question.marks),
    }));
}

function hasAnswer(answer: QuestionState["answer"]) {
  if (answer === null || answer === undefined || answer === "") return false;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}

function isOptionSelected(answer: QuestionState["answer"], index: number) {
  if (Array.isArray(answer)) return answer.map(Number).includes(index);
  return Number(answer) === index;
}

function isCorrectOption(question: Question, index: number) {
  if (Array.isArray(question.correct_answer)) return question.correct_answer.map(Number).includes(index);
  return Number(question.correct_answer) === index;
}

function answerText(question: Question, answer: unknown) {
  if (!hasAnswer(answer as QuestionState["answer"])) return "Not attempted";
  if (question.question_type === "nat") return String(answer);
  const indexes = Array.isArray(answer) ? answer.map(Number) : [Number(answer)];
  return indexes
    .filter((item) => Number.isFinite(item))
    .map((item) => `${String.fromCharCode(65 + item)}. ${question.options[item] ?? ""}`)
    .join(", ");
}

function paletteClass(status: "plain" | "current" | "answered" | "marked") {
  if (status === "current") return "border-primary bg-primary/20 text-primary";
  if (status === "answered") return "border-success/70 bg-success/15 text-success";
  if (status === "marked") return "border-destructive/70 bg-destructive/15 text-destructive";
  return "border-border bg-background/30 text-muted-foreground hover:border-primary/50";
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function SmallStat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div>
      <div className={`font-mono text-lg font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/30 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ExportChoice({
  title,
  description,
  onDownload,
  onSave,
}: {
  title: string;
  description: string;
  onDownload: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/35 p-4">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onDownload}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-primary/60 hover:bg-primary/10"
        >
          Download now
        </button>
        <button
          onClick={onSave}
          className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition hover:opacity-90"
        >
          Save to dashboard
        </button>
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: typeof Download;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/30 px-3 py-2 text-xs font-semibold hover:border-primary/50"
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function ToolButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  icon: typeof PenLine;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`grid h-10 w-10 place-items-center rounded-lg border transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background/30 text-muted-foreground hover:border-primary/50"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function BottomButton({
  disabled,
  onClick,
  label,
  icon: Icon,
}: {
  disabled?: boolean;
  onClick: () => void;
  label: string;
  icon: typeof ArrowLeft;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function ElapsedTimer({
  start,
  limit,
  onTimeUp,
}: {
  start: number;
  limit: number | null | undefined;
  onTimeUp: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = Math.floor((now - start) / 1000);
  const remaining = limit ? Math.max(0, limit - elapsed) : null;
  useEffect(() => {
    if (remaining === 0) onTimeUp();
  }, [remaining, onTimeUp]);
  const seconds = remaining ?? elapsed;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="glass inline-flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs">
      <Timer className="h-4 w-4 text-secondary" />
      {mm}:{ss}
    </div>
  );
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "quiz";
}

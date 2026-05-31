import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { FileText, ImagePlus, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_app/generator")({
  head: () => ({ meta: [{ title: "Question Generator - AdaptiveAI" }] }),
  component: QuestionGeneratorPage,
});

type GeneratedQuestion = {
  question_text: string;
  question_type: "mcq" | "msq" | "nat" | "short";
  question_nature?: "numeric" | "theory";
  difficulty: "easy" | "medium" | "important" | "hard";
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  topic?: string;
};

type UploadPayload = {
  name: string;
  mime_type: string;
  data: string;
};

const difficultyOptions = ["mixed", "easy", "medium", "important", "hard"];
const typeOptions = ["mixed", "mcq", "msq", "nat", "short"];
const natureOptions = ["mixed", "numeric", "theory"];

function QuestionGeneratorPage() {
  const [file, setFile] = useState<UploadPayload | null>(null);
  const [difficulty, setDifficulty] = useState("mixed");
  const [questionType, setQuestionType] = useState("mixed");
  const [questionNature, setQuestionNature] = useState("mixed");
  const [count, setCount] = useState(12);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [activeSet, setActiveSet] = useState("all");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);

  const grouped = useMemo(() => {
    const map = new Map<string, GeneratedQuestion[]>();
    questions.forEach((question) => {
      const key = question.difficulty || "medium";
      map.set(key, [...(map.get(key) || []), question]);
    });
    return ["easy", "medium", "important", "hard"]
      .map((level) => [level, map.get(level) || []] as const)
      .filter(([, items]) => items.length > 0);
  }, [questions]);

  const visibleQuestions = useMemo(
    () => (activeSet === "all" ? questions : questions.filter((question) => question.difficulty === activeSet)),
    [activeSet, questions],
  );

  async function handleFile(nextFile: File | undefined) {
    if (!nextFile) return;
    const allowed = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(nextFile.type)) {
      toast.error("Upload a PDF, image, TXT, or DOCX file.");
      return;
    }
    if (nextFile.size > 14 * 1024 * 1024) {
      toast.error("Keep the file under 14 MB for this demo.");
      return;
    }

    const dataUrl = await readAsDataUrl(nextFile);
    setFile({
      name: nextFile.name,
      mime_type: nextFile.type,
      data: dataUrl.split(",")[1] || "",
    });
    setQuestions([]);
    setExtractedText("");
  }

  async function generate() {
    if (!file) {
      toast.error("Upload a file first.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.generateQuestionsFromFile({
        file,
        difficulty,
        question_type: questionType,
        question_nature: questionNature,
        count,
      });
      setProvider(res.provider || "ai");
      setExtractedText(res.extracted_text || "");
      setQuestions(res.questions || []);
      setActiveSet("all");
      toast.success("Questions generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Question generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-secondary" />
            <h1 className="font-display text-3xl font-bold">Question Generator</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Upload handwritten notes, homework images, PDFs, TXT, or DOCX files. The app extracts the content first, then creates difficulty-wise question sets.
          </p>
        </div>
        {provider && (
          <span className="rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
            Source: {provider}
          </span>
        )}
      </header>

      <section className="glass gradient-border rounded-2xl p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
          <label className="grid min-h-60 cursor-pointer place-items-center rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center transition hover:bg-primary/10">
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary">
                {file?.mime_type.startsWith("image/") ? (
                  <ImagePlus className="h-7 w-7 text-primary-foreground" />
                ) : (
                  <FileText className="h-7 w-7 text-primary-foreground" />
                )}
              </div>
              <div className="mt-4 text-sm font-semibold">{file ? file.name : "Upload image, PDF, or docs"}</div>
              <div className="mt-1 text-xs text-muted-foreground">PDF, PNG, JPG, WEBP, TXT, DOCX up to 14 MB</div>
            </div>
          </label>

          <div className="rounded-2xl border border-border bg-background/30 p-5">
            <div className="text-sm font-semibold">Question set settings</div>
            <div className="mt-2 rounded-xl border border-border bg-card/35 px-3 py-2 text-xs text-muted-foreground">
              Selected: <span className="font-semibold text-foreground">{difficulty}</span> difficulty,{" "}
              <span className="font-semibold text-foreground">{questionType.toUpperCase()}</span> type,{" "}
              <span className="font-semibold text-foreground">{questionNature}</span> nature.
            </div>
            <div className="mt-5 space-y-5">
              <ControlGroup label="Difficulty">
                {difficultyOptions.map((item) => (
                  <OptionButton key={item} active={difficulty === item} onClick={() => setDifficulty(item)}>
                    {item}
                  </OptionButton>
                ))}
              </ControlGroup>

              <ControlGroup label="Question type">
                {typeOptions.map((item) => (
                  <OptionButton key={item} active={questionType === item} onClick={() => setQuestionType(item)}>
                    {item.toUpperCase()}
                  </OptionButton>
                ))}
              </ControlGroup>

              <ControlGroup label="Question nature">
                {natureOptions.map((item) => (
                  <OptionButton key={item} active={questionNature === item} onClick={() => setQuestionNature(item)}>
                    {item}
                  </OptionButton>
                ))}
              </ControlGroup>

              <div>
                <label className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Count: {count}
                </label>
                <input
                  type="range"
                  min={3}
                  max={30}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  className="mt-3 w-full accent-primary"
                />
              </div>

              <button
                onClick={generate}
                disabled={!file || loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {!file ? "Upload a file to generate" : "Generate questions"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="min-h-[560px] rounded-2xl border border-border bg-card/40 p-5">
          {questions.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              Extracted content and generated question sets will appear here.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-background/35 p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-secondary">
                  Extracted content
                </div>
                <div className="max-h-52 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {extractedText || "Extraction was not returned. Questions were generated from the uploaded file."}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {["all", ...grouped.map(([level]) => level)].map((level) => (
                  <button
                    key={level}
                    onClick={() => setActiveSet(level)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      activeSet === level
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border bg-background/30 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {level} {level === "all" ? `(${questions.length})` : `(${questions.filter((q) => q.difficulty === level).length})`}
                  </button>
                ))}
              </div>

              {activeSet === "all" ? (
                grouped.map(([level, items]) => (
                  <div key={level}>
                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-secondary">
                      {level} question set
                    </div>
                    <div className="space-y-3">
                      {items.map((question, index) => (
                        <QuestionCard key={`${question.question_text}-${index}`} question={question} index={index} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div>
                  <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-secondary">
                    {activeSet} question set
                  </div>
                  <div className="space-y-3">
                    {visibleQuestions.map((question, index) => (
                      <QuestionCard key={`${question.question_text}-${index}`} question={question} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
      </section>
    </div>
  );
}

function QuestionCard({ question, index }: { question: GeneratedQuestion; index: number }) {
  return (
    <article className="rounded-2xl border border-border bg-background/35 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold uppercase text-primary">
          {question.question_type}
        </span>
        <span className="rounded-md bg-secondary/15 px-2 py-1 text-[10px] font-bold uppercase text-secondary">
          {question.difficulty}
        </span>
        {question.question_nature && (
          <span className="rounded-md bg-success/15 px-2 py-1 text-[10px] font-bold uppercase text-success">
            {question.question_nature}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{question.topic || `Question ${index + 1}`}</span>
      </div>
      <div className="font-semibold leading-relaxed">{question.question_text}</div>
      {!!question.options?.length && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {question.options.map((option, optionIndex) => (
            <div key={option} className="rounded-xl border border-border bg-card/45 px-3 py-2 text-sm">
              <span className="mr-2 font-bold text-secondary">{String.fromCharCode(65 + optionIndex)}.</span>
              {option}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 rounded-xl border border-success/25 bg-success/10 p-3 text-sm">
        <span className="font-bold text-success">Answer: </span>
        {question.correct_answer}
      </div>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{question.explanation}</div>
    </article>
  );
}

function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
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

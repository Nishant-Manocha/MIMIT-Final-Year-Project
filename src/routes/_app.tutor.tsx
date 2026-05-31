import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eraser,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tutor")({
  head: () => ({ meta: [{ title: "AI Tutor - AdaptiveAI" }] }),
  component: TutorPage,
});

interface Msg {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  followUps?: string[];
}

interface TutorChat {
  id: string;
  title: string;
  messages: Msg[];
  updated_at?: string;
}

const CHAT_KEY = "adaptiveai_tutor_chat_v1";
const ACTIVE_CHAT_KEY = "adaptiveai_tutor_active_chat_v1";

const quickPromptTemplates = [
  {
    label: "Simple example",
    instruction: "explain it with a simple example",
  },
  {
    label: "GATE question",
    instruction: "give me one GATE-style question with answer and explanation",
  },
  {
    label: "Revision note",
    instruction: "make a short revision note with key points",
  },
  {
    label: "Table",
    instruction: "compare the important parts in a table",
  },
  {
    label: "Common mistakes",
    instruction: "tell me common mistakes and traps students make",
  },
  {
    label: "10-min drill",
    instruction: "give me a 10-minute practice drill",
  },
];

function TutorPage() {
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]") as Msg[];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(ACTIVE_CHAT_KEY),
  );
  const [chats, setChats] = useState<TutorChat[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );
  const followUpPrompts = useMemo(() => buildFollowUpPrompts(messages), [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
  }, [messages, loading]);

  useEffect(() => {
    void refreshChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshChats(preferredId = chatId) {
    try {
      const list = (await api.tutorChats()) as TutorChat[];
      setChats(list);
      const selected = preferredId ? list.find((chat) => chat.id === preferredId) : null;
      if (selected) {
        setChatId(selected.id);
        setMessages(selected.messages || []);
        localStorage.setItem(ACTIVE_CHAT_KEY, selected.id);
      }
    } catch {
      // Local storage remains the offline fallback.
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const newMsgs: Msg[] = [...messages, { role: "user", content }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      const res = await api.askTutor(newMsgs, chatId);
      if (res.chat_id) {
        setChatId(res.chat_id);
        localStorage.setItem(ACTIVE_CHAT_KEY, res.chat_id);
      }
      setMessages([
        ...newMsgs,
        {
          role: "assistant",
          content: res.content,
          provider: res.provider,
          followUps: res.followUps,
        },
      ]);
      void refreshChats(res.chat_id || chatId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Tutor failed to respond.");
    } finally {
      setLoading(false);
    }
  }

  async function retryLastQuestion() {
    if (loading) return;
    const lastUserIndex = [...messages].map((message, index) => ({ message, index })).reverse().find((item) => item.message.role === "user")?.index;
    if (lastUserIndex === undefined) return;
    const retryMessages = messages.slice(0, lastUserIndex);
    const question = messages[lastUserIndex].content;
    setMessages(retryMessages);
    setInput("");
    setLoading(true);
    const newMsgs: Msg[] = [...retryMessages, { role: "user", content: question }];
    setMessages(newMsgs);
    try {
      const res = await api.askTutor(newMsgs, chatId);
      if (res.chat_id) {
        setChatId(res.chat_id);
        localStorage.setItem(ACTIVE_CHAT_KEY, res.chat_id);
      }
      setMessages([
        ...newMsgs,
        {
          role: "assistant",
          content: res.content,
          provider: res.provider,
          followUps: res.followUps,
        },
      ]);
      void refreshChats(res.chat_id || chatId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Tutor failed to respond.");
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setChatId(null);
    setMessages([]);
    setInput("");
    localStorage.removeItem(CHAT_KEY);
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  }

  function openChat(chat: TutorChat) {
    setChatId(chat.id);
    setMessages(chat.messages || []);
    setInput("");
    localStorage.setItem(ACTIVE_CHAT_KEY, chat.id);
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-5rem)] min-h-0 max-w-7xl overflow-hidden rounded-xl border border-border bg-background/45 md:h-[calc(100dvh-7.5rem)] md:min-h-[620px] md:rounded-2xl">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card/45 md:flex">
        <div className="border-b border-border p-3">
          <button
            onClick={newChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-sm font-semibold transition hover:border-primary/60 hover:bg-muted/40"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {chats.length === 0 ? (
            <div className="px-3 py-6 text-xs leading-relaxed text-muted-foreground">
              Your saved study chats will appear here.
            </div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => openChat(chat)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  chat.id === chatId
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
                title={chat.title}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="truncate">{chat.title}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/40 px-3 md:min-h-16 md:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              <h1 className="truncate font-display text-lg font-bold">AI Tutor</h1>
              <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-success">
                Study only
              </span>
            </div>
          </div>
          <button
            onClick={newChat}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm font-semibold transition hover:border-primary/60 hover:bg-muted/50 md:hidden"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </header>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-8 md:py-6"
          >
            {messages.length === 0 && (
              <div className="grid min-h-full place-items-center">
                <div className="mx-auto max-w-3xl text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary">
                    <MessageSquare className="h-7 w-7 text-primary-foreground" />
                  </div>
                  <h2 className="mt-5 font-display text-xl font-bold sm:text-2xl">What should we study today?</h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Ask a concept, upload a doubt later, compare topics, or generate exam-style drills.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {["Explain deadlock with example", "IPv4 vs IPv6 table", "Make DBMS revision plan"].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => send(prompt)}
                        className="rounded-full border border-border bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((message, index) => (
                <motion.div
                  key={`${message.role}-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mx-auto mb-4 flex max-w-4xl md:mb-6 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[min(760px,96%)] px-3 py-2.5 text-sm leading-relaxed sm:px-4 sm:py-3 ${
                      message.role === "user"
                        ? "rounded-3xl bg-gradient-primary text-primary-foreground"
                        : "rounded-2xl border border-border bg-card/50"
                    }`}
                  >
                    <TutorMessage content={message.content} />
                    {message.role === "assistant" && message.provider && (
                      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <span className={`h-1.5 w-1.5 rounded-full ${message.provider === "gemini" ? "bg-success" : "bg-warning"}`} />
                        {message.provider === "gemini" ? "Gemini" : "Local fallback"}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-5 flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Tutor is thinking...
              </motion.div>
            )}
          </div>

          <div className="border-t border-border bg-background/75 p-2.5 backdrop-blur-xl md:p-4">
            {(messages.length > 0 || lastAssistant) && (
              <div className="mx-auto mb-3 flex max-w-4xl items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  {followUpPrompts.map((prompt) => (
                    <button
                      key={prompt.label}
                      onClick={() => send(prompt.content)}
                      disabled={loading}
                      title={prompt.label}
                      className="max-w-full rounded-full border border-border bg-muted/30 px-3 py-1.5 text-left text-xs font-medium text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-50 sm:max-w-[360px]"
                    >
                      <span className="line-clamp-2">{prompt.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={retryLastQuestion}
                  disabled={loading || !messages.some((message) => message.role === "user")}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-40"
                  title="Regenerate the last answer and suggestions"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="mx-auto flex max-w-4xl gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Ask a study doubt, exam plan, concept, comparison, or question explanation..."
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border bg-background/60 px-3 py-3 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/35 sm:min-h-12 sm:px-4"
              />
              <button
                type="button"
                onClick={() => setInput("")}
                disabled={!input || loading}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card/60 text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-40 sm:h-12 sm:w-12"
                aria-label="Clear input"
              >
                <Eraser className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground glow-sm transition disabled:opacity-50 sm:h-12 sm:w-12"
                aria-label="Send"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
      </section>
    </div>
  );
}

function TutorMessage({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.length >= 2 && lines.every((line) => line.trim().startsWith("|"))) {
          return <MarkdownTable key={index} lines={lines} />;
        }

        return (
          <div key={index} className="space-y-1.5">
            {lines.map((line, lineIndex) => {
              const trimmed = line.trim();
              if (trimmed.startsWith("*   ") || trimmed.startsWith("- ")) {
                return (
                  <div key={lineIndex} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                    <p>{cleanMarkdown(trimmed.replace(/^(\*   |- )/, ""))}</p>
                  </div>
                );
              }
              return <p key={lineIndex}>{cleanMarkdown(trimmed)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter((line) => !/^\|\s*-+/.test(line.trim()))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cleanMarkdown(cell.trim())),
    );

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="bg-muted/40 text-foreground">
          <tr>
            {rows[0].map((cell) => (
              <th key={cell} className="px-3 py-2 font-bold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border/70">
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cleanMarkdown(value: string) {
  return value.replace(/\*\*/g, "").replace(/`/g, "");
}

function buildFollowUpPrompts(messages: Msg[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (lastAssistant?.followUps?.length) {
    return lastAssistant.followUps.slice(0, 6).map((question) => ({
      label: question,
      content: question,
    }));
  }

  const topic = lastUser?.content?.trim() || "the previous topic";
  const lowerTopic = topic.toLowerCase();
  const topicHint = lowerTopic.includes("serial")
    ? "serializability in DBMS transactions"
    : lowerTopic.includes("deadlock")
      ? "deadlock handling in operating systems"
      : lowerTopic.includes("ipv4") || lowerTopic.includes("ipv6")
        ? "IPv4 and IPv6 in computer networks"
        : topic;

  const contextual = quickPromptTemplates.map((item) => ({
    label: item.label,
    content: `For my previous question about ${topicHint}, ${item.instruction}. Keep the answer study-focused and connected to the previous chat.`,
  }));

  if (lowerTopic.includes("serial")) {
    return [
      {
        label: "Conflict vs View",
        content:
          "For my previous question about serializability, compare conflict serializability and view serializability in a table with examples.",
      },
      {
        label: "Precedence graph",
        content:
          "For my previous question about serializability, explain precedence graph steps and give one solved schedule example.",
      },
      ...contextual.slice(0, 4),
    ];
  }

  return contextual;
}

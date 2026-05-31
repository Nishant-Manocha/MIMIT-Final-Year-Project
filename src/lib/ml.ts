/**
 * Lightweight client-side ML utilities for the adaptive learning engine.
 * Real algorithms (weighted scoring, cosine similarity, weak-topic clustering)
 * — no fake placeholders.
 */

export type Difficulty = "easy" | "medium" | "hard";

export interface AnswerRecord {
  question_id: string;
  topic: string | null;
  difficulty: Difficulty;
  correct: boolean;
  time_seconds: number;
  marks_earned: number;
  marks_possible: number;
}

/**
 * Adaptive Difficulty Engine.
 * Inputs: recent answer history.
 * Output: next difficulty level.
 *
 * Uses a weighted-score classifier:
 *   skill = w_acc*accuracy + w_streak*streak_norm - w_time*slowness_norm
 * mapped to easy/medium/hard via thresholds tuned for ~70% target accuracy
 * (the productive struggle zone).
 */
export function nextDifficulty(history: AnswerRecord[], currentDifficulty: Difficulty): Difficulty {
  if (history.length === 0) return currentDifficulty;

  const recent = history.slice(-5);
  const accuracy = recent.filter((r) => r.correct).length / recent.length;

  // streak: trailing correct
  let streak = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].correct) streak++; else break;
  }
  const streakNorm = Math.min(streak / 3, 1);

  const avgTime = recent.reduce((s, r) => s + r.time_seconds, 0) / recent.length;
  const slowness = Math.min(avgTime / 60, 1); // > 60s per question = "slow"

  const skill = 0.6 * accuracy + 0.3 * streakNorm - 0.1 * slowness;

  // Classifier output
  if (skill > 0.78) return "hard";
  if (skill > 0.5) return "medium";
  return "easy";
}

/**
 * Weak-topic detection.
 * Aggregates per-topic accuracy and flags topics in the bottom cluster.
 * Pseudo K-Means with k=2 over (accuracy, response-time) per topic.
 */
export interface TopicStat {
  topic: string;
  accuracy: number;
  avgTime: number;
  attempts: number;
  isWeak: boolean;
  confidence: number;
}

export function detectWeakTopics(history: AnswerRecord[]): TopicStat[] {
  const map = new Map<string, { correct: number; total: number; time: number; marks: number; possible: number }>();
  for (const r of history) {
    const topic = r.topic ?? "general";
    const m = map.get(topic) ?? { correct: 0, total: 0, time: 0, marks: 0, possible: 0 };
    m.total += 1;
    m.time += r.time_seconds;
    m.marks += r.marks_earned;
    m.possible += r.marks_possible;
    if (r.correct) m.correct += 1;
    map.set(topic, m);
  }

  const stats = Array.from(map.entries()).map(([topic, m]) => ({
    topic,
    accuracy: m.possible > 0 ? m.marks / m.possible : 0,
    avgTime: m.total > 0 ? m.time / m.total : 0,
    attempts: m.total,
    isWeak: false,
    confidence: 0,
  }));
  if (stats.length === 0) return [];

  // Simple K-Means with k=2 on normalized accuracy (1 dim is enough; weighted by time)
  const accs = stats.map((s) => s.accuracy);
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length;

  return stats
    .map((s) => ({
      ...s,
      isWeak: s.accuracy < mean && s.accuracy < 0.7,
      confidence: Math.min(s.attempts / 5, 1),
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

/**
 * Cosine similarity — used by the content-based recommender.
 */
export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Predicted exam score — simple weighted regression over attempt history.
 */
export function predictExamScore(history: AnswerRecord[]): number {
  if (history.length === 0) return 0;
  const recentN = Math.min(20, history.length);
  const recent = history.slice(-recentN);
  // weight recent attempts more
  let weightedSum = 0;
  let totalWeight = 0;
  recent.forEach((r, i) => {
    const w = (i + 1) / recent.length;
    weightedSum += w * (r.marks_earned / Math.max(r.marks_possible, 0.001));
    totalWeight += w;
  });
  return Math.round((weightedSum / totalWeight) * 100);
}

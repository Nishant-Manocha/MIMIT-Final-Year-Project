const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "intellilearn_token";
const USER_KEY = "intellilearn_user";

export interface AppUser {
  id: string;
  email: string;
  display_name?: string;
  roles: string[];
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setStoredUser(user: AppUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const token = typeof window !== "undefined" ? getToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }

  return payload as T;
}

export const api = {
  signup: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: AppUser }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: AppUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<{ user: AppUser; profile: any }>("/auth/me"),
  profile: () => request<any>("/profile/me"),
  updateProfile: (body: Record<string, any>) =>
    request<any>("/profile/me", { method: "PATCH", body: JSON.stringify(body) }),
  settings: () => request<any>("/settings/me"),
  updateSettings: (body: Record<string, any>) =>
    request<any>("/settings/me", { method: "PATCH", body: JSON.stringify(body) }),
  courses: () => request<any[]>("/courses"),
  course: (slug: string) => request<any>(`/courses/${slug}`),
  chapters: (courseId: string) => request<any[]>(`/courses/${courseId}/chapters`),
  courseQuizzes: (courseId: string) => request<any[]>(`/courses/${courseId}/quizzes`),
  enrollments: () => request<any[]>("/enrollments"),
  enrollment: (courseId: string) => request<any>(`/enrollments/${courseId}`),
  enroll: (courseId: string) =>
    request<any>("/enrollments", { method: "POST", body: JSON.stringify({ courseId }) }),
  quizzes: () => request<any[]>("/quizzes"),
  quiz: (id: string) => request<any>(`/quizzes/${id}`),
  questions: (quizId: string, params?: { topic?: string; mode?: string }) => {
    const search = new URLSearchParams();
    if (params?.topic) search.set("topic", params.topic);
    if (params?.mode) search.set("mode", params.mode);
    const qs = search.toString();
    return request<any[]>(`/quizzes/${quizId}/questions${qs ? `?${qs}` : ""}`);
  },
  attempts: (limit?: number) => request<any[]>(`/attempts${limit ? `?limit=${limit}` : ""}`),
  dailyActivity: (days?: number) =>
    request<any[]>(`/activity/daily${days ? `?days=${days}` : ""}`),
  saveAttempt: (body: Record<string, any>) =>
    request<any>("/attempts", { method: "POST", body: JSON.stringify(body) }),
  recommendations: () => request<any[]>("/recommendations"),
  notifications: () => request<any[]>("/notifications"),
  markNotificationRead: (id: string) =>
    request<any>(`/notifications/${id}/read`, { method: "PATCH", body: "{}" }),
  tutorChats: () => request<any[]>("/tutor/chats"),
  createTutorChat: (body: { title?: string; messages?: any[] }) =>
    request<any>("/tutor/chats", { method: "POST", body: JSON.stringify(body) }),
  updateTutorChat: (id: string, body: { title?: string; messages?: any[]; archived?: boolean }) =>
    request<any>(`/tutor/chats/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTutorChat: (id: string) =>
    request<{ ok: boolean }>(`/tutor/chats/${id}`, { method: "DELETE", body: "{}" }),
  askTutor: (messages: { role: string; content: string }[], chatId?: string | null) =>
    request<{ chat_id?: string; content: string; provider?: string; followUps?: string[] }>(
      "/ai/tutor",
      {
        method: "POST",
        body: JSON.stringify({ messages, chat_id: chatId }),
      },
    ),
  generateQuestionsFromFile: (body: Record<string, any>) =>
    request<{ provider?: string; extracted_text?: string; question_sets?: Record<string, any[]>; questions: any[] }>("/ai/generate-questions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generateStudyPlan: (body: Record<string, any>) =>
    request<{ provider?: string; plan: any }>("/ai/study-plan", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  youtubeRecommendations: (body: Record<string, any>) =>
    request<any>("/youtube/recommendations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  youtubeSearch: (query: string) =>
    request<any[]>(`/youtube/search?q=${encodeURIComponent(query)}`),
  explainQuestion: (body: { question_id: string; answer: unknown }) =>
    request<{ provider?: string; content: string }>("/ai/question-explanation", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  questionBookmarks: (quizId: string) => request<any[]>(`/quizzes/${quizId}/bookmarks`),
  bookmarkQuestion: (questionId: string) =>
    request<any>(`/questions/${questionId}/bookmark`, { method: "POST", body: "{}" }),
  unbookmarkQuestion: (questionId: string) =>
    request<{ ok: boolean }>(`/questions/${questionId}/bookmark`, { method: "DELETE", body: "{}" }),
  quizProgress: (quizId: string) => request<any>(`/quiz-progress/${quizId}`),
  saveQuizProgress: (quizId: string, body: Record<string, any>) =>
    request<any>(`/quiz-progress/${quizId}`, { method: "PUT", body: JSON.stringify(body) }),
  clearQuizMarked: (quizId: string) =>
    request<any>(`/quiz-progress/${quizId}/clear-marked`, { method: "POST", body: "{}" }),
  savedPdfs: (limit?: number) => request<any[]>(`/saved-pdfs${limit ? `?limit=${limit}` : ""}`),
  savedPdf: (id: string) => request<any>(`/saved-pdfs/${id}`),
  savePdf: (body: Record<string, any>) =>
    request<any>("/saved-pdfs", { method: "POST", body: JSON.stringify(body) }),
  deleteSavedPdf: (id: string) =>
    request<{ ok: boolean }>(`/saved-pdfs/${id}`, { method: "DELETE", body: "{}" }),
  workspaces: () => request<any[]>("/workspaces"),
  questionWorkspace: (questionId: string) => request<any>(`/workspaces/question/${questionId}`),
  saveQuestionWorkspace: (
    questionId: string,
    body: { title?: string; canvas_json: any; thumbnail?: string },
  ) =>
    request<any>(`/workspaces/question/${questionId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  studyRooms: () => request<any[]>("/study-rooms"),
  createStudyRoom: (body: Record<string, any>) =>
    request<any>("/study-rooms", { method: "POST", body: JSON.stringify(body) }),
  joinStudyRoom: (inviteCode: string) =>
    request<any>("/study-rooms/join", {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode }),
    }),
  studyRoom: (roomId: string) => request<any>(`/study-rooms/${roomId}`),
  updateStudyRoom: (roomId: string, body: Record<string, any>) =>
    request<any>(`/study-rooms/${roomId}`, { method: "PATCH", body: JSON.stringify(body) }),
  studyRoomMessages: (roomId: string, after?: string) =>
    request<any[]>(
      `/study-rooms/${roomId}/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`,
    ),
  sendStudyRoomMessage: (
    roomId: string,
    text: string,
    attachments?: Array<{ name: string; type?: string; mime_type?: string; size: number; data_url: string }>,
  ) =>
    request<any>(`/study-rooms/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, attachments }),
    }),
};

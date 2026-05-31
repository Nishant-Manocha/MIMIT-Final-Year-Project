import express from "express";
import {
  Chapter,
  CanvasWorkspace,
  Course,
  DailyActivity,
  Enrollment,
  Notification,
  Profile,
  Question,
  QuestionBookmark,
  Quiz,
  QuizAttempt,
  QuizProgress,
  Recommendation,
  SavedPdf,
  StudyRoom,
  StudyRoomMessage,
  TutorChat,
  UserSettings,
} from "../models.js";
import { requireAuth } from "../middleware/auth.js";
import { buildYoutubeRecommendations } from "../services/youtubeRecommender.js";
import { recentStudyDates, studyDateString, touchUserActivity } from "../utils/activity.js";
import { normalizeEnrollment, normalizeId, normalizeMany } from "../utils/serializers.js";

const router = express.Router();

router.use(requireAuth);

router.get("/profile/me", async (req, res) => {
  const profile = await Profile.findOne({ user_id: req.user._id });
  res.json(normalizeId(profile));
});

router.patch("/profile/me", async (req, res) => {
  const profile = await Profile.findOneAndUpdate(
    { user_id: req.user._id },
    { $set: pick(req.body, ["display_name", "bio", "avatar_url", "daily_goal_minutes"]) },
    { new: true, upsert: true },
  );
  res.json(normalizeId(profile));
});

router.get("/settings/me", async (req, res) => {
  const settings = await UserSettings.findOne({ user_id: req.user._id });
  res.json(normalizeId(settings));
});

router.patch("/settings/me", async (req, res) => {
  const settings = await UserSettings.findOneAndUpdate(
    { user_id: req.user._id },
    {
      $set: pick(req.body, [
        "theme",
        "font_size",
        "reduced_motion",
        "sidebar_collapsed",
        "compact_mode",
        "notifications_email",
        "notifications_inapp",
        "language",
      ]),
    },
    { new: true, upsert: true },
  );
  res.json(normalizeId(settings));
});

router.get("/courses", async (_req, res) => {
  const courses = await Course.find({ published: true }).sort({ enrolled_count: -1 });
  res.json(normalizeMany(courses));
});

router.get("/courses/:slug", async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug, published: true });
  if (!course) return res.status(404).json({ message: "Course not found" });
  res.json(normalizeId(course));
});

router.get("/courses/:id/chapters", async (req, res) => {
  const chapters = await Chapter.find({ course_id: req.params.id }).sort({ order_index: 1 });
  res.json(normalizeMany(chapters));
});

router.get("/courses/:id/quizzes", async (req, res) => {
  const quizzes = await Quiz.find({ course_id: req.params.id, published: true });
  res.json(normalizeMany(quizzes));
});

router.get("/enrollments", async (req, res) => {
  const enrollments = await Enrollment.find({ user_id: req.user._id })
    .populate("course_id")
    .sort({ enrolled_at: -1 });
  res.json(enrollments.map(normalizeEnrollment));
});

router.get("/enrollments/:courseId", async (req, res) => {
  const enrollment = await Enrollment.findOne({
    user_id: req.user._id,
    course_id: req.params.courseId,
  });
  res.json(normalizeId(enrollment));
});

router.post("/enrollments", async (req, res) => {
  const { courseId } = req.body;
  const course = await Course.findById(courseId);
  if (!course) return res.status(404).json({ message: "Course not found" });

  const enrollment = await Enrollment.findOneAndUpdate(
    { user_id: req.user._id, course_id: course._id },
    { $setOnInsert: { progress_pct: 0 } },
    { new: true, upsert: true },
  );

  await Course.findByIdAndUpdate(course._id, { $inc: { enrolled_count: 1 } });
  res.status(201).json(normalizeId(enrollment));
});

router.get("/quizzes", async (req, res) => {
  const quizzes = await Quiz.find({ published: true }).populate("course_id");
  const quizIds = quizzes.map((quiz) => quiz._id);
  const [progressRows, attemptRows] = await Promise.all([
    QuizProgress.find({ user_id: req.user._id, quiz_id: { $in: quizIds } }).lean(),
    QuizAttempt.find({ user_id: req.user._id, quiz_id: { $in: quizIds } })
      .sort({ completed_at: -1 })
      .lean(),
  ]);
  const progressByQuiz = new Map(progressRows.map((progress) => [String(progress.quiz_id), progress]));
  const latestAttemptByQuiz = new Map();
  for (const attempt of attemptRows) {
    const quizId = String(attempt.quiz_id);
    if (!latestAttemptByQuiz.has(quizId)) latestAttemptByQuiz.set(quizId, attempt);
  }

  res.json(
    quizzes.map((quiz) => {
      const normalized = normalizeId(quiz);
      const progress = progressByQuiz.get(String(quiz._id));
      const latestAttempt = latestAttemptByQuiz.get(String(quiz._id));
      if (normalized.course_id && typeof normalized.course_id === "object") {
        normalized.courses = normalizeId(normalized.course_id);
        normalized.course_id = normalized.courses.id;
      }
      normalized.completed = Boolean(progress?.completed || latestAttempt);
      normalized.latest_score = latestAttempt?.score ?? null;
      normalized.latest_max_score = latestAttempt?.max_score ?? null;
      normalized.latest_accuracy = latestAttempt?.accuracy ?? null;
      return normalized;
    }),
  );
});

router.get("/quizzes/:id", async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  res.json(normalizeId(quiz));
});

router.get("/quizzes/:id/questions", async (req, res) => {
  const { topic, mode } = req.query;
  const filter = { quiz_id: req.params.id };
  if (topic) filter.topic = topic;
  const questions = await Question.find(filter).sort({
    ...(mode === "adaptive" ? { difficulty: 1 } : {}),
    order_index: 1,
  });
  res.json(normalizeMany(questions));
});

router.get("/quizzes/:id/bookmarks", async (req, res) => {
  const bookmarks = await QuestionBookmark.find({
    user_id: req.user._id,
    quiz_id: req.params.id,
  }).sort({ updated_at: -1 });
  res.json(normalizeMany(bookmarks));
});

router.post("/questions/:questionId/bookmark", async (req, res) => {
  const question = await Question.findById(req.params.questionId);
  if (!question) return res.status(404).json({ message: "Question not found" });
  const bookmark = await QuestionBookmark.findOneAndUpdate(
    { user_id: req.user._id, question_id: question._id },
    { $set: { quiz_id: question.quiz_id } },
    { new: true, upsert: true },
  );
  res.status(201).json(normalizeId(bookmark));
});

router.get("/study-rooms", async (req, res) => {
  const rooms = await StudyRoom.find({
    "members.user_id": req.user._id,
  }).sort({ updated_at: -1 });
  res.json(normalizeMany(rooms));
});

router.post("/study-rooms", async (req, res) => {
  const body = req.body || {};
  const displayName = req.user.display_name || req.user.email?.split("@")[0] || "Learner";
  const room = await StudyRoom.create({
    owner_id: req.user._id,
    name: cleanStudyText(body.name, "Focused Study Room"),
    subject: cleanStudyText(body.subject, "GATE CSE"),
    topic: cleanStudyText(body.topic, "Study session"),
    activity: cleanStudyText(body.activity, "Problem Solving"),
    mode: cleanStudyText(body.mode, "Voice"),
    invite_code: await uniqueInviteCode(),
    members: [{ user_id: req.user._id, name: displayName, role: "teacher", status: "online" }],
    board_state: { strokes: [] },
    notes: "",
    activity_state: {
      pomodoro_minutes: 25,
      timer_running: false,
      youtube_url: "",
      youtube_time: 0,
      youtube_playing: false,
      youtube_updated_at: Date.now(),
      activity_tiles: [],
      mock_progress: {},
    },
  });

  res.status(201).json(normalizeId(room));
});

router.post("/study-rooms/join", async (req, res) => {
  const inviteCode = String(req.body?.invite_code || "").trim().toUpperCase();
  const room = await StudyRoom.findOne({ invite_code: inviteCode });
  if (!room) return res.status(404).json({ message: "Study room invite not found" });

  const displayName = req.user.display_name || req.user.email?.split("@")[0] || "Learner";
  const alreadyMember = room.members.some((member) => String(member.user_id) === String(req.user._id));
  if (!alreadyMember) {
    room.members.push({ user_id: req.user._id, name: displayName, role: "student", status: "online" });
    await room.save();
  }

  res.json(normalizeId(room));
});

router.get("/study-rooms/:roomId", async (req, res) => {
  const room = await findUserStudyRoom(req.params.roomId, req.user._id);
  if (!room) return res.status(404).json({ message: "Study room not found" });
  res.json(normalizeId(room));
});

router.patch("/study-rooms/:roomId", async (req, res) => {
  const room = await findUserStudyRoom(req.params.roomId, req.user._id);
  if (!room) return res.status(404).json({ message: "Study room not found" });

  const updates = {};
  for (const key of ["name", "subject", "topic", "activity", "mode", "notes"]) {
    if (req.body?.[key] !== undefined) updates[key] = cleanStudyText(req.body[key], room[key] || "");
  }
  if (req.body?.board_state !== undefined) updates.board_state = req.body.board_state;
  if (req.body?.activity_state !== undefined) updates.activity_state = req.body.activity_state;
  if (Array.isArray(req.body?.members)) {
    updates.members = req.body.members
      .map((member) => ({
        user_id: member.user_id,
        name: cleanStudyText(member.name, "Learner").slice(0, 80),
        role: cleanStudyText(member.role, "student").slice(0, 30),
        status: cleanStudyText(member.status, "online").slice(0, 30),
      }))
      .filter((member) => member.name);
  }

  const updated = await StudyRoom.findByIdAndUpdate(room._id, { $set: updates }, { new: true });
  res.json(normalizeId(updated));
});

router.get("/study-rooms/:roomId/messages", async (req, res) => {
  const room = await findUserStudyRoom(req.params.roomId, req.user._id);
  if (!room) return res.status(404).json({ message: "Study room not found" });

  const after = req.query.after ? new Date(String(req.query.after)) : null;
  const filter = { room_id: room._id };
  if (after && !Number.isNaN(after.getTime())) filter.created_at = { $gt: after };
  const messages = await StudyRoomMessage.find(filter).sort({ created_at: 1 }).limit(200);
  res.json(normalizeMany(messages));
});

router.post("/study-rooms/:roomId/messages", async (req, res) => {
  const room = await findUserStudyRoom(req.params.roomId, req.user._id);
  if (!room) return res.status(404).json({ message: "Study room not found" });

  const text = cleanStudyText(req.body?.text, "");
  const attachments = normalizeStudyRoomAttachments(req.body?.attachments);
  if (!text && attachments.length === 0) {
    return res.status(400).json({ message: "Message or attachment is required" });
  }
  if (text && !isStudyFocusedMessage(text)) {
    return res.status(400).json({
      message: "Study rooms allow only educational, exam, productivity, and doubt-solving messages.",
    });
  }

  const displayName = req.user.display_name || req.user.email?.split("@")[0] || "Learner";
  const message = await StudyRoomMessage.create({
    room_id: room._id,
    user_id: req.user._id,
    author_name: displayName,
    text,
    attachments,
    message_type: attachments.length ? "attachment" : "chat",
  });
  await StudyRoom.findByIdAndUpdate(room._id, { $set: { updated_at: new Date() } });
  res.status(201).json(normalizeId(message));
});

router.delete("/questions/:questionId/bookmark", async (req, res) => {
  await QuestionBookmark.deleteOne({ user_id: req.user._id, question_id: req.params.questionId });
  res.json({ ok: true });
});

router.get("/workspaces", async (req, res) => {
  const workspaces = await CanvasWorkspace.find({ user_id: req.user._id }).sort({ updated_at: -1 });
  res.json(normalizeMany(workspaces));
});

router.get("/workspaces/question/:questionId", async (req, res) => {
  const workspace = await CanvasWorkspace.findOne({
    user_id: req.user._id,
    question_id: req.params.questionId,
  });
  res.json(normalizeId(workspace));
});

router.put("/workspaces/question/:questionId", async (req, res) => {
  const question = await Question.findById(req.params.questionId).populate("quiz_id");
  if (!question) return res.status(404).json({ message: "Question not found" });

  const workspace = await CanvasWorkspace.findOneAndUpdate(
    { user_id: req.user._id, question_id: question._id },
    {
      $set: {
        quiz_id: question.quiz_id?._id ?? question.quiz_id,
        title: req.body.title || `Workspace: ${question.topic || "GATE question"}`,
        canvas_json: req.body.canvas_json,
        thumbnail: req.body.thumbnail,
      },
    },
    { new: true, upsert: true },
  );

  res.json(normalizeId(workspace));
});

router.get("/attempts", async (req, res) => {
  const attempts = await QuizAttempt.find({ user_id: req.user._id })
    .sort({ completed_at: -1 })
    .limit(Number(req.query.limit || 100));
  res.json(normalizeMany(attempts));
});

router.get("/activity/daily", async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days || 84)));
  const dateKeys = recentStudyDates(days);
  const start = dateKeys[0];
  const activity = await DailyActivity.find({
    user_id: req.user._id,
    date: { $gte: start },
  }).sort({ date: 1 });
  const attempts = await QuizAttempt.find({
    user_id: req.user._id,
    completed_at: { $gte: new Date(`${start}T00:00:00.000Z`) },
  }).select("completed_at");
  const byDate = new Map(activity.map((item) => [item.date, normalizeId(item)]));
  const attemptsByDate = attempts.reduce((acc, attempt) => {
    const key = studyDateString(attempt.completed_at);
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  res.json(
    dateKeys.map((date) => {
      const item = byDate.get(date);
      const attemptCount = attemptsByDate.get(date) || 0;
      const savedQuizAttempts = Number(item?.quiz_attempts || 0);
      const activityCount = item
        ? Number(item.login_count || 0) +
          savedQuizAttempts +
          Number(item.practice_saves || 0) +
          Number(item.tutor_messages || 0) +
          Number(item.generated_sets || 0)
        : attemptCount;
      const mergedCount = activityCount + Math.max(0, attemptCount - savedQuizAttempts);
      return {
        date,
        count: item ? Math.max(1, mergedCount) : mergedCount,
        login_count: item?.login_count || 0,
        quiz_attempts: Math.max(savedQuizAttempts, attemptCount),
        practice_saves: item?.practice_saves || 0,
        tutor_messages: item?.tutor_messages || 0,
        generated_sets: item?.generated_sets || 0,
        xp_earned: item?.xp_earned || 0,
      };
    }),
  );
});

router.post("/attempts", async (req, res) => {
  const attempt = await QuizAttempt.create({
    user_id: req.user._id,
    quiz_id: req.body.quiz_id,
    answers: req.body.answers,
    score: req.body.score,
    max_score: req.body.max_score,
    accuracy: req.body.accuracy,
    time_taken_seconds: req.body.time_taken_seconds,
    per_question: req.body.per_question,
    topic_breakdown: req.body.topic_breakdown,
    difficulty_used: req.body.difficulty_used,
  });

  const xpGain = Math.round(Number(req.body.score || 0) * 10);
  await touchUserActivity(req.user._id, { quizAttempt: true, xpGain });

  res.status(201).json(normalizeId(attempt));
});

router.get("/quiz-progress/:quizId", async (req, res) => {
  const progress = await QuizProgress.findOne({
    user_id: req.user._id,
    quiz_id: req.params.quizId,
  });
  res.json(normalizeId(progress));
});

router.put("/quiz-progress/:quizId", async (req, res) => {
  const progress = await QuizProgress.findOneAndUpdate(
    { user_id: req.user._id, quiz_id: req.params.quizId },
    {
      $set: {
        answers: req.body.answers || {},
        marked: Array.isArray(req.body.marked) ? req.body.marked : [],
        per_question: req.body.per_question || {},
        current_index: Number(req.body.current_index || 0),
        selected_subject: req.body.selected_subject || null,
        completed: !!req.body.completed,
      },
    },
    { new: true, upsert: true },
  );
  res.json(normalizeId(progress));
});

router.post("/quiz-progress/:quizId/clear-marked", async (req, res) => {
  const progress = await QuizProgress.findOneAndUpdate(
    { user_id: req.user._id, quiz_id: req.params.quizId },
    { $set: { marked: [] } },
    { new: true, upsert: true },
  );
  res.json(normalizeId(progress));
});

router.get("/saved-pdfs", async (req, res) => {
  const pdfs = await SavedPdf.find({ user_id: req.user._id })
    .select("-pdf_data")
    .sort({ updated_at: -1 })
    .limit(Number(req.query.limit || 50));
  res.json(normalizeMany(pdfs));
});

router.get("/saved-pdfs/:id", async (req, res) => {
  const pdf = await SavedPdf.findOne({ _id: req.params.id, user_id: req.user._id });
  if (!pdf) return res.status(404).json({ message: "Saved PDF not found" });
  res.json(normalizeId(pdf));
});

router.post("/saved-pdfs", async (req, res) => {
  const pdfData = String(req.body.pdf_data || "");
  if (!pdfData.startsWith("data:application/pdf")) {
    return res.status(400).json({ message: "PDF data is required." });
  }

  const pdf = await SavedPdf.create({
    user_id: req.user._id,
    quiz_id: req.body.quiz_id || null,
    title: String(req.body.title || "Saved practice PDF").slice(0, 160),
    scope: req.body.scope || "attempted",
    question_ids: Array.isArray(req.body.question_ids) ? req.body.question_ids : [],
    pdf_data: pdfData,
    size_bytes: Math.round((pdfData.length * 3) / 4),
  });
  res.status(201).json(normalizeId(pdf));
});

router.delete("/saved-pdfs/:id", async (req, res) => {
  await SavedPdf.deleteOne({ _id: req.params.id, user_id: req.user._id });
  res.json({ ok: true });
});

router.get("/recommendations", async (req, res) => {
  const recommendations = await Recommendation.find({ user_id: req.user._id, dismissed: false })
    .sort({ score: -1 })
    .limit(20);
  res.json(normalizeMany(recommendations));
});

router.get("/notifications", async (req, res) => {
  const notifications = await Notification.find({ user_id: req.user._id }).sort({ created_at: -1 });
  res.json(normalizeMany(notifications));
});

router.patch("/notifications/:id/read", async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user_id: req.user._id },
    { $set: { read: true } },
    { new: true },
  );
  res.json(normalizeId(notification));
});

router.get("/tutor/chats", async (req, res) => {
  const chats = await TutorChat.find({ user_id: req.user._id, archived: { $ne: true } })
    .sort({ updated_at: -1 })
    .limit(Number(req.query.limit || 50));
  res.json(normalizeMany(chats));
});

router.post("/tutor/chats", async (req, res) => {
  const messages = normalizeTutorMessages(req.body.messages || []);
  const chat = await TutorChat.create({
    user_id: req.user._id,
    title: makeTutorChatTitle(messages, req.body.title),
    messages,
  });
  res.status(201).json(normalizeId(chat));
});

router.patch("/tutor/chats/:id", async (req, res) => {
  const updates = {};
  if (req.body.title !== undefined) updates.title = String(req.body.title).slice(0, 80);
  if (req.body.messages !== undefined) {
    const messages = normalizeTutorMessages(req.body.messages);
    updates.messages = messages;
    if (!updates.title) updates.title = makeTutorChatTitle(messages);
  }
  if (req.body.archived !== undefined) updates.archived = !!req.body.archived;

  const chat = await TutorChat.findOneAndUpdate(
    { _id: req.params.id, user_id: req.user._id },
    { $set: updates },
    { new: true },
  );
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  res.json(normalizeId(chat));
});

router.delete("/tutor/chats/:id", async (req, res) => {
  await TutorChat.deleteOne({ _id: req.params.id, user_id: req.user._id });
  res.json({ ok: true });
});

router.post("/ai/tutor", async (req, res) => {
  const messages = normalizeTutorMessages(req.body.messages || []);
  const latest = messages.at(-1)?.content || "";
  const chatId = req.body.chat_id;

  if (!latest.trim()) {
    return res.status(400).json({ message: "Ask a study question first." });
  }

  const context = await buildTutorContext(req.user._id, latest);
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const inScope = await isStudyRelatedByGemini(geminiKey, messages);
      if (!inScope) {
        const content =
          "I can help only with studies and exam preparation here. Ask me about exams, courses, coding, aptitude, GATE, PSU, ISRO, BARC, placements, or academic concepts.";
        const followUps = [
          "Explain a study concept",
          "Ask a GATE or placement doubt",
          "Give me a practice question",
        ];
        const chat = await saveTutorChat(req.user._id, chatId, [
          ...messages,
          { role: "assistant", content, provider: "gemini", followUps },
        ]);
        return res.json({
          chat_id: chat.id,
          provider: "gemini",
          followUps,
          content,
        });
      }
      const { content, followUps } = await askGeminiTutor(geminiKey, messages, context);
      const chat = await saveTutorChat(req.user._id, chatId, [
        ...messages,
        { role: "assistant", content, provider: "gemini", followUps },
      ]);
      return res.json({ chat_id: chat.id, provider: "gemini", content, followUps });
    } catch (error) {
      console.error("Gemini tutor failed:", error.message, error.details || "");
      const content =
        "Gemini is configured but the request failed, so I am using the local study tutor for this answer.\n\n" +
        buildLocalTutorResponse(messages, context);
      const followUps = buildLocalFollowUps(latest);
      const chat = await saveTutorChat(req.user._id, chatId, [
        ...messages,
        { role: "assistant", content, provider: "local", followUps },
      ]);
      return res.json({
        chat_id: chat.id,
        provider: "local",
        debug: sanitizeGeminiError(error.details || error.message),
        followUps,
        content,
      });
    }
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    const content = buildLocalTutorResponse(messages, context);
    const followUps = buildLocalFollowUps(latest);
    const chat = await saveTutorChat(req.user._id, chatId, [
      ...messages,
      { role: "assistant", content, provider: "local", followUps },
    ]);
    return res.json({
      chat_id: chat.id,
      provider: "local",
      content,
      followUps,
    });
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: buildTutorSystemPrompt(context),
        },
        ...messages,
      ],
      temperature: 0.35,
    }),
  });

  if (!response.ok)
    return res.status(response.status).json({ message: `AI gateway error (${response.status})` });
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || "I had trouble responding. Try again?";
  const followUps = buildLocalFollowUps(latest);
  const chat = await saveTutorChat(req.user._id, chatId, [
    ...messages,
    { role: "assistant", content, provider: "lovable", followUps },
  ]);
  res.json({
    chat_id: chat.id,
    provider: "lovable",
    content,
    followUps,
  });
});

router.post("/ai/generate-questions", async (req, res) => {
  const file = req.body.file || {};
  const mimeType = String(file.mime_type || "");
  const data = String(file.data || "");
  const difficulty = String(req.body.difficulty || "mixed").toLowerCase();
  const questionType = String(req.body.question_type || "mixed").toLowerCase();
  const questionNature = String(req.body.question_nature || "mixed").toLowerCase();
  const count = Math.min(30, Math.max(3, Number(req.body.count || 12)));

  if (!data || !mimeType) {
    return res.status(400).json({ message: "Upload an image or PDF first." });
  }
  const supportedMimeTypes = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!supportedMimeTypes.includes(mimeType)) {
    return res.status(400).json({ message: "Only PDF, image, TXT, and DOCX files are supported." });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.json({
      provider: "local",
      extracted_text:
        "AI extraction is unavailable because Gemini is not configured. Upload content after configuring AI to extract exact text.",
      questions: buildLocalGeneratedQuestions(difficulty, questionType, questionNature, count),
    });
  }

  try {
    const generated = await askGeminiForGeneratedQuestions(geminiKey, {
      data,
      mimeType,
      difficulty,
      questionType,
      questionNature,
      count,
      fileName: String(file.name || "uploaded study material").slice(0, 120),
    });
    return res.json({ provider: "gemini", ...generated });
  } catch (error) {
    console.error("Gemini question generation failed:", error.message, error.details || "");
    return res.json({
      provider: "local",
      debug: sanitizeGeminiError(error.details || error.message),
      extracted_text:
        "Could not extract the uploaded content with Gemini. The questions below are placeholders so the UI flow remains testable.",
      questions: buildLocalGeneratedQuestions(difficulty, questionType, questionNature, count),
    });
  }
});

router.post("/ai/study-plan", async (req, res) => {
  const file = req.body.file || null;
  const options = {
    goal: String(req.body.goal || "GATE Exam").slice(0, 80),
    complexity: String(req.body.complexity || "Moderate").slice(0, 80),
    examDate: String(req.body.exam_date || "").slice(0, 40),
    hoursPerDay: Math.min(14, Math.max(1, Number(req.body.hours_per_day || 3))),
    currentLevel: String(req.body.current_level || "beginner").slice(0, 80),
    weakSubjects: Array.isArray(req.body.weak_subjects)
      ? req.body.weak_subjects.map((item) => String(item).slice(0, 80)).slice(0, 12)
      : [],
    languagePreference: String(req.body.language_preference || "English").slice(0, 120),
  };

  if (file?.data) {
    const supportedMimeTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
    if (!supportedMimeTypes.includes(String(file.mime_type || ""))) {
      return res.status(400).json({ message: "Only PDF, image, TXT, DOCX, and PPTX files are supported." });
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.json({ provider: "local", plan: buildLocalStudyPlan(options) });
  }

  try {
    const plan = await askGeminiStudyPlan(geminiKey, {
      ...options,
      file: file?.data
        ? {
            data: String(file.data),
            mimeType: String(file.mime_type || ""),
            fileName: String(file.name || "uploaded material").slice(0, 120),
          }
        : null,
    });
    return res.json({ provider: "gemini", plan });
  } catch (error) {
    console.error("Gemini study planner failed:", error.message, error.details || "");
    return res.json({
      provider: "local",
      debug: sanitizeGeminiError(error.details || error.message),
      plan: buildLocalStudyPlan(options),
    });
  }
});

router.post("/youtube/recommendations", async (req, res) => {
  const recommendations = buildYoutubeRecommendations(req.body || {});
  res.json(recommendations);
});

router.get("/youtube/search", async (req, res) => {
  const query = cleanStudyText(req.query.q, "study programming education").slice(0, 120);
  const videos = await searchYouTubeVideos(query || "study programming education");
  res.json(videos);
});

router.post("/ai/question-explanation", async (req, res) => {
  const question = await Question.findById(req.body.question_id);
  if (!question) return res.status(404).json({ message: "Question not found" });

  const userAnswer = req.body.answer;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.json({
      provider: "local",
      content: buildLocalQuestionExplanation(question, userAnswer),
    });
  }

  try {
    const content = await askGeminiQuestionExplanation(geminiKey, question, userAnswer);
    return res.json({ provider: "gemini", content });
  } catch (error) {
    console.error("Gemini question explanation failed:", error.message, error.details || "");
    return res.json({
      provider: "local",
      debug: sanitizeGeminiError(error.details || error.message),
      content: buildLocalQuestionExplanation(question, userAnswer),
    });
  }
});

async function askGeminiTutor(apiKey, messages, context) {
  const modelsToTry = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
  ].filter((model, index, models) => model && models.indexOf(model) === index);
  let lastError = null;

  for (const model of modelsToTry) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildTutorSystemPrompt(context) }],
          },
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1400,
          },
        }),
      },
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      lastError = Object.assign(new Error(`Gemini API error (${response.status})`), {
        status: response.status,
        details,
      });
      if (![429, 503].includes(response.status)) break;
      continue;
    }

    const json = await response.json();
    const text = json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    const content = text || "I had trouble generating a study answer. Try asking the doubt in a simpler way.";
    const followUps = await askGeminiFollowUps(apiKey, model, messages, content).catch(() =>
      buildLocalFollowUps(messages.at(-1)?.content || ""),
    );

    return { content, followUps };
  }

  throw lastError || new Error("Gemini API error");
}

async function askGeminiStudyPlan(apiKey, options) {
  const parts = [
    {
      text: [
        "You are the AI orchestration engine for an adaptive exam preparation platform.",
        "Analyze uploaded study material if present, then create a personalized study plan.",
        "The plan must change based on preparation mode.",
        "Semester mode: scoring quickly, repeated university questions, short notes, one-shot videos, derivations, most probable questions.",
        "GATE mode: deep concepts, standard textbook depth, PYQs, numerical practice, dependencies, spaced repetition, active recall.",
        "Last-minute mode: 80/20 high-yield summaries, formula sheets, quick revision, 2x friendly videos.",
        "Placement mode: aptitude, DSA roadmap, interview questions, coding patterns, company-style prep.",
        "Deep learning mode: prerequisites, concept graph, deeper resources, derivations, research-level extensions when requested.",
        "Use priority score = weightage * frequency * dependency * difficulty_gap. Use reasonable 1-10 estimates if exact data is not available.",
        "Recommend YouTube search paths, not random links. Include how videos should be ranked: transcript quality, semantic relevance, examples, PYQ coverage, clarity, language, speed, channel credibility, recency, low clickbait.",
        "Return only valid JSON. No markdown.",
        "JSON shape:",
        JSON.stringify(
          {
            title: "string",
            mode_strategy: "string",
            extracted_overview: "string",
            priority_topics: [
              {
                subject: "string",
                topic: "string",
                priority_score: 0,
                reason: "string",
                difficulty: "easy|medium|hard",
                concept_type: "theory|numerical|conceptual + numerical",
                estimated_hours: 1,
              },
            ],
            daily_plan: [{ day: "Day 1", focus: "string", tasks: ["string"], output: "string" }],
            weekly_milestones: ["string"],
            revision_schedule: ["string"],
            mock_test_schedule: ["string"],
            youtube_playlists: [
              {
                title: "string",
                purpose: "string",
                search_query: "string",
                ranking_reason: "string",
                preferred_style: "string",
              },
            ],
            generated_outputs: {
              summary_30_sec: "string",
              revision_5_min: ["string"],
              deep_learning_20_min: ["string"],
              formula_sheet: ["string"],
              flashcards: [{ front: "string", back: "string" }],
              quizzes: [{ question: "string", answer: "string", type: "MCQ|NAT|Viva|Short", difficulty: "easy|medium|hard" }],
            },
            adaptive_rules: ["string"],
            architecture_next_steps: ["string"],
          },
          null,
          2,
        ),
        "",
        "Learner settings:",
        JSON.stringify(
          {
            goal: options.goal,
            complexity: options.complexity,
            exam_date: options.examDate || "not provided",
            hours_per_day: options.hoursPerDay,
            current_level: options.currentLevel,
            weak_subjects: options.weakSubjects,
            language_preference: options.languagePreference,
            uploaded_file: options.file?.fileName || "none",
          },
          null,
          2,
        ),
      ].join("\n"),
    },
  ];

  if (options.file?.data && options.file?.mimeType) {
    parts.push({
      inlineData: {
        mimeType: options.file.mimeType,
        data: options.file.data,
      },
    });
  }

  const modelsToTry = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ].filter((model, index, models) => model && models.indexOf(model) === index);
  let lastError = null;

  for (const model of modelsToTry) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4500,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      lastError = Object.assign(new Error(`Gemini API error (${response.status})`), {
        status: response.status,
        details,
      });
      if (![429, 503].includes(response.status)) break;
      continue;
    }

    try {
      const json = await response.json();
      const raw = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (!raw) throw new Error(`Gemini returned an empty study plan with ${model}`);
      return normalizeStudyPlan(JSON.parse(raw), options);
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error("Gemini study planner failed");
}

function normalizeStudyPlan(plan, options) {
  const local = buildLocalStudyPlan(options);
  return {
    title: String(plan.title || local.title).slice(0, 160),
    mode_strategy: String(plan.mode_strategy || local.mode_strategy).slice(0, 1600),
    extracted_overview: String(plan.extracted_overview || local.extracted_overview).slice(0, 1600),
    priority_topics: normalizePlanArray(plan.priority_topics, local.priority_topics, 10),
    daily_plan: normalizePlanArray(plan.daily_plan, local.daily_plan, 14),
    weekly_milestones: normalizeStringArray(plan.weekly_milestones, local.weekly_milestones, 8),
    revision_schedule: normalizeStringArray(plan.revision_schedule, local.revision_schedule, 10),
    mock_test_schedule: normalizeStringArray(plan.mock_test_schedule, local.mock_test_schedule, 8),
    youtube_playlists: normalizePlanArray(plan.youtube_playlists, local.youtube_playlists, 8),
    generated_outputs: {
      summary_30_sec: String(
        plan.generated_outputs?.summary_30_sec || local.generated_outputs.summary_30_sec,
      ).slice(0, 900),
      revision_5_min: normalizeStringArray(
        plan.generated_outputs?.revision_5_min,
        local.generated_outputs.revision_5_min,
        8,
      ),
      deep_learning_20_min: normalizeStringArray(
        plan.generated_outputs?.deep_learning_20_min,
        local.generated_outputs.deep_learning_20_min,
        8,
      ),
      formula_sheet: normalizeStringArray(
        plan.generated_outputs?.formula_sheet,
        local.generated_outputs.formula_sheet,
        12,
      ),
      flashcards: normalizePlanArray(plan.generated_outputs?.flashcards, local.generated_outputs.flashcards, 10),
      quizzes: normalizePlanArray(plan.generated_outputs?.quizzes, local.generated_outputs.quizzes, 10),
    },
    adaptive_rules: normalizeStringArray(plan.adaptive_rules, local.adaptive_rules, 10),
    architecture_next_steps: normalizeStringArray(
      plan.architecture_next_steps,
      local.architecture_next_steps,
      12,
    ),
  };
}

function normalizePlanArray(value, fallback, limit) {
  return (Array.isArray(value) && value.length ? value : fallback).slice(0, limit);
}

function normalizeStringArray(value, fallback, limit) {
  return (Array.isArray(value) && value.length ? value : fallback)
    .map((item) => String(item).slice(0, 500))
    .slice(0, limit);
}

function buildLocalStudyPlan(options) {
  const mode = String(options.goal || "GATE Exam");
  const weak = options.weakSubjects?.length ? options.weakSubjects : ["Operating Systems", "DBMS", "Aptitude"];
  const horizon = options.examDate ? `until ${options.examDate}` : "for the next 14 days";
  const modeProfiles = {
    "Semester Exams": {
      strategy:
        "Score-first mode: prioritize repeated questions, short notes, derivations, diagrams, and one-shot revision. Avoid unnecessary depth unless it directly improves marks.",
      resourceStyle: "one-shot university exam revision, solved previous questions, short derivation videos",
    },
    "GATE Exam": {
      strategy:
        "Depth-first mode: build prerequisite concepts, solve PYQs, practice numericals, use spaced repetition, and gradually increase difficulty.",
      resourceStyle: "GATE standard lectures, PYQ solving sessions, concept + numerical playlists",
    },
    "Placement Preparation": {
      strategy:
        "Pattern-first mode: mix aptitude speed, DSA patterns, coding drills, interview questions, and company-style mock tests.",
      resourceStyle: "aptitude shortcuts, DSA pattern playlists, interview problem walkthroughs",
    },
    "Last-Minute Revision": {
      strategy:
        "High-yield mode: use 80/20 topics, formula sheets, quick revision videos, and short tests. Skip low-probability deep dives.",
      resourceStyle: "2x playback revision, formula marathon, most expected questions",
    },
    "Deep Concept Learning": {
      strategy:
        "Concept mastery mode: learn prerequisites, derivations, visual intuition, textbook-level depth, and hard practice.",
      resourceStyle: "long-form concept lectures, visual explainers, advanced problem solving",
    },
  };
  const profile = modeProfiles[mode] || {
    strategy:
      "Exam-focused mode: identify scoring topics, revise repeatedly asked concepts, practice timed questions, and track weak areas.",
    resourceStyle: "exam-oriented lectures, solved examples, quick revision playlists",
  };

  return {
    title: `${mode} adaptive plan ${horizon}`,
    mode_strategy: profile.strategy,
    extracted_overview:
      "Upload processing will extract subjects, topics, formulas, definitions, numerical patterns, PYQs, and repeated concepts. This local plan uses your selected goal and weak subjects until Gemini/vector extraction is available.",
    priority_topics: weak.map((subject, index) => ({
      subject,
      topic: index === 0 ? "Core weak-area repair" : `${subject} high-yield concepts`,
      priority_score: Math.max(40, 90 - index * 10),
      reason: `Priority = weightage x frequency x dependency x difficulty gap. ${subject} was selected as weak or important.`,
      difficulty: index === 0 ? "medium" : "easy",
      concept_type: mode.includes("GATE") ? "conceptual + numerical" : "theory",
      estimated_hours: Math.max(1, Math.round(Number(options.hoursPerDay || 3) * 0.8)),
    })),
    daily_plan: Array.from({ length: 7 }, (_, index) => ({
      day: `Day ${index + 1}`,
      focus: index % 3 === 0 ? "Concept repair" : index % 3 === 1 ? "Practice + PYQ" : "Revision + testing",
      tasks: [
        `Study ${weak[index % weak.length]} for ${options.hoursPerDay} hour(s) split into concept, examples, and recall.`,
        "Create short notes or flashcards immediately after study.",
        "Solve a small timed quiz and mark weak questions.",
      ],
      output: index % 2 === 0 ? "Revision sheet + 10 questions" : "PYQ pattern notes + error log",
    })),
    weekly_milestones: [
      "Finish one full weak subject pass with notes.",
      "Complete topic-wise practice and mark repeated mistakes.",
      "Attempt one mixed mock and update weak-topic ranking.",
    ],
    revision_schedule: [
      "Revise new topics after 24 hours.",
      "Revise weak formulas every third day.",
      "Run active recall before watching another lecture.",
      "Keep a last-page mistake notebook for final revision.",
    ],
    mock_test_schedule: [
      "Mini quiz after each topic block.",
      "One sectional test after every two weak topics.",
      "One mixed mock at the end of the week.",
    ],
    youtube_playlists: weak.map((subject) => ({
      title: `${subject} ${mode} optimized playlist`,
      purpose: `Find videos matching ${mode} and ${options.complexity} depth.`,
      search_query: `${subject} ${mode} ${profile.resourceStyle}`,
      ranking_reason:
        "Rank by semantic relevance, transcript quality, solved examples, clarity, exam specificity, language match, low clickbait, and playlist completeness.",
      preferred_style: options.languagePreference || "clear, exam-oriented, example-heavy",
    })),
    generated_outputs: {
      summary_30_sec: `${mode}: focus on ${weak.join(", ")} using ${profile.strategy}`,
      revision_5_min: weak.map((subject) => `Write definitions, formulas, common traps, and 3 PYQ patterns for ${subject}.`),
      deep_learning_20_min: weak.map((subject) => `Build prerequisite map, solve 2 examples, then explain ${subject} aloud.`),
      formula_sheet: ["Priority score = weightage x frequency x dependency x difficulty_gap"],
      flashcards: weak.map((subject) => ({
        front: `What is the fastest way to improve ${subject}?`,
        back: "Prerequisite repair + solved examples + timed PYQ practice + mistake review.",
      })),
      quizzes: weak.map((subject) => ({
        question: `Name one high-yield topic and one common mistake in ${subject}.`,
        answer: "Use uploaded material/PYQ analysis to fill this, then verify with practice.",
        type: "Short",
        difficulty: "medium",
      })),
    },
    adaptive_rules: [
      "If quiz accuracy is below 60%, reduce complexity and add prerequisites.",
      "If time per question is high, recommend solved-example videos and timed drills.",
      "If revision is skipped, move the topic into the next day's first block.",
      "If accuracy is above 85%, increase difficulty and add mixed questions.",
    ],
    architecture_next_steps: [
      "Add OCR/layout parser service for PDFs, scans, handwriting, formulas, and diagrams.",
      "Store semantic chunks in Qdrant/Pinecone/Weaviate with metadata for subject/topic/weightage.",
      "Add YouTube API + transcript collector + reranker service.",
      "Use Whisper ASR when transcripts are unavailable.",
      "Track video completion, quiz scores, skipped concepts, bookmarks, and revision frequency.",
      "Use hybrid search + reranking for RAG answers and resource recommendations.",
    ],
  };
}

async function askGeminiQuestionExplanation(apiKey, question, userAnswer) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "You are an exam review tutor. Explain the question after a student attempt. Be concise, exam-focused, and include why the correct answer is correct, why the user's answer is right or wrong, and one memory tip.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify(
                  {
                    question: question.question_text,
                    type: question.question_type,
                    options: question.options,
                    user_answer: userAnswer,
                    correct_answer: question.correct_answer,
                    subject: question.subject,
                    topic: question.topic,
                    source: [question.source_exam, question.source_year].filter(Boolean).join(" "),
                    existing_explanation: question.explanation || question.concept_notes,
                  },
                  null,
                  2,
                ),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 900,
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw Object.assign(new Error(`Gemini API error (${response.status})`), { details });
  }
  const json = await response.json();
  return (
    json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || buildLocalQuestionExplanation(question, userAnswer)
  );
}

function buildLocalQuestionExplanation(question, userAnswer) {
  return [
    `Correct answer: ${formatTutorAnswer(question.correct_answer, question.options)}`,
    `Your answer: ${formatTutorAnswer(userAnswer, question.options)}`,
    question.explanation || question.concept_notes || "A detailed AI explanation is not available right now.",
    "Tip: revise the core concept, then solve one similar question without checking the answer first.",
  ].join("\n\n");
}

async function askGeminiForGeneratedQuestions(apiKey, options) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "You are an exam question generator for uploaded study material, homework, handwritten notes, and PDFs.",
                  "Read the uploaded file carefully. If handwritten, infer the text as accurately as possible.",
                  "First extract the important readable content. Then generate questions strictly from that extracted content.",
                  `Generate ${options.count} questions.`,
                  `Difficulty focus: ${options.difficulty}. Include easy, medium, important, and hard labels when mixed.`,
                  `Question type focus: ${options.questionType}. Use MCQ, MSQ, NAT, and short-answer where useful when mixed.`,
                  `Question nature focus: ${options.questionNature}.`,
                  "If difficulty focus is not mixed, every question must use exactly that difficulty.",
                  "If question type focus is not mixed, every question must use exactly that question_type.",
                  "If question nature focus is numeric or theory, every question must follow exactly that nature.",
                  "If question nature is numeric, generate GATE-level calculation questions with formulas, numerical values, NAT-style answers where possible, and step-based explanations. Do not make shallow definition questions.",
                  "If question nature is theory, generate conceptual, reasoning, comparison, definition, and application questions with clear explanations.",
                  "If question nature is mixed, include both theory and numerical questions when the uploaded content supports it.",
                  "Return only valid JSON. No markdown.",
                  "JSON shape: {\"extracted_text\":\"short clean extraction of the uploaded content\",\"questions\":[{\"question_text\":\"...\",\"question_type\":\"mcq|msq|nat|short\",\"question_nature\":\"numeric|theory\",\"difficulty\":\"easy|medium|important|hard\",\"options\":[\"...\"],\"correct_answer\":\"...\",\"explanation\":\"...\",\"topic\":\"...\"}]}",
                  `File name: ${options.fileName}`,
                ].join("\n"),
              },
              {
                inlineData: {
                  mimeType: options.mimeType,
                  data: options.data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 5000,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw Object.assign(new Error(`Gemini API error (${response.status})`), { details });
  }

  const json = await response.json();
  const raw = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  const parsed = JSON.parse(raw || "{}");
  const questions = normalizeGeneratedQuestions(parsed.questions || [], options).slice(0, options.count);
  while (questions.length < options.count) {
    questions.push(
      buildLocalGeneratedQuestions(
        options.difficulty,
        options.questionType,
        options.questionNature,
        1,
        questions.length,
      )[0],
    );
  }
  return {
    extracted_text: String(parsed.extracted_text || "").slice(0, 8000),
    question_sets: groupGeneratedQuestions(questions),
    questions,
  };
}

function normalizeGeneratedQuestions(questions, options = {}) {
  const requestedType = normalizeRequestedValue(options.questionType, ["mcq", "msq", "nat", "short"]);
  const requestedDifficulty = normalizeRequestedValue(options.difficulty, [
    "easy",
    "medium",
    "important",
    "hard",
  ]);
  const requestedNature = normalizeRequestedValue(options.questionNature, ["numeric", "theory"]);

  return (Array.isArray(questions) ? questions : [])
    .map((question, index) => {
      const questionType =
        requestedType ||
        (["mcq", "msq", "nat", "short"].includes(question.question_type)
        ? question.question_type
        : "short");
      const difficulty =
        requestedDifficulty ||
        (["easy", "medium", "important", "hard"].includes(question.difficulty)
        ? question.difficulty
        : "medium");
      const questionNature =
        requestedNature || inferGeneratedQuestionNature(question, questionType);
      const rawOptions = Array.isArray(question.options)
        ? question.options.map((option) => String(option).slice(0, 300)).filter(Boolean).slice(0, 6)
        : [];
      const optionsForType =
        questionType === "mcq" || questionType === "msq"
          ? rawOptions.length >= 2
            ? rawOptions
            : makeFallbackOptions(questionNature, index)
          : [];

      return {
        question_text: String(question.question_text || "").slice(0, 1200),
        question_type: questionType,
        question_nature: questionNature,
        difficulty,
        options: optionsForType,
        correct_answer: String(question.correct_answer || optionsForType[0] || "Not available").slice(0, 500),
        explanation: String(question.explanation || "Review the uploaded content for the key idea.").slice(0, 1200),
        topic: String(question.topic || "Uploaded material").slice(0, 120),
      };
    })
    .filter((question) => question.question_text);
}

function normalizeRequestedValue(value, allowed) {
  const normalized = String(value || "mixed").toLowerCase();
  return normalized === "mixed" ? null : allowed.includes(normalized) ? normalized : null;
}

function inferGeneratedQuestionNature(question, questionType) {
  if (["numeric", "theory"].includes(question.question_nature)) return question.question_nature;
  if (questionType === "nat") return "numeric";
  const text = `${question.question_text || ""} ${question.correct_answer || ""}`.toLowerCase();
  return /\b(calculate|compute|find|value|formula|numerical|ratio|probability|time|rate|bits?|bytes?)\b/.test(text)
    ? "numeric"
    : "theory";
}

function makeFallbackOptions(questionNature, index) {
  if (questionNature === "numeric") {
    const base = 10 + index;
    return [String(base), String(base + 2), String(base + 4), String(base + 6)];
  }
  return ["Core concept", "Related property", "Common misconception", "Unrelated detail"];
}

function buildLocalGeneratedQuestions(difficulty, questionType, questionNature, count, startIndex = 0) {
  const labels =
    difficulty === "mixed" ? ["easy", "medium", "important", "hard"] : [difficulty || "medium"];
  const types = questionType === "mixed"
    ? questionNature === "numeric"
      ? ["nat", "mcq"]
      : questionNature === "theory"
        ? ["short", "mcq", "msq"]
        : ["mcq", "short", "nat", "msq"]
    : [questionType || "short"];
  return Array.from({ length: count }, (_, localIndex) => {
    const index = startIndex + localIndex;
    const type = types[index % types.length];
    const level = labels[index % labels.length];
    const numeric = questionNature === "numeric" || type === "nat";
    return {
      question_text: numeric
        ? `Generated ${level} GATE-level numerical question ${index + 1}: use a formula from the uploaded material and compute the required value.`
        : `Generated ${level} theory question ${index + 1}: identify and explain one key concept from the uploaded material.`,
      question_type: type,
      question_nature: numeric ? "numeric" : "theory",
      difficulty: level,
      options: type === "mcq" || type === "msq" ? makeFallbackOptions(numeric ? "numeric" : "theory", index) : [],
      correct_answer:
        type === "mcq" || type === "msq"
          ? makeFallbackOptions(numeric ? "numeric" : "theory", index)[0]
          : numeric
            ? "A numerical value derived from the formula"
            : "Answer based on the uploaded concept.",
      explanation:
        "Gemini was unavailable, so this is a placeholder structure. Try again when the AI request succeeds for content-specific questions.",
      topic: "Uploaded material",
    };
  });
}

function groupGeneratedQuestions(questions) {
  return ["easy", "medium", "important", "hard"].reduce((acc, level) => {
    acc[level] = questions.filter((question) => question.difficulty === level);
    return acc;
  }, {});
}

async function isStudyRelatedByGemini(apiKey, messages) {
  const latest = messages.at(-1)?.content || "";
  const recent = messages
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "Classify whether the latest user message is allowed for a study tutor. Allowed: academic learning, school/college subjects, exams, courses, coding, math, science, engineering, aptitude, GATE, PSU, ISRO, BARC, placements, career prep, or follow-ups to those. Disallowed: romance, entertainment chat, politics, adult content, personal gossip, illegal harm, or unrelated casual talk. Return only ALLOW or BLOCK.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: `Recent chat:\n${recent}\n\nLatest message:\n${latest}` }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8,
          },
        }),
      },
    );

    if (!response.ok) return true;
    const json = await response.json();
    const verdict = json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim()
      .toUpperCase();
    return verdict !== "BLOCK";
  } catch {
    return true;
  }
}

async function askGeminiFollowUps(apiKey, model, messages, answer) {
  const latest = messages.at(-1)?.content || "";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "Generate follow-up questions for a study tutor UI. Return exactly 4 lines. Each line must be one short natural next question the learner may ask. Keep them specific to the current topic and answer. Do not use JSON, numbering, bullets, markdown, quotes, or explanations.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Learner asked: ${latest}\n\nTutor answered:\n${answer}\n\nGenerate exactly 4 useful follow-up questions as plain lines.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 180,
        },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini follow-up error (${response.status})`);
  const json = await response.json();
  const raw = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  return ensureFollowUps(parseFollowUps(raw), latest);
}

function parseFollowUps(raw) {
  const cleaned = String(raw || "")
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map(cleanFollowUp).filter(Boolean).slice(0, 4);
    }
  } catch {}

  const quoted = [...cleaned.matchAll(/"([^"]{8,160})"/g)]
    .map((match) => cleanFollowUp(match[1]))
    .filter(Boolean)
    .slice(0, 4);
  if (quoted.length > 0) return quoted;

  const lineItems = cleaned
    .split(/\n+/)
    .map((line) =>
      cleanFollowUp(line
        .replace(/^[-*\d.)\s[\]",]+/, "")
        .replace(/[",\]]+$/, "")
        .trim()),
    )
    .filter((line) => line.length > 8 && !["[", "]"].includes(line))
    .slice(0, 4);
  return lineItems.length > 0 ? lineItems : buildLocalFollowUps("");
}

function cleanFollowUp(value) {
  const cleaned = String(value || "")
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  if (cleaned.length < 8) return "";
  return /[?.!]$/.test(cleaned) ? cleaned : `${cleaned}?`;
}

function ensureFollowUps(items, latest) {
  const combined = [...(items || []), ...buildLocalFollowUps(latest)]
    .map(cleanFollowUp)
    .filter(Boolean);
  const seen = new Set();
  return combined
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function buildLocalFollowUps(latest) {
  const value = String(latest || "").toLowerCase();
  if (value.includes("fcfs") || value.includes("first come first serve")) {
    return [
      "Can you solve one FCFS scheduling example?",
      "How do we calculate average waiting time in FCFS?",
      "What is convoy effect in FCFS?",
      "Compare FCFS with SJF and Round Robin.",
    ];
  }
  if (value.includes("serial")) {
    return [
      "How do I draw a precedence graph?",
      "Conflict vs view serializability in a table",
      "Give one solved serializability schedule",
      "What mistakes happen in conflict serializability?",
    ];
  }
  if (value.includes("ipv4") || value.includes("ipv6")) {
    return [
      "Why did IPv6 replace IPv4?",
      "IPv4 vs IPv6 in a table",
      "Give me subnetting practice questions",
      "Explain NAT with an example",
    ];
  }
  if (value.includes("regression")) {
    return [
      "What is the difference between linear and logistic regression?",
      "How is the regression line calculated?",
      "What are residuals in regression analysis?",
      "Give me one simple regression example with numbers.",
    ];
  }
  if (value.includes("logic") || value.includes("gate") || value.includes("boolean")) {
    return [
      "Can you explain truth tables for logic gates?",
      "What is the difference between XOR and OR gates?",
      "Give me a GATE-style logic gates question.",
      "How are NAND and NOR gates universal gates?",
    ];
  }
  return [
    "Explain this with a simple example",
    "Give me a GATE-style question on this",
    "What common mistakes should I avoid?",
    "Make a short revision note for this",
  ];
}

function sanitizeGeminiError(value) {
  return String(value || "")
    .replace(process.env.GEMINI_API_KEY || "", "[redacted]")
    .slice(0, 500);
}

function pick(source, keys) {
  return keys.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function findUserStudyRoom(roomId, userId) {
  return StudyRoom.findOne({ _id: roomId, "members.user_id": userId });
}

async function searchYouTubeVideos(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    const params = new URLSearchParams({
      part: "snippet",
      maxResults: "16",
      q: query,
      type: "video",
      videoEmbeddable: "true",
      key: apiKey,
    });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!response.ok) throw new Error(`YouTube API search failed (${response.status})`);
    const payload = await response.json();
    return (payload.items || [])
      .map((item) => ({
        id: item.id?.videoId,
        title: item.snippet?.title || "YouTube video",
        channel: item.snippet?.channelTitle || "YouTube",
        views: "",
        age: item.snippet?.publishedAt ? timeAgo(item.snippet.publishedAt) : "",
        duration: "",
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || "",
      }))
      .filter((item) => item.id);
  }

  const params = new URLSearchParams({ search_query: query });
  const response = await fetch(`https://www.youtube.com/results?${params}`, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`YouTube search failed (${response.status})`);
  const html = await response.text();
  const match = html.match(/var ytInitialData = (.*?);<\/script>/s) || html.match(/ytInitialData"\]\s*=\s*(.*?);/s);
  if (!match?.[1]) return [];

  const initialData = JSON.parse(match[1]);
  const renderers = [];
  collectVideoRenderers(initialData, renderers);

  const seen = new Set();
  return renderers
    .map((renderer) => normalizeYouTubeRenderer(renderer))
    .filter((video) => {
      if (!video.id || seen.has(video.id)) return false;
      seen.add(video.id);
      return true;
    })
    .slice(0, 16);
}

function collectVideoRenderers(value, output) {
  if (!value || output.length >= 40) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectVideoRenderers(item, output));
    return;
  }
  if (typeof value !== "object") return;
  if (value.videoRenderer?.videoId) output.push(value.videoRenderer);
  Object.values(value).forEach((item) => collectVideoRenderers(item, output));
}

function normalizeYouTubeRenderer(renderer) {
  const id = renderer.videoId;
  return {
    id,
    title: youtubeText(renderer.title) || "YouTube video",
    channel: youtubeText(renderer.ownerText) || youtubeText(renderer.longBylineText) || "YouTube",
    views: youtubeText(renderer.viewCountText),
    age: youtubeText(renderer.publishedTimeText),
    duration: youtubeText(renderer.lengthText),
    thumbnail:
      renderer.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ||
      (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ""),
  };
}

function youtubeText(value) {
  if (!value) return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("").trim();
  return "";
}

function timeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const found = units.find(([, size]) => seconds >= size);
  if (!found) return "just now";
  const [unit, size] = found;
  const amount = Math.floor(seconds / Number(size));
  return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

async function uniqueInviteCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = `STUDY-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.round(
      1000 + Math.random() * 8999,
    )}`;
    const exists = await StudyRoom.exists({ invite_code: code });
    if (!exists) return code;
  }
  return `STUDY-${Date.now().toString(36).toUpperCase()}`;
}

function cleanStudyText(value, fallback) {
  return String(value ?? fallback ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function normalizeStudyRoomAttachments(value) {
  if (!Array.isArray(value)) return [];

  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/webp",
  ];

  return value
    .slice(0, 3)
    .map((file) => {
      const type = cleanStudyText(file?.type, "").slice(0, 160);
      const size = Math.min(Number(file?.size || 0), 6 * 1024 * 1024);
      const dataUrl = String(file?.data_url || "");
      return {
        name: cleanStudyText(file?.name, "study-file").slice(0, 180),
        mime_type: type,
        type,
        size,
        data_url:
          allowedTypes.includes(type) && dataUrl.startsWith("data:") && dataUrl.length <= 9_000_000
            ? dataUrl
            : "",
      };
    })
    .filter((file) => file.name && file.data_url);
}

function isStudyFocusedMessage(text) {
  const value = normalizeStudyText(text);
  const allowedTerms = [
    "gate",
    "study",
    "exam",
    "question",
    "solve",
    "doubt",
    "topic",
    "subject",
    "mock",
    "test",
    "quiz",
    "pyq",
    "formula",
    "concept",
    "revision",
    "notes",
    "syllabus",
    "placement",
    "interview",
    "viva",
    "algorithm",
    "dbms",
    "os",
    "network",
    "math",
    "coa",
    "toc",
    "compiler",
    "aptitude",
    "focus",
    "pomodoro",
    "answer",
    "explain",
    "step",
    "derive",
    "numerical",
    "practice",
    "timer",
    "let us",
    "let's",
  ];
  if (value.length < 4) return true;
  return allowedTerms.some((term) => value.includes(term));
}

export default router;

function normalizeTutorMessages(messages) {
  return messages
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .slice(-30)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, 2000),
      ...(message.provider ? { provider: String(message.provider).slice(0, 40) } : {}),
      ...(Array.isArray(message.followUps)
        ? { followUps: message.followUps.map((item) => String(item).slice(0, 160)).slice(0, 6) }
        : {}),
    }));
}

async function saveTutorChat(userId, chatId, messages) {
  const safeMessages = normalizeTutorMessages(messages);
  const title = makeTutorChatTitle(safeMessages);
  if (chatId) {
    const updated = await TutorChat.findOneAndUpdate(
      { _id: chatId, user_id: userId },
      { $set: { messages: safeMessages, title, archived: false } },
      { new: true },
    );
    if (updated) return normalizeId(updated);
  }

  const created = await TutorChat.create({
    user_id: userId,
    title,
    messages: safeMessages,
  });
  return normalizeId(created);
}

function makeTutorChatTitle(messages, fallback) {
  if (fallback) return String(fallback).slice(0, 80);
  const firstUser = messages.find((message) => message.role === "user")?.content;
  const raw = firstUser || "New chat";
  return raw.replace(/\s+/g, " ").trim().slice(0, 64) || "New chat";
}

function isStudyRelated(text, conversationText = text) {
  const value = normalizeStudyText(text);
  const fullValue = normalizeStudyText(conversationText);
  const studyTerms = [
    "gate",
    "cse",
    "cs",
    "exam",
    "study",
    "syllabus",
    "question",
    "answer",
    "explain",
    "concept",
    "topic",
    "mock",
    "test",
    "quiz",
    "question paper",
    "previous year",
    "pyq",
    "placement",
    "tcs",
    "nqt",
    "infosys",
    "infytq",
    "wipro",
    "accenture",
    "cognizant",
    "capgemini",
    "isro",
    "barc",
    "psu",
    "aptitude",
    "reasoning",
    "verbal",
    "coding",
    "programming",
    "algorithm",
    "data structure",
    "dbms",
    "database",
    "transaction",
    "transactions",
    "serializability",
    "serializable",
    "conflict serializability",
    "view serializability",
    "schedule",
    "precedence graph",
    "recoverability",
    "recoverable",
    "cascading rollback",
    "acid",
    "normalization",
    "normal form",
    "functional dependency",
    "operating system",
    "os",
    "deadlock",
    "starvation",
    "semaphore",
    "mutex",
    "process",
    "thread",
    "scheduler",
    "scheduling",
    "paging",
    "segmentation",
    "memory management",
    "network",
    "ipv4",
    "ipv6",
    "ip address",
    "subnet",
    "subnetting",
    "tcp",
    "udp",
    "osi",
    "tcp/ip",
    "dns",
    "dhcp",
    "routing",
    "router",
    "switch",
    "mac address",
    "protocol",
    "cable",
    "twisted pair",
    "coaxial",
    "fiber",
    "ethernet",
    "utp",
    "stp",
    "transmission media",
    "coa",
    "computer organization",
    "digital logic",
    "logic gate",
    "logic gates",
    "propositional logic",
    "proposition",
    "propositions",
    "predicate logic",
    "truth table",
    "boolean",
    "boolean algebra",
    "and gate",
    "or gate",
    "not gate",
    "nand",
    "nor",
    "xor",
    "xnor",
    "combinational",
    "sequential circuit",
    "flip flop",
    "k map",
    "karnaugh",
    "toc",
    "compiler",
    "mathematics",
    "probability",
    "linear algebra",
    "discrete",
    "calculus",
  ];
  const socialOnly = /^(hi|hello|hey|hii|namaste|thanks|thank you|ok|okay)[\s!.?]*$/i.test(text.trim());
  const followUpTerms = [
    "this",
    "that",
    "it",
    "issue",
    "solve",
    "tackle",
    "handle",
    "approach",
    "why",
    "how",
    "vs",
    "versus",
    "difference",
    "compare",
    "comparison",
    "tabular",
    "table",
    "mistake",
    "mistakes",
    "trap",
    "traps",
    "follow up",
    "previous",
    "same topic",
    "revision",
    "note",
    "drill",
    "example",
    "practice",
    "one by one",
  ];
  const isFollowUp = followUpTerms.some((term) => value.includes(term));
  const currentIsStudy = studyTerms.some((term) => value.includes(term));
  const conversationIsStudy = studyTerms.some((term) => fullValue.includes(term));
  return socialOnly || currentIsStudy || (isFollowUp && conversationIsStudy);
}

function normalizeStudyText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\bpropsitional\b/g, "propositional")
    .replace(/\bpropositional\s+logic\s+gates\b/g, "propositional logic logic gates")
    .replace(/\bfrist\b/g, "first")
    .replace(/\bserve\b/g, "serve");
}

async function buildTutorContext(userId, latest) {
  const terms = extractSearchTerms(latest);
  const regexes = terms.slice(0, 8).map((term) => new RegExp(escapeRegExp(term), "i"));
  const questionFilter =
    regexes.length > 0
      ? {
          $or: [
            { question_text: { $in: regexes } },
            { subject: { $in: regexes } },
            { topic: { $in: regexes } },
            { subtopic: { $in: regexes } },
            { tags: { $in: regexes } },
          ],
        }
      : {};

  const [profile, attempts, courses, questions] = await Promise.all([
    Profile.findOne({ user_id: userId }).lean(),
    QuizAttempt.find({ user_id: userId }).sort({ completed_at: -1 }).limit(5).lean(),
    Course.find({ published: true }).select("title description category tags").limit(8).lean(),
    Question.find(questionFilter)
      .select("question_text question_type options correct_answer explanation subject topic subtopic tags concept_notes difficulty source_exam source_year")
      .limit(8)
      .lean(),
  ]);

  return { profile, attempts, courses, questions };
}

function buildTutorSystemPrompt(context) {
  return [
    "You are AdaptiveAI, a focused study tutor inside an exam-prep platform.",
    "Scope: answer only study, exam, course, coding, aptitude, GATE, PSU, ISRO, BARC, and placement-prep questions.",
    "If the user asks for unrelated entertainment, personal, political, adult, or general chat, politely refuse and redirect to studies.",
    "Do not claim to be human. Do not answer outside the learning scope.",
    "Use the platform context when relevant. If context is insufficient, say so and give a useful study method or next practice step.",
    "Prefer concise, structured answers with steps, formulas, examples, and a short practice suggestion.",
    "For question explanations, include why the correct option is correct and why common wrong options fail.",
    "Answer the learner directly. Do not describe the user's intent, do not say 'The user is asking', and do not mention internal platform context unless it directly helps the answer.",
    "",
    "Platform context:",
    JSON.stringify(compactTutorContext(context), null, 2),
  ].join("\n");
}

function compactTutorContext(context) {
  return {
    learner: context.profile
      ? {
          name: context.profile.display_name,
          xp: context.profile.xp,
          streak_days: context.profile.streak_days,
          daily_goal_minutes: context.profile.daily_goal_minutes,
        }
      : null,
    recent_attempts: (context.attempts || []).map((attempt) => ({
      score: attempt.score,
      max_score: attempt.max_score,
      accuracy: attempt.accuracy,
      topic_breakdown: attempt.topic_breakdown,
    })),
    courses: (context.courses || []).map((course) => ({
      title: course.title,
      category: course.category,
      tags: course.tags,
      description: course.description,
    })),
    related_questions: (context.questions || []).map((question) => ({
      question: question.question_text,
      type: question.question_type,
      options: question.options,
      correct_answer: question.correct_answer,
      explanation: question.explanation,
      subject: question.subject,
      topic: question.topic,
      subtopic: question.subtopic,
      concept_notes: question.concept_notes,
      difficulty: question.difficulty,
      source: [question.source_exam, question.source_year].filter(Boolean).join(" "),
    })),
  };
}

function extractSearchTerms(text) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "what",
    "why",
    "how",
    "give",
    "tell",
    "explain",
    "please",
    "about",
    "from",
    "have",
    "need",
  ]);
  return [...new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) || [])]
    .filter((term) => term.length > 2 && !stopWords.has(term))
    .slice(0, 12);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLocalTutorResponse(messages, context = {}) {
  const lastRaw = String(messages.at(-1)?.content || "");
  const last = lastRaw.toLowerCase();
  const concept = findLocalConcept(last);
  const catalog = [
    {
      keys: ["tcs", "nqt"],
      title: "TCS NQT",
      syllabus:
        "Quantitative aptitude, logical reasoning, verbal ability, programming logic, coding basics, and interview communication.",
      plan: "Start with percentages, time-work, series, arrangements, grammar, arrays, strings, and one timed mixed quiz daily.",
    },
    {
      keys: ["infosys", "infytq"],
      title: "Infosys",
      syllabus:
        "Mathematical ability, analytical puzzles, pseudo-code tracing, programming fundamentals, OOP, DBMS, and HR communication.",
      plan: "Practice pseudo-code output questions, probability, arrangements, project explanation, and short coding drills.",
    },
    {
      keys: ["gate", "cse", "cs"],
      title: "GATE CSE",
      syllabus:
        "Engineering mathematics, discrete math, programming, DSA, algorithms, TOC, compiler design, OS, DBMS, CN, and COA.",
      plan: "Revise one core subject at a time, solve previous-year style questions, and track weak topics after every test.",
    },
    {
      keys: ["isro"],
      title: "ISRO Scientist/Engineer CS",
      syllabus:
        "Digital logic, COA, OS, DBMS, networks, software engineering, data structures, algorithms, and programming fundamentals.",
      plan: "Focus on fast technical recall, formula-level clarity, and mixed CS questions under strict time limits.",
    },
    {
      keys: ["barc", "oces", "dgfs"],
      title: "BARC OCES/DGFS CS",
      syllabus:
        "Algorithms, data structures, OS, DBMS, computer networks, architecture, programming, and numerical CS fundamentals.",
      plan: "Build speed with mixed-topic drills and revise DBMS, OS, algorithms, and networks repeatedly.",
    },
    {
      keys: ["wipro", "accenture", "cognizant", "capgemini", "hcl", "tech mahindra"],
      title: "Mass recruiter placement exams",
      syllabus:
        "Aptitude, reasoning, verbal ability, coding basics, communication, email writing, and interview fundamentals.",
      plan: "Prepare common aptitude first, then coding patterns, then company-specific mock tests.",
    },
  ];

  const match = catalog.find((item) => item.keys.some((key) => last.includes(key)));
  const relatedQuestion = context.questions?.[0];

  if (concept) {
    const table = concept.table ? `\n\n${formatMarkdownTable(concept.table)}` : "";
    return `${concept.title}\n\n${concept.explanation}${table}\n\nImportant exam points:\n${concept.points.map((point) => `- ${point}`).join("\n")}\n\nDemo question: ${concept.demo.question}\nAnswer: ${concept.demo.answer}\n\nWhy: ${concept.demo.why}`;
  }

  if (relatedQuestion && (last.includes("explain") || last.includes("question") || last.includes("answer"))) {
    const optionList = relatedQuestion.options?.length
      ? `\n\nOptions:\n${relatedQuestion.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("\n")}`
      : "";
    return `Here is the closest matching study question I found:\n\n${relatedQuestion.question_text}${optionList}\n\nCorrect answer: ${formatTutorAnswer(relatedQuestion.correct_answer, relatedQuestion.options)}\n\nWhy: ${relatedQuestion.explanation || relatedQuestion.concept_notes || "The explanation is not available in the dataset yet."}\n\nNext step: try one similar question without looking at the solution, then review the concept note.`;
  }

  if (match) {
    return `${match.title} prep focus:\n\nSyllabus: ${match.syllabus}\n\nStudy plan: ${match.plan}\n\nDemo drill: open Courses, choose ${match.title}, and start the demo questions. After each attempt, check Recommendations for weak topics.`;
  }

  if (/^(hi|hello|hey|hii|namaste|thanks|thank you|ok|okay)[\s!.?]*$/i.test(lastRaw.trim())) {
    return "Hi. I am your study-only AI tutor. Ask me a GATE, placement, aptitude, coding, CS subject, syllabus, or question-explanation doubt.";
  }

  if (last.includes("question") || last.includes("practice") || last.includes("demo")) {
    return "Use the Courses page to pick an exam track, then open its demo test. Each demo question includes options, instant feedback, explanation, score, accuracy, and weak-topic tracking.";
  }

  return "I can help with TCS NQT, Infosys, Wipro/Accenture-style placement exams, GATE CSE, ISRO CS, and BARC CS. Ask for a syllabus, study plan, weak-topic strategy, or demo practice direction for any one exam.";
}

function formatTutorAnswer(answer, options = []) {
  if (Array.isArray(answer)) {
    return answer.map((item) => formatTutorAnswer(item, options)).join(", ");
  }
  if (typeof answer === "number" && options[answer] !== undefined) {
    return `${String.fromCharCode(65 + answer)}. ${options[answer]}`;
  }
  return String(answer ?? "Not available");
}

function formatMarkdownTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const header = rows[0];
  const body = rows.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function findLocalConcept(text) {
  const concepts = [
    {
      keys: ["operating system", " os ", " os?", " os."],
      title: "Operating System",
      explanation:
        "An operating system is system software that manages computer hardware and gives programs a controlled way to use CPU, memory, storage, files, and input/output devices. It acts as a bridge between the user/application programs and the hardware.",
      points: [
        "Process management: creates, schedules, and terminates processes.",
        "Memory management: allocates RAM and supports virtual memory/paging.",
        "File management: organizes files, directories, and permissions.",
        "I/O management: controls devices using drivers and buffering.",
        "Security and protection: isolates users/processes and controls access.",
      ],
      demo: {
        question: "Which OS component decides which ready process gets the CPU next?",
        answer: "CPU scheduler",
        why: "The scheduler selects a process from the ready queue according to a scheduling algorithm such as FCFS, SJF, Priority, or Round Robin.",
      },
    },
    {
      keys: ["deadlock", "circular wait"],
      title: "Handling Deadlock in Operating Systems",
      explanation:
        "Deadlock happens when processes wait forever because each process holds one resource and waits for another resource held by someone else. To tackle deadlock, an OS can prevent it, avoid it, detect and recover from it, or ignore it in practical systems where it is rare.",
      points: [
        "Prevention: break at least one Coffman condition such as hold-and-wait, no preemption, or circular wait.",
        "Avoidance: allocate resources only if the system remains in a safe state, commonly using Banker's algorithm.",
        "Detection and recovery: allow deadlock, detect cycles or unsafe states, then recover by killing a process or preempting resources.",
        "Ostrich approach: ignore deadlock when handling it costs more than the rare failure, common in many general-purpose systems.",
        "For GATE, remember the four Coffman conditions: mutual exclusion, hold and wait, no preemption, circular wait.",
      ],
      demo: {
        question: "Which deadlock handling method uses the concept of safe state?",
        answer: "Deadlock avoidance",
        why: "Avoidance checks before allocation whether the system can still complete all processes in some safe sequence.",
      },
    },
    {
      keys: ["dbms", "database"],
      title: "DBMS",
      explanation:
        "A DBMS is software used to store, organize, query, and protect structured data. It supports tables, relationships, transactions, indexing, normalization, and SQL queries.",
      points: [
        "Keys and constraints maintain correctness.",
        "Normalization reduces redundancy and anomalies.",
        "Transactions follow ACID properties.",
        "Indexes speed up search but cost extra storage and update time.",
      ],
      demo: {
        question: "Which normal form removes partial dependency?",
        answer: "2NF",
        why: "2NF requires every non-prime attribute to depend on the whole candidate key, not only a part of it.",
      },
    },
    {
      keys: ["computer network", "networks", "networking", "cn"],
      title: "Computer Networks",
      explanation:
        "Computer networks connect devices so they can exchange data using protocols. GATE usually asks OSI/TCP-IP layers, routing, IP addressing, transport protocols, congestion control, and application protocols.",
      points: [
        "TCP is reliable and connection-oriented.",
        "UDP is faster but does not guarantee delivery.",
        "IP handles addressing and routing.",
        "Subnetting questions need careful bit counting.",
      ],
      demo: {
        question: "Which transport protocol provides reliability and flow control?",
        answer: "TCP",
        why: "TCP uses acknowledgements, sequence numbers, retransmission, flow control, and congestion control.",
      },
    },
    {
      keys: ["ipv4", "ipv6"],
      title: "IPv4 vs IPv6",
      explanation:
        "IPv4 and IPv6 are Internet Protocol versions used to identify devices and route packets across networks. IPv6 was introduced mainly because IPv4 address space became too small for the modern internet.",
      points: [
        "IPv4 uses 32-bit addresses, while IPv6 uses 128-bit addresses.",
        "IPv4 is usually written in dotted decimal form, like 192.168.1.1.",
        "IPv6 is written in hexadecimal groups separated by colons, like 2001:db8::1.",
        "IPv6 has a much larger address space and simpler header structure.",
        "IPv4 commonly depends on NAT; IPv6 was designed to reduce the need for NAT.",
      ],
      demo: {
        question: "Which protocol version provides a 128-bit address space?",
        answer: "IPv6",
        why: "IPv6 uses 128-bit addresses, giving a vastly larger number of unique addresses than IPv4.",
      },
      table: [
        ["Feature", "IPv4", "IPv6"],
        ["Address size", "32-bit", "128-bit"],
        ["Address format", "Decimal dotted notation", "Hexadecimal colon notation"],
        ["Example", "192.168.1.1", "2001:db8::1"],
        ["Header", "Variable length, more complex", "Fixed base header, simpler"],
        ["Address space", "About 4.3 billion addresses", "Extremely large address space"],
        ["NAT", "Commonly used", "Usually not required"],
        ["Security", "IPsec optional", "IPsec support built into design"],
      ],
    },
    {
      keys: ["threaded cable", "twisted cable", "twisted pair", "utp", "stp", "ethernet cable"],
      title: "Twisted Pair Cable",
      explanation:
        "In computer networks, students usually mean twisted pair cable, not threaded cable. A twisted pair cable has two insulated copper wires twisted together. The twisting reduces electromagnetic interference and crosstalk between nearby wires.",
      points: [
        "UTP means Unshielded Twisted Pair and is common in Ethernet LANs.",
        "STP means Shielded Twisted Pair and has extra shielding against noise.",
        "Twisting helps cancel external electromagnetic noise.",
        "Common Ethernet cables such as Cat5e and Cat6 are twisted pair cables.",
      ],
      demo: {
        question: "Why are wires twisted in twisted pair cable?",
        answer: "To reduce electromagnetic interference and crosstalk",
        why: "The twists make induced noise affect both wires more equally, so the receiver can reduce the noise effect using differential signaling.",
      },
    },
    {
      keys: ["algorithm", "algorithms", "dsa", "data structure"],
      title: "Data Structures and Algorithms",
      explanation:
        "DSA covers how data is stored and how efficiently problems are solved. For exams, focus on arrays, stacks, queues, trees, graphs, sorting, searching, greedy, dynamic programming, and complexity analysis.",
      points: [
        "Always identify time and space complexity.",
        "Trees and graphs are high-value GATE topics.",
        "Dynamic programming needs state, transition, base case, and order.",
        "Heaps are commonly used in priority queues and graph algorithms.",
      ],
      demo: {
        question: "Which traversal of a BST gives sorted order?",
        answer: "Inorder traversal",
        why: "In a BST, left subtree keys are smaller and right subtree keys are larger, so left-root-right gives sorted order.",
      },
    },
  ];

  return concepts.find((concept) =>
    concept.keys.some((key) => {
      const normalized = ` ${text} `;
      return normalized.includes(key);
    }),
  );
}

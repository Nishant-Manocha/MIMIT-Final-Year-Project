import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const timestamps = { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } };

const userSchema = new Schema(
  {
    display_name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], default: ["student"] },
  },
  timestamps,
);

const profileSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    display_name: String,
    avatar_url: String,
    bio: String,
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    streak_days: { type: Number, default: 0 },
    last_active_date: String,
    daily_goal_minutes: { type: Number, default: 30 },
  },
  timestamps,
);

const dailyActivitySchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    login_count: { type: Number, default: 0 },
    quiz_attempts: { type: Number, default: 0 },
    practice_saves: { type: Number, default: 0 },
    tutor_messages: { type: Number, default: 0 },
    generated_sets: { type: Number, default: 0 },
    xp_earned: { type: Number, default: 0 },
  },
  timestamps,
);
dailyActivitySchema.index({ user_id: 1, date: 1 }, { unique: true });

const userSettingsSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    theme: { type: String, default: "dark" },
    font_size: { type: String, default: "medium" },
    reduced_motion: { type: Boolean, default: false },
    sidebar_collapsed: { type: Boolean, default: false },
    compact_mode: { type: Boolean, default: false },
    notifications_email: { type: Boolean, default: true },
    notifications_inapp: { type: Boolean, default: true },
    language: { type: String, default: "en" },
  },
  timestamps,
);

const courseSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: String,
    thumbnail_url: String,
    instructor_id: { type: Schema.Types.ObjectId, ref: "User" },
    instructor_name: String,
    difficulty: { type: String, default: "beginner" },
    category: String,
    tags: { type: [String], default: [] },
    duration_minutes: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    enrolled_count: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
  },
  timestamps,
);

const chapterSchema = new Schema(
  {
    course_id: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true },
    description: String,
    video_url: String,
    duration_seconds: { type: Number, default: 0 },
    order_index: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

const enrollmentSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    course_id: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    progress_pct: { type: Number, default: 0 },
    last_chapter_id: { type: Schema.Types.ObjectId, ref: "Chapter" },
    completed_at: Date,
  },
  { timestamps: { createdAt: "enrolled_at", updatedAt: false } },
);
enrollmentSchema.index({ user_id: 1, course_id: 1 }, { unique: true });

const quizSchema = new Schema(
  {
    course_id: { type: Schema.Types.ObjectId, ref: "Course" },
    title: { type: String, required: true },
    description: String,
    quiz_type: { type: String, default: "practice" },
    time_limit_seconds: Number,
    negative_marking: { type: Number, default: 0 },
    topic: String,
    difficulty: { type: String, default: "medium" },
    published: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

const questionSchema = new Schema(
  {
    quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    question_text: { type: String, required: true },
    question_type: { type: String, default: "mcq" },
    options: { type: [String], default: [] },
    image_url: String,
    image_alt: String,
    correct_answer: Schema.Types.Mixed,
    explanation: String,
    subject: String,
    topic: String,
    subtopic: String,
    source_exam: String,
    source_year: Number,
    source_session: String,
    source_question_number: Number,
    source_url: String,
    difficulty: { type: String, default: "medium" },
    tags: { type: [String], default: [] },
    solving_approaches: { type: [String], default: [] },
    concept_notes: String,
    common_mistakes: { type: [String], default: [] },
    related_questions: { type: [Schema.Types.ObjectId], default: [] },
    embedding_text: String,
    marks: { type: Number, default: 1 },
    order_index: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

const questionBookmarkSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    question_id: { type: Schema.Types.ObjectId, ref: "Question", required: true },
    quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz" },
  },
  timestamps,
);
questionBookmarkSchema.index({ user_id: 1, question_id: 1 }, { unique: true });
questionBookmarkSchema.index({ user_id: 1, quiz_id: 1 });

const quizAttemptSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    answers: { type: Schema.Types.Mixed, default: {} },
    score: { type: Number, default: 0 },
    max_score: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    time_taken_seconds: { type: Number, default: 0 },
    per_question: { type: Schema.Types.Mixed, default: [] },
    topic_breakdown: { type: Schema.Types.Mixed, default: {} },
    difficulty_used: String,
  },
  { timestamps: { createdAt: "completed_at", updatedAt: false } },
);

const quizProgressSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    answers: { type: Schema.Types.Mixed, default: {} },
    marked: { type: [String], default: [] },
    per_question: { type: Schema.Types.Mixed, default: {} },
    current_index: { type: Number, default: 0 },
    selected_subject: String,
    completed: { type: Boolean, default: false },
  },
  timestamps,
);
quizProgressSchema.index({ user_id: 1, quiz_id: 1 }, { unique: true });

const savedPdfSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz" },
    title: { type: String, required: true },
    scope: { type: String, default: "attempted" },
    question_ids: { type: [String], default: [] },
    pdf_data: { type: String, required: true },
    mime_type: { type: String, default: "application/pdf" },
    size_bytes: { type: Number, default: 0 },
  },
  timestamps,
);
savedPdfSchema.index({ user_id: 1, updated_at: -1 });

const tutorChatSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: "New chat" },
    messages: { type: Schema.Types.Mixed, default: [] },
    archived: { type: Boolean, default: false },
  },
  timestamps,
);
tutorChatSchema.index({ user_id: 1, updated_at: -1 });

const recommendationSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rec_type: { type: String, required: true },
    title: { type: String, required: true },
    description: String,
    target_id: Schema.Types.ObjectId,
    payload: { type: Schema.Types.Mixed, default: {} },
    score: { type: Number, default: 0 },
    dismissed: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

const notificationSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    body: String,
    link: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

const canvasWorkspaceSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    question_id: { type: Schema.Types.ObjectId, ref: "Question" },
    quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz" },
    title: { type: String, default: "Solving workspace" },
    canvas_json: { type: Schema.Types.Mixed, default: null },
    thumbnail: String,
    exported_pdf_url: String,
  },
  timestamps,
);
canvasWorkspaceSchema.index({ user_id: 1, question_id: 1 }, { unique: true, sparse: true });

const studyRoomSchema = new Schema(
  {
    owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, trim: true },
    topic: { type: String, trim: true },
    activity: { type: String, default: "Problem Solving" },
    mode: { type: String, default: "Voice" },
    invite_code: { type: String, required: true, unique: true },
    members: {
      type: [
        {
          user_id: { type: Schema.Types.ObjectId, ref: "User" },
          name: String,
          role: { type: String, default: "student" },
          status: { type: String, default: "online" },
        },
      ],
      default: [],
    },
    board_state: { type: Schema.Types.Mixed, default: { strokes: [] } },
    notes: { type: String, default: "" },
    activity_state: { type: Schema.Types.Mixed, default: {} },
    study_only: { type: Boolean, default: true },
  },
  timestamps,
);
studyRoomSchema.index({ owner_id: 1, updated_at: -1 });

const studyRoomMessageSchema = new Schema(
  {
    room_id: { type: Schema.Types.ObjectId, ref: "StudyRoom", required: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    author_name: { type: String, required: true },
    text: { type: String, default: "", trim: true },
    message_type: { type: String, default: "chat" },
    attachments: {
      type: [
        {
          name: String,
          mime_type: String,
          size: Number,
          data_url: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);
studyRoomMessageSchema.index({ room_id: 1, created_at: 1 });

const blogUpdateSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    category: String,
    summary: String,
    content: String,
    tags: { type: [String], default: [] },
    published: { type: Boolean, default: true },
    published_at: Date,
  },
  timestamps,
);

export const User = models.User || model("User", userSchema);
export const Profile = models.Profile || model("Profile", profileSchema);
export const DailyActivity = models.DailyActivity || model("DailyActivity", dailyActivitySchema);
export const UserSettings = models.UserSettings || model("UserSettings", userSettingsSchema);
export const Course = models.Course || model("Course", courseSchema);
export const Chapter = models.Chapter || model("Chapter", chapterSchema);
export const Enrollment = models.Enrollment || model("Enrollment", enrollmentSchema);
export const Quiz = models.Quiz || model("Quiz", quizSchema);
export const Question = models.Question || model("Question", questionSchema);
export const QuestionBookmark =
  models.QuestionBookmark || model("QuestionBookmark", questionBookmarkSchema);
export const QuizAttempt = models.QuizAttempt || model("QuizAttempt", quizAttemptSchema);
export const QuizProgress = models.QuizProgress || model("QuizProgress", quizProgressSchema);
export const SavedPdf = models.SavedPdf || model("SavedPdf", savedPdfSchema);
export const TutorChat = models.TutorChat || model("TutorChat", tutorChatSchema);
export const Recommendation =
  models.Recommendation || model("Recommendation", recommendationSchema);
export const Notification = models.Notification || model("Notification", notificationSchema);
export const CanvasWorkspace =
  models.CanvasWorkspace || model("CanvasWorkspace", canvasWorkspaceSchema);
export const StudyRoom = models.StudyRoom || model("StudyRoom", studyRoomSchema);
export const StudyRoomMessage =
  models.StudyRoomMessage || model("StudyRoomMessage", studyRoomMessageSchema);
export const BlogUpdate = models.BlogUpdate || model("BlogUpdate", blogUpdateSchema);

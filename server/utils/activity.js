import { DailyActivity, Profile } from "../models.js";

const STUDY_TIME_ZONE = process.env.STUDY_TIME_ZONE || "Asia/Kolkata";

export function studyDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addStudyDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return studyDateString(date);
}

export function recentStudyDates(days = 84) {
  const count = Math.max(1, Number(days || 84));
  const today = studyDateString();
  return Array.from({ length: count }, (_, index) => addStudyDays(today, index - count + 1));
}

export async function touchUserActivity(userId, activity = {}) {
  const today = studyDateString();
  const yesterday = addStudyDays(today, -1);
  const xpGain = Math.max(0, Math.round(Number(activity.xpGain || 0)));

  const profile = await Profile.findOne({ user_id: userId });
  const nextStreak =
    profile?.last_active_date === today
      ? profile.streak_days || 1
      : profile?.last_active_date === yesterday
        ? (profile.streak_days || 0) + 1
        : 1;

  const increments = {};
  if (activity.login) increments.login_count = 1;
  if (activity.quizAttempt) increments.quiz_attempts = 1;
  if (activity.practiceSave) increments.practice_saves = 1;
  if (activity.tutorMessage) increments.tutor_messages = 1;
  if (activity.generatedSet) increments.generated_sets = 1;
  if (xpGain > 0) increments.xp_earned = xpGain;

  await DailyActivity.findOneAndUpdate(
    { user_id: userId, date: today },
    {
      ...(Object.keys(increments).length ? { $inc: increments } : {}),
      $setOnInsert: { user_id: userId, date: today },
    },
    { new: true, upsert: true },
  );

  return Profile.findOneAndUpdate(
    { user_id: userId },
    {
      ...(xpGain > 0 ? { $inc: { xp: xpGain } } : {}),
      $set: { streak_days: nextStreak, last_active_date: today },
    },
    { new: true, upsert: true },
  );
}

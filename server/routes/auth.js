import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { Notification, Profile, Recommendation, User, UserSettings } from "../models.js";
import { normalizeId, toClientUser } from "../utils/serializers.js";
import { touchUserActivity } from "../utils/activity.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET || "dev-secret-change-me", {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });
  if (password.length < 8)
    return res.status(400).json({ message: "Password must be at least 8 characters" });

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ message: "An account with this email already exists" });

  const user = await User.create({
    display_name: name || email.split("@")[0],
    email,
    passwordHash: await bcrypt.hash(password, 12),
    roles: ["student"],
  });

  await Profile.create({ user_id: user._id, display_name: user.display_name });
  await touchUserActivity(user._id, { login: true });
  await UserSettings.create({ user_id: user._id });
  await Notification.create({
    user_id: user._id,
    title: "Welcome to IntelliLearn Hub",
    body: "Your MERN learning workspace is ready.",
  });
  await Recommendation.create({
    user_id: user._id,
    rec_type: "course",
    title: "Start with ML Foundations",
    description: "A beginner-friendly path to understand adaptive learning concepts.",
    score: 0.95,
  });

  res.status(201).json({ token: signToken(user), user: toClientUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || "").toLowerCase() });

  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  await touchUserActivity(user._id, { login: true });

  res.json({ token: signToken(user), user: toClientUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  await touchUserActivity(req.user._id);
  const profile = await Profile.findOne({ user_id: req.user._id });
  res.json({ user: req.clientUser, profile: normalizeId(profile) });
});

export default router;

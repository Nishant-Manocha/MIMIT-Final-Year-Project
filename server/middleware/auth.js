import jwt from "jsonwebtoken";
import { User } from "../models.js";
import { toClientUser } from "../utils/serializers.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret-change-me");
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: "Invalid session" });
    }

    req.user = user;
    req.clientUser = toClientUser(user);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

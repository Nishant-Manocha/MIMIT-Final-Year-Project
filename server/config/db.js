import mongoose from "mongoose";

export async function connectDb() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/intellilearn_hub";

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);

  console.log(`[api] MongoDB connected: ${mongoose.connection.name}`);
}

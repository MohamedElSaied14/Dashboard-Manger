import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const root = resolve(import.meta.dirname, "../../..");
const envText = await readFile(resolve(root, ".env"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const email = "codex.logo.e2e@example.test";
const password = "CodexLogoE2E!2026";

await mongoose.connect(process.env.MONGODB_URI);
await mongoose.connection.collection("users").updateOne(
  { email },
  {
    $set: {
      email,
      password: await bcrypt.hash(password, 10),
      name: "Logo Verification E2E",
      role: "admin",
      updatedAt: new Date(),
    },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
);
await mongoose.disconnect();
process.stdout.write(JSON.stringify({ email, password, role: "admin" }));

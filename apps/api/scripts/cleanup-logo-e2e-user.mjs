import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import mongoose from "mongoose";

const root = resolve(import.meta.dirname, "../../..");
const envText = await readFile(resolve(root, ".env"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

await mongoose.connect(process.env.MONGODB_URI);
await mongoose.connection.collection("users").deleteOne({
  email: "codex.logo.e2e@example.test",
});
await mongoose.disconnect();

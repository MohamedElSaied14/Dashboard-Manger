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
const clientId = new mongoose.Types.ObjectId(process.argv[2]);
const reviews = await mongoose.connection.collection("designreviews")
  .find({ client: clientId })
  .sort({ createdAt: 1 })
  .toArray();

const output = reviews.map((review) => {
  const result = review.finalResult;
  const checks = [
    ...(result.passedChecks ?? []),
    ...(result.warnings ?? []),
    ...(result.violations ?? []),
    ...(result.manualChecks ?? []),
  ];
  return {
    design: String(review.design),
    status: result.status,
    brandScore: result.brandScore,
    confidenceScore: result.confidenceScore,
    logoChecks: checks.filter((check) =>
      String(check.ruleCode).toUpperCase().startsWith("LOGO_"),
    ),
    allChecks: checks.map(({ ruleCode, result, confidence, explanation }) => ({
      ruleCode,
      result,
      confidence,
      explanation,
    })),
    aiRaw: review.aiAnalysis?.raw,
  };
});
await mongoose.disconnect();
process.stdout.write(JSON.stringify(output, null, 2));

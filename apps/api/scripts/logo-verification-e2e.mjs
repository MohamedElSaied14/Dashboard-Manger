import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "../../..");
const envText = await readFile(resolve(root, ".env"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const apiBase = process.env.LOGO_E2E_API_URL ?? "http://localhost:4010/api";
const adminEmail = "codex.logo.e2e@example.test";
const adminPassword = "CodexLogoE2E!2026";
const marketingLogoPath = process.argv[2];
const alzahraLogoPath = process.argv[3];
const positiveDesignPath = process.argv[4];
const negativeDesignPath = process.argv[5];

if (![marketingLogoPath, alzahraLogoPath, positiveDesignPath, negativeDesignPath].every(Boolean)) {
  throw new Error("Expected paths: marketing-logo alzahra-logo positive-design negative-design");
}

await mongoose.connect(process.env.MONGODB_URI);
const password = await bcrypt.hash(adminPassword, 10);
await mongoose.connection.collection("users").updateOne(
  { email: adminEmail },
  {
    $set: {
      email: adminEmail,
      password,
      name: "Logo Verification E2E",
      role: "admin",
      updatedAt: new Date(),
    },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
);
await mongoose.disconnect();

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed (${response.status}): ${text}`);
  }
  return data;
}

const login = await request("/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
const authHeaders = { authorization: `Bearer ${login.accessToken}` };

async function formWithFile(path, fields = {}) {
  let bytes = await readFile(path);
  const extension = extname(path).toLowerCase();
  let type = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  let filename = basename(path);
  if (bytes.length > 9 * 1024 * 1024) {
    bytes = await sharp(bytes)
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    type = "image/jpeg";
    filename = `${basename(path, extension)}-compressed.jpg`;
  }
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), filename);
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  return form;
}

async function uploadAsset(path) {
  return request("/upload", {
    method: "POST",
    headers: authHeaders,
    body: await formWithFile(path),
  });
}

const client = await request("/clients", {
  method: "POST",
  headers: { ...authHeaders, "content-type": "application/json" },
  body: JSON.stringify({
    name: `Logo Verification E2E ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    industry: "Marketing",
    city: "Cairo",
    country: "Egypt",
    status: "active",
  }),
});

const [marketingLogo, alzahraLogo] = await Promise.all([
  uploadAsset(marketingLogoPath),
  uploadAsset(alzahraLogoPath),
]);

const guidelines = {
  orientation: "square",
  dimensions: { width: 2048, height: 2048, aspectRatio: "1:1", tolerancePx: 4 },
  colorRules: {
    mode: "brand-colors",
    allowedColors: ["#39bdb6", "#563399", "#ffffff", "#109c93"],
    allowGrayscale: true,
    colorTolerance: 18,
  },
  header: {
    logoRequired: true,
    logoPosition: "top-left",
    logoRepeatedAllowed: true,
  },
  footer: {
    required: false,
    separatorRequired: false,
  },
  logoAssets: [
    {
      id: "marketing-dose",
      name: "Marketing Dose & Media Dose",
      variant: "primary",
      imageUrl: marketingLogo.url,
      cloudinaryPublicId: marketingLogo.publicId,
      required: true,
      expectedPosition: "top-left",
      precisePlacement: {
        xPercent: 3,
        yPercent: 3,
        widthPercent: 27,
        tolerancePercent: 8,
        marginPercent: 3,
      },
      allowedBackground: "light",
    },
    {
      id: "alzahra-alfarida",
      name: "Alzahra Alfarida",
      variant: "primary",
      imageUrl: alzahraLogo.url,
      cloudinaryPublicId: alzahraLogo.publicId,
      required: true,
      expectedPosition: "top-right",
      precisePlacement: {
        xPercent: 68,
        yPercent: 3,
        widthPercent: 27,
        tolerancePercent: 8,
        marginPercent: 3,
      },
      allowedBackground: "light",
    },
  ],
  contactDetails: [],
  notes: ["Automated end-to-end logo identity verification fixture."],
};

await request(`/clients/${client._id}/design-guidelines`, {
  method: "PUT",
  headers: { ...authHeaders, "content-type": "application/json" },
  body: JSON.stringify(guidelines),
});

async function uploadAndAnalyze(path, title) {
  const design = await request(`/clients/${client._id}/designs`, {
    method: "POST",
    headers: authHeaders,
    body: await formWithFile(path, { designType: "other", title }),
  });
  await request(`/clients/${client._id}/designs/${design._id}/analyze`, {
    method: "POST",
    headers: authHeaders,
  });
  const review = await request(`/clients/${client._id}/designs/${design._id}/review`, {
    headers: authHeaders,
  });
  const allChecks = [
    ...review.finalResult.passedChecks,
    ...review.finalResult.warnings,
    ...review.finalResult.violations,
    ...review.finalResult.manualChecks,
  ];
  return {
    designId: design._id,
    status: review.finalResult.status,
    brandScore: review.finalResult.brandScore,
    confidenceScore: review.finalResult.confidenceScore,
    logoChecks: allChecks
      .filter((check) => check.ruleCode.startsWith("LOGO_"))
      .map(({ ruleCode, result, confidence, explanation }) => ({
        ruleCode,
        result,
        confidence,
        explanation,
      })),
  };
}

const positive = await uploadAndAnalyze(positiveDesignPath, "POSITIVE - both approved logos");
const negative = process.env.LOGO_E2E_POSITIVE_ONLY === "1"
  ? null
  : await uploadAndAnalyze(negativeDesignPath, "NEGATIVE - approved logos absent");

process.stdout.write(JSON.stringify({
  clientId: client._id,
  clientName: client.name,
  positive,
  negative,
}, null, 2));

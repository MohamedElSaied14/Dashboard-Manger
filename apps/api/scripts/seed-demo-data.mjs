/**
 * Seeds a realistic demo workspace (team members, clients, tasks) so the
 * dashboard can be developed, screenshotted and end-to-end tested against
 * meaningful data instead of empty states.
 *
 *   node scripts/seed-demo-data.mjs          # upsert demo records
 *   node scripts/seed-demo-data.mjs --clean  # remove them again
 *
 * Every record is tagged `demoSeed: true`, so --clean never touches real data.
 */
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

const clean = process.argv.includes("--clean");

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection;
const users = db.collection("users");
const clients = db.collection("clients");
const tasks = db.collection("tasks");

if (clean) {
  const removed = await Promise.all([
    tasks.deleteMany({ demoSeed: true }),
    clients.deleteMany({ demoSeed: true }),
    users.deleteMany({ demoSeed: true }),
  ]);
  console.log("removed", removed.map((r) => r.deletedCount).join(" / "), "(tasks/clients/users)");
  await mongoose.disconnect();
  process.exit(0);
}

const now = new Date();
const daysFromNow = (days) => new Date(now.getTime() + days * 86_400_000);

const TEAM = [
  { name: "Sara Khaled", nameAr: "سارة خالد", email: "sara.demo@accountflow.test", role: "manager" },
  { name: "Omar Fathy", nameAr: "عمر فتحي", email: "omar.demo@accountflow.test", role: "member" },
  { name: "Nour Adel", nameAr: "نور عادل", email: "nour.demo@accountflow.test", role: "member" },
];

const password = await bcrypt.hash("DemoPass!2026", 10);
const teamIds = {};
for (const member of TEAM) {
  await users.updateOne(
    { email: member.email },
    {
      $set: { ...member, password, demoSeed: true, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  teamIds[member.email] = (await users.findOne({ email: member.email }))._id;
}

const CLIENTS = [
  {
    name: "Marsa Medical Center",
    nameAr: "مركز مرسى الطبي",
    industry: "Healthcare",
    city: "Jeddah",
    country: "Saudi Arabia",
    status: "active",
    completion: 92,
    fonts: "Cairo, Poppins",
    briefs:
      "Premium hospital group. Calm, clinical tone — deep teal and white only.\nArabic-first copy with English subheads. Logo always top-right, never repeated.",
    driveLink: "https://drive.google.com/drive/folders/demo-marsa",
    lastProjectFinished: "Ramadan health awareness campaign",
    manager: "sara.demo@accountflow.test",
  },
  {
    name: "Tibyan Diagnostics",
    nameAr: "تبيان للتحاليل",
    industry: "Laboratories",
    city: "Riyadh",
    country: "Saudi Arabia",
    status: "active",
    completion: 74,
    fonts: "Tajawal",
    briefs:
      "Diagnostics lab. Clean clinical palette, high legibility on results material.\nAll claims must stay inside SFDA advertising rules — no outcome guarantees.",
    driveLink: "https://drive.google.com/drive/folders/demo-tibyan",
    lastProjectFinished: "Lab results portal launch",
    manager: "sara.demo@accountflow.test",
  },
  {
    name: "Safwa Dental Clinics",
    nameAr: "عيادات صفوة للأسنان",
    industry: "Dental Care",
    city: "Dammam",
    country: "Saudi Arabia",
    status: "onboarding",
    completion: 48,
    briefs: "New account. Brand book pending from the client.",
    manager: "omar.demo@accountflow.test",
  },
  {
    name: "Sadeem Medical Training",
    nameAr: "سديم للتدريب الطبي",
    industry: "Medical Training",
    city: "Cairo",
    country: "Egypt",
    status: "holding",
    completion: 35,
    briefs: "Paused pending Q3 budget approval.",
  },
  {
    name: "Halim Pharma",
    nameAr: "حليم فارما",
    industry: "Pharmaceuticals",
    city: "Jeddah",
    country: "Saudi Arabia",
    status: "lead",
    completion: 20,
  },
  {
    name: "Wajd Polyclinic",
    nameAr: "مجمع وجد الطبي",
    industry: "Polyclinic",
    city: "Riyadh",
    country: "Saudi Arabia",
    status: "completed",
    completion: 100,
    driveLink: "https://drive.google.com/drive/folders/demo-wajd",
    lastProjectFinished: "Founding Day health screening drive",
  },
];

const clientIds = {};
for (const entry of CLIENTS) {
  const { manager, ...fields } = entry;
  await clients.updateOne(
    { name: fields.name },
    {
      $set: {
        ...fields,
        accountManager: manager ? teamIds[manager] : undefined,
        demoSeed: true,
        updatedAt: new Date(now.getTime() - Math.random() * 6 * 86_400_000),
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  clientIds[fields.name] = (await clients.findOne({ name: fields.name }))._id;
}

const TASKS = [
  {
    title: "Eid campaign — 6 Instagram posts",
    description: "Full set of portrait posts, Arabic copy approved by the client.",
    priority: "high",
    client: "Marsa Medical Center",
    dueDate: daysFromNow(2),
    assignedTo: "omar.demo@accountflow.test",
    moreInfo: "Client asked for the teal palette only. No lifestyle photography.",
  },
  {
    title: "Clinic photography retouch",
    description: "Retouch 24 interior shots for the new branch.",
    priority: "medium",
    client: "Tibyan Diagnostics",
    dueDate: daysFromNow(5),
    assignedTo: "nour.demo@accountflow.test",
  },
  {
    title: "Collect brand book from client",
    description: "Chase the marketing lead for the official brand guidelines PDF.",
    priority: "high",
    client: "Safwa Dental Clinics",
    dueDate: daysFromNow(1),
    assignedTo: "omar.demo@accountflow.test",
  },
  {
    title: "Q3 content calendar",
    description: "Draft the 90-day content plan across all active accounts.",
    priority: "medium",
    dueDate: daysFromNow(9),
    assignedTo: "sara.demo@accountflow.test",
  },
  {
    title: "Awareness banner set",
    description: "Three hero banners for the seasonal awareness page.",
    priority: "low",
    client: "Tibyan Diagnostics",
    dueDate: daysFromNow(14),
  },
  {
    title: "Screening drive recap reel",
    description: "Edit the 45-second event recap.",
    priority: "medium",
    client: "Wajd Polyclinic",
    dueDate: daysFromNow(-3),
    completed: true,
    assignedTo: "nour.demo@accountflow.test",
  },
  {
    title: "Brand audit deck",
    description: "Competitive audit ahead of the pitch.",
    priority: "low",
    client: "Halim Pharma",
    dueDate: daysFromNow(7),
  },
  {
    title: "Clinic interior shoot brief",
    description: "Write the photography brief for the new Dammam branch.",
    priority: "medium",
    client: "Safwa Dental Clinics",
    dueDate: daysFromNow(4),
    assignedTo: "nour.demo@accountflow.test",
  },
];

for (const entry of TASKS) {
  const { client, assignedTo, ...fields } = entry;
  await tasks.updateOne(
    { title: fields.title },
    {
      $set: {
        ...fields,
        completed: fields.completed ?? false,
        client: client ? clientIds[client] : undefined,
        assignedTo: assignedTo ? teamIds[assignedTo] : undefined,
        accessibleBy: Object.values(teamIds).slice(0, 2),
        demoSeed: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

console.log(
  JSON.stringify({
    users: TEAM.length,
    clients: CLIENTS.length,
    tasks: TASKS.length,
    demoPassword: "DemoPass!2026",
  }),
);
await mongoose.disconnect();

# Client Design Review — Usage Guide

This feature lets an Account Manager save a client's design guidelines, upload a design, and get an
automated review that combines deterministic technical checks (dimensions, aspect ratio, monochrome
compliance) with an AI visual review (brand fit, layout, readability) before approving or rejecting it.

It implements the spec in `client-design-review-system.md`. New code lives under
`apps/api/src/design-review/` (backend) and `apps/web/src/app/clients/[id]/design-review/` (frontend).

## 1. Setup

### 1.1 Install dependencies

From the repo root:

```bash
pnpm install
```

This pulls in the two new backend packages: `sharp` (image analysis) and `openai` (AI visual review),
plus `jest`/`ts-jest` for testing.

> If `pnpm install` ever fails with a file-lock/unlink error, delete `node_modules` in the repo root and
> `apps/api`, then run `pnpm install` again. That happens if a previous install was interrupted.

### 1.2 Environment variables

Add these to your `.env` (same file used for `MONGODB_URI`, `JWT_ACCESS_SECRET`, Cloudinary, etc.):

```env
OPENAI_API_KEY=sk-...
OPENAI_DESIGN_REVIEW_MODEL=gpt-4.1-mini
```

- `OPENAI_API_KEY` is required for the AI visual-review layer. **Without it, the feature still works** —
  technical checks (dimensions, colors, orientation) still run, but every brand/content/visual-quality
  check comes back as `unknown` with an explanation that manual review is required. This matches the
  spec's "hybrid system" principle: never let a missing AI key silently fail the whole review.
- `OPENAI_DESIGN_REVIEW_MODEL` defaults to `gpt-4.1-mini` if unset — pick any vision-capable model your
  OpenAI account has access to.
- Cloudinary credentials (`CLOUDINARY_*`) must already be configured, since design uploads go through the
  existing `/upload`-style Cloudinary pipeline.

### 1.3 Run the app

```bash
pnpm dev
```

Web: `http://localhost:3000` · API: `http://localhost:4000/api`

## 2. Using the feature (as an Account Manager)

1. Log in and open a client from the **Clients** tab.
2. On the client's detail page, click **Design Review** (next to Edit Profile).
3. **Set up guidelines first.** If none are saved yet, click "Set up" in the Design Guidelines card.
   - A ready-to-edit example (matching the spec's sample client) is pre-filled when you open the form for
     a client that has no guidelines yet, or edit the JSON directly.
   - **Or generate them from a brief.** Paste the client's instructions in any language (Arabic works
     fine) and/or attach a PDF into the "Generate from client brief" box, then click "Generate guidelines
     draft". This calls OpenAI to turn the free text into the structured JSON below it — it recognizes
     common platform presets (e.g. "Instagram post size" → 1080×1350px, 4:5), and if the client already
     has saved guidelines, treats the brief as an update rather than a full rewrite (unmentioned fields
     are kept as-is). **Nothing is saved automatically** — review/edit the generated JSON, then click
     "Save guidelines" yourself. Any parts the AI wasn't fully sure about are listed under "Worth
     double-checking".
4. **Upload a design.** Pick an image file, choose a design type (Instagram Portrait Post, Story, Reel
   Cover, Carousel Slide, Banner, Other), optionally add a title/campaign name, then click "Upload design".
5. Select the uploaded design from **Design history**, then click **Analyze design**. This runs:
   - **Layer A (technical, instant):** dimensions, aspect ratio, orientation, and grayscale/monochrome
     pixel analysis via `sharp`.
   - **Layer B (AI, a few seconds):** sends the image + guidelines + technical results to OpenAI for
     brand/content/visual-quality judgment, if `OPENAI_API_KEY` is set.
6. Review the result panel: overall/technical/brand/content/confidence scores, a status badge (Approved /
   Approved with notes / Changes required / Manual review required), and grouped checks (violations,
   warnings, needs-manual-review, passed) plus a prioritized list of recommended changes.
7. Add optional notes and click **Approve**, **Request changes**, or **Reject**. This is recorded on the
   review and updates the design's status — the AI never makes the final call, per the spec.
8. For a design you consider a gold-standard example, click **Approve as reference** — it's flagged and
   added to the client's `approvedReferenceDesignIds` for future comparisons (Phase 2 in the spec).

## 3. How scoring works (section 13 of the spec)

- Category scores (technical / brand / content / visual quality) are averaged from that category's
  pass/warning/fail checks: pass = 100, warning = 60, fail = 0. Unknown checks are excluded, not penalized.
- Overall score = `technical*0.35 + brand*0.40 + content*0.15 + visualQuality*0.10`.
- Status:
  - **Approved** — score ≥ 90, confidence ≥ 75, no critical violation.
  - **Approved with notes** — score 80–89, no critical violation.
  - **Changes required** — any critical violation (wrong dimensions/orientation, unauthorized colors,
    missing/duplicated logo, missing or wrong footer), or score < 80.
  - **Manual review required** — confidence < 65, or required guideline data (reference logo, approved
    footer separator colors, approved fonts) is missing.

## 4. API endpoints

All routes are prefixed with `/api` and require a JWT (`Authorization: Bearer <token>`), same as the rest
of the API.

```
GET    /api/clients/:clientId/design-guidelines
PUT    /api/clients/:clientId/design-guidelines
POST   /api/clients/:clientId/design-guidelines/extract      (multipart: text? + file? [PDF] -> draft, not saved)

POST   /api/clients/:clientId/designs                       (multipart: file + designType + ...)
GET    /api/clients/:clientId/designs
GET    /api/clients/:clientId/designs/:designId

POST   /api/clients/:clientId/designs/:designId/analyze
GET    /api/clients/:clientId/designs/:designId/review
POST   /api/clients/:clientId/designs/:designId/decision     ({ decision, humanNotes? })
POST   /api/clients/:clientId/designs/:designId/approve-reference
```

## 5. Running tests

```bash
cd apps/api
pnpm test
```

This runs `score-calculator.spec.ts` (pure scoring/status logic, including the spec's worked "blue CTA"
example), `technical-checks.spec.ts` (dimension, orientation, aspect-ratio, and grayscale-violation checks
against synthetic images generated on the fly with `sharp`), and `guidelines-extraction.spec.ts` (JSON
parsing/normalization for the AI brief-extraction feature, including malformed-response fallbacks). No
fixture files needed — 23 tests pass as of this change.

## 6. What's intentionally manual (per spec section 17)

The spec explicitly recommends a hybrid MVP, not full automation. This implementation keeps these as
Account Manager judgment calls:

- Final approve/reject/request-changes decision — the system never auto-approves anything.
- Exact logo spacing/typography — flagged as "missing guideline data" until a reference logo asset and
  approved fonts are saved for a client (Phase 2 work).
- Any check where confidence is low or the AI review is unavailable — these fall into `manualChecks`, not
  `violations`, so they can't accidentally block or approve a design on their own.

## 7. Known limitations / next steps

- OCR-based footer text verification (from the spec's Layer A checklist) is not implemented in this pass —
  footer phone/handle presence is left to the AI layer and human review. Wiring in an OCR library (e.g.
  Tesseract) is a drop-in addition to `TechnicalChecksService`.
- Reference-based comparison against previously approved designs (spec Phase 2) is not implemented yet;
  the data model (`approvedReferenceDesignIds`, `isApprovedReference`) is already in place to support it.
- The guidelines editor in the UI is a raw JSON textarea for speed, though it can now be pre-filled
  automatically from a pasted brief or PDF (see section 2) — a structured form (per-field inputs) would
  still be a good follow-up for fully non-technical users.
- Guideline extraction from a brief requires `OPENAI_API_KEY` (same as the AI design review layer); without
  it, the "Generate guidelines draft" button returns a clear error and the JSON form still works manually.
# Logo and Contact Verification

Inside the client profile, open the **Design References** tab and use the **Logo & contact verification** card to define the exact assets and values that must appear in future designs.

These are permanent client settings. The Design Review page only displays a read-only summary and uses the saved values during analysis. To make a future change, return to the client's Design References tab.

## Approved logos

For every approved logo:

1. Upload a JPG, PNG, or WEBP reference image.
2. Enter a clear name.
3. Select its variant: primary, Arabic, English, white, black, icon, or other.
4. Select the expected position.
5. Set the precise placement:
   - `X %`: horizontal position of the logo center.
   - `Y %`: vertical position of the logo center.
   - `Width %`: logo width relative to the full design.
   - `Tolerance %`: allowed placement/size range around the selected X, Y, and width. For example, X 88% with tolerance 5% accepts X from 83% to 93%.
   - `Margin %`: safe distance that must remain between the logo and every design edge.
6. Drag the real uploaded logo with the mouse inside the mini design preview. The dashed rectangle shows the safe margin, the translucent blue area shows the accepted placement range, and dragging is constrained so the logo cannot cross the margin.
7. Save it as an approved logo.

Each logo stores its own position and size. For example, the Arabic logo may be top-right while a certification logo is bottom-left.

During analysis, the AI receives the uploaded design and the approved logo images. It creates separate checks for:

- Logo presence.
- Correct logo and variant.
- Correct position.
- X/Y position and relative width within the configured tolerance range.
- Stretching, cropping, recoloring, or other logo alterations.

## Required numbers and contact details

For every phone number, hotline, WhatsApp number, handle, website, or other value:

1. Enter a label.
2. Enter the exact value that should appear.
3. Select the contact type.
4. Select the expected position.
5. Save the rule.

Design Review checks:

- Whether the required value exists.
- Whether all digits or characters are correct.
- Whether it appears in the correct position.

If the value cannot be read confidently, the AI must return `unknown` and request manual review instead of inventing a digit.

Only Admin and Manager users can add, edit, or remove these permanent client rules. Members can view and use them during design work.

---

# Design Review — Final Verification

Date: 2026-07-25

## Review policy

### Optional checks

- Orientation
- Exact pixel dimensions
- Aspect ratio
- Strict color-mode enforcement

When an optional check is disabled, it is omitted from the review and cannot lower the score or create a violation.

### Core checks

- Approved logo identity and presence
- Flexible logo region (for example, anywhere within the top-left or top-right area)
- Approved brand colors whenever a saved client palette exists
- Required phone numbers and contact details

Exact logo coordinates and exact rendered logo dimensions are not required. The logo must match the approved visual identity and appear inside its allowed region.

## Supplied-image calibration

Approved logo references:

- `logo.png` — Marketing Dose
- `logo 2.jpeg` — Alzahra Alfarida

| Design | Marketing Dose | Alzahra | Required phone | Expected final decision |
| --- | --- | --- | --- | --- |
| `1.png` | Pass — 96% calibrated confidence | Pass — 97% calibrated confidence | Present: `+966 546 424 315` | Pass |
| `3.png` | Pass — 85% calibrated confidence | Pass — 83% calibrated confidence | Present: `+966 546 424 315` | Pass |
| `4..png` | Pass — 81% calibrated confidence | Pass — 84% calibrated confidence | Present: `+966 546 424 315` | Pass |
| `5.png` | Pass — 96% calibrated confidence | Pass — 99% calibrated confidence | Present: `+966 546 424 315` | Pass |
| `2.jpeg` | Fail — approved identity not found | Fail — approved identity not found | Required number not found | Changes required |

The fifth design (`2.jpeg`) contains a different medical symbol and unrelated visual identity. Similar placement or a generic icon is not accepted as an approved logo.

## Automated project checks

- API TypeScript: passed
- Web TypeScript: passed
- Jest: 4 suites passed
- Jest: 34 tests passed, 0 failed

Added regression coverage confirms:

1. Disabled orientation, dimensions, aspect-ratio, and color rules are not emitted as violations.
2. Enabled brand-color rules compare detected dominant colors with the client's approved colors.
3. Logo decisions require both visual-shape evidence and a minimum brand-color match.

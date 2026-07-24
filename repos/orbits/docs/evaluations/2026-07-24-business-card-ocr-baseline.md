# Business Card OCR Baseline — 2026-07-24

## Setup

- Model: `gemini-3.5-flash-lite`
- API: paid Gemini Interactions API
- Media resolution: `high`
- Thinking level: `minimal`
- Output: strict JSON schema
- Inputs: three 1280×1707 JPEG photographs supplied from outside the repository
- Retention: original images and extracted personal fields were not written to
  the repository

## Results

| Sample | Result | Latency | Input tokens | Output tokens | Estimated cost |
|---|---:|---:|---:|---:|---:|
| `card1.jpg` | Valid structured extraction | 5.163 s | 1,156 | 236 | $0.000937 |
| `card2.jpg` | Valid structured extraction | 6.021 s | 1,156 | 377 | $0.001289 |
| `card3.jpg` | Valid structured extraction | 5.934 s | 1,156 | 297 | $0.001089 |

Total estimated API cost: `$0.003315`.

Pricing uses the Gemini 3.5 Flash-Lite standard paid rates current on
2026-07-24: `$0.30` per million input tokens and `$2.50` per million output
tokens (including thinking tokens). Source:
[Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing).

The three cards are photographed in portrait orientation with the printed card
rotated sideways. Together they include Japanese and English text, small type,
multiple offices, repeated phone/fax values, a QR code, a romanized name, and
professional certifications.

## Manual Review

The model correctly recovered the core visible identity and contact fields in
all three samples during spot-checking:

- printed name;
- organization;
- role/title;
- email;
- primary and additional phone/fax values;
- visible office addresses;
- website when present.

This small run is not a statistically valid accuracy score. It did expose
schema and validation gaps:

1. Flat `phones`, `faxNumbers`, and `addresses` arrays lose which contact point
   belongs to which office.
2. A duplicate fax value may be legitimate for two offices, so blind
   deduplication would destroy information.
3. Romanized and native-script names need separate optional fields.
4. The model returned no review reasons even for multi-office cards; review
   policy must therefore be deterministic code, not model self-assessment.
5. Contact-point labels such as headquarters, regional office, mobile, and fax
   should be preserved when visible.

## Implementation Decision

Keep `gemini-3.5-flash-lite` as the test-stage baseline. Use labeled contact
points and deterministic review issues in the product contract. Do not add a
Document AI preprocessing stage based on this three-card sample; reconsider it
after the planned 30–50-card multilingual evaluation.

## Reproducible Redacted Evaluation

The repository now exposes:

```bash
npm run eval:business-card-ocr -- --input-dir /Users/xzhao/Documents/business-card
```

The command prints only filename, validity, model, latency, token counts,
estimated cost, and deterministic review issue codes. It does not print
extracted names, organizations, emails, phone numbers, addresses, raw provider
responses, image bytes, base64, or API keys.

The full application provider and review pipeline was rerun on all three inputs
after implementation:

| Sample | Result | Latency | Input tokens | Output tokens | Estimated cost | Review issues |
|---|---:|---:|---:|---:|---:|---:|
| `card1.jpg` | Valid | 5.862 s | 1,154 | 301 | $0.001099 | 1 |
| `card2.jpg` | Valid | 5.836 s | 1,154 | 640 | $0.001946 | 2 |
| `card3.jpg` | Valid | 5.278 s | 1,154 | 391 | $0.001324 | 2 |

Total estimated API cost for this second run: `$0.004369`. Token counts can vary
between runs even with the same model and schema, so the command is a regression
signal rather than a fixed-cost assertion. All three results remained valid,
and the deterministic rules surfaced the expected multi-office, shared contact
value, and native/romanized-name review cases without persisting the images or
creating contacts.

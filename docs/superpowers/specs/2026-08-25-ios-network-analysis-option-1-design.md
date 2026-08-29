# iOS Network Analysis Option 1 Design

## Goal

Expand the existing iOS relationship analysis into a goal-led decision screen that explains network composition, structural gaps, opportunities, and current health without changing Orbit's visual language.

## Selected Visual

`/Users/xzhao/.codex/generated_images/019f426d-ebdc-76a3-ae84-54acdaa9ca91/exec-2d36f581-6686-43bd-92f4-eca0c51fe9fa.png`

## Information Architecture

The screen keeps the existing title and editable relationship goal. Beneath it, a compact diagnosis explains the strongest area and the most important gap, with goal match shown only when a relationship goal exists.

A functional three-way segmented control presents:

- `概览`: industry distribution, structural dimensions, one deterministic structural insight, two priority opportunities, and current network health.
- `结构`: expanded industry, relationship-value, and relationship-strength distributions.
- `机会`: the complete ranked action list backed by existing opportunities and gap APIs.

## Data Rules

- Industry, value, strength, gaps, activity, and coverage use the existing dashboard APIs.
- Role-level coverage is derived from the existing contact role field.
- Missing information is shown as `待完善`; the interface never invents geographic or seniority percentages.
- Goal match is `--` until a goal exists.
- All visible copy is Simplified Chinese and does not expose provider or implementation language.

## Interaction

- Goal bar opens the existing goal editor.
- Segments switch locally without a network request.
- Industry rows open the contacts list with the corresponding industry tag when a stable tag is available; otherwise they open the unfiltered list.
- Opportunity rows preserve the current contact and workflow navigation.
- Health remains expandable.

## Visual Constraints

- Preserve current Orbit colors, typography, icons, surfaces, and spacing language.
- No gradients, nested cards, decorative imagery, fake avatars, or new icon system.
- Keep above-the-fold hierarchy focused on diagnosis and network structure.
- Use real data and accessible labels for every interactive control.

## Verification

- View-model tests cover populated, no-goal, and sparse-data states.
- Source tests cover the segmented control and all three analysis views.
- TypeScript and the complete iOS test suite must pass.
- iOS Simulator captures are compared side by side with the selected visual and recorded in project-root `design-qa.md`.

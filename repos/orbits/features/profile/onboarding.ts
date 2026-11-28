import type { ManualProfileContract, ProfileOnboardingContract, ProfileOnboardingFieldCode } from "../../shared/contract/profile";
import { isIndustryIdCode, validateIndustrySelection } from "../../shared/domain/industries";
import { matchFieldsNeedingConfirmation } from "./match-fields";

// Dates remain calendar strings. Validation never converts them to a local instant.
export function isValidProfileBirthDate(value: unknown, today = new Date().toISOString().slice(0, 10)): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function calculateProfileOnboarding(
  profile: (Pick<ManualProfileContract, "displayName" | "primaryIndustryId" | "secondaryIndustryId" | "birthDate"> & Pick<Partial<ManualProfileContract>, "matchFields">) | null,
  today?: string,
): ProfileOnboardingContract {
  const missingFields: ProfileOnboardingFieldCode[] = [];
  if (typeof profile?.displayName !== "string" || !profile.displayName.trim()) missingFields.push("displayName");
  // 2026-11-28: investors, students and "other" have no line of business, so no industry is asked of them.
  const noBusiness = ["investor", "student", "other"].includes(profile?.matchFields?.identity ?? "");
  if (!noBusiness) {
    if (!isIndustryIdCode(profile?.primaryIndustryId)) missingFields.push("primaryIndustryId");
    if (!profile?.secondaryIndustryId || !validateIndustrySelection(profile).valid) missingFields.push("secondaryIndustryId");
  }
  // R28 policy v2: an omitted birthday is optional; a supplied invalid date
  // still cannot certify completion (including legacy stored values).
  if (profile?.birthDate != null && !isValidProfileBirthDate(profile.birthDate, today)) missingFields.push("birthDate");
  const matchMissing = profile ? matchFieldsNeedingConfirmation(profile.matchFields) : [];
  return {
    policyVersion: 2,
    status: missingFields.length ? "incomplete" : "complete",
    missingFields,
    ...(profile ? { matchFields: { missingFields: matchMissing, status: matchMissing.length ? "pending" as const : "complete" as const } } : {}),
  };
}

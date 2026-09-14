import type { ManualProfileContract, ProfileOnboardingContract, ProfileOnboardingFieldCode } from "../../shared/contract/profile";
import { isIndustryIdCode, validateIndustrySelection } from "../../shared/domain/industries";

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
  profile: Pick<ManualProfileContract, "displayName" | "primaryIndustryId" | "secondaryIndustryId" | "birthDate"> | null,
  today?: string,
): ProfileOnboardingContract {
  const missingFields: ProfileOnboardingFieldCode[] = [];
  if (typeof profile?.displayName !== "string" || !profile.displayName.trim()) missingFields.push("displayName");
  if (!isIndustryIdCode(profile?.primaryIndustryId)) missingFields.push("primaryIndustryId");
  if (!profile?.secondaryIndustryId || !validateIndustrySelection(profile).valid) missingFields.push("secondaryIndustryId");
  if (!isValidProfileBirthDate(profile?.birthDate, today)) missingFields.push("birthDate");
  return { policyVersion: 1, status: missingFields.length ? "incomplete" : "complete", missingFields };
}

import { DEFAULT_RETURN_HREF, returnHref } from "./return-href";

export function safeProfileContinuationNext(next: string | string[] | undefined): string {
  return returnHref(next) ?? DEFAULT_RETURN_HREF;
}

export function profileContinuationHref(next: string | string[] | undefined): string {
  return `/profile/onboarding?next=${encodeURIComponent(safeProfileContinuationNext(next))}`;
}

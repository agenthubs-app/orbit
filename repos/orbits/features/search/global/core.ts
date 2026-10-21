// LF11: the R30 global search core moved to shared/compute/global-search.ts so the App runs the same grouping,
// ranking and empty-result rules on the device. This path stays for the server's existing imports.
export * from "../../../shared/compute/global-search";

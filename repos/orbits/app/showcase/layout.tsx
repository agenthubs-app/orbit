import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { shouldHideShowcase } from "./visibility";

// R02 / RD-15: developer showcases for the redesign (icons now; R06 adds the
// component library). Not a product surface.
export default function ShowcaseLayout({ children }: { children: ReactNode }) {
  if (shouldHideShowcase({ NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV })) notFound();
  return children;
}

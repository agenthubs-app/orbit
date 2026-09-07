import type { Metadata } from "next";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { PasswordResetForm } from "./reset-password-form";

export const metadata: Metadata = { title: "重置密码 · Orbit", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function PasswordResetPage() {
  return <><OrbitReferenceStyles /><PasswordResetForm /></>;
}

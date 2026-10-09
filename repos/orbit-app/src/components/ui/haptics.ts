// R04: web and test bundles have no haptics; the native build resolves
// haptics.native.ts (Metro platform extensions). Same signatures on purpose.
export function tapHaptic(): void {}

export function successHaptic(): void {}

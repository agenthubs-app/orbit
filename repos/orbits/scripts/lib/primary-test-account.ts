import { hash } from "bcryptjs";

import { AUTH_PASSWORD_MIN_LENGTH } from "../../features/auth/contract";
import type { AuthAccountProvisioningProvider } from "../../features/auth/storage/auth-account-provisioning-provider";
import {
  toAuthUserDTO,
  type AuthUserStorageProvider,
  type StoredAuthUser,
} from "../../features/auth/storage/auth-user-live-record-provider";

export const PRIMARY_TEST_ACCOUNT = {
  displayName: "Orbit QA",
  email: "qa@orbit.test",
  fallbackActorId: "user_orbit_primary_qa",
  passwordEnv: "ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD",
} as const;

export interface EnsurePrimaryTestAccountOptions {
  accountProvisioner: AuthAccountProvisioningProvider;
  now?: () => Date;
  password: string;
  provider: AuthUserStorageProvider;
}

/**
 * Keeps the public QA identity stable by email while preserving the actor id of
 * an existing account. Preserving that id keeps all prior QA data attached to
 * the same principal instead of forking a new account on every reset.
 */
export async function ensurePrimaryTestAccount({
  accountProvisioner,
  now = () => new Date(),
  password,
  provider,
}: EnsurePrimaryTestAccountOptions) {
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `${PRIMARY_TEST_ACCOUNT.passwordEnv} must contain at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
    );
  }

  const existing = await provider.getUserByEmail(PRIMARY_TEST_ACCOUNT.email);
  const timestamp = now().toISOString();
  const user: StoredAuthUser = {
    id: existing?.id ?? PRIMARY_TEST_ACCOUNT.fallbackActorId,
    email: PRIMARY_TEST_ACCOUNT.email,
    displayName: PRIMARY_TEST_ACCOUNT.displayName,
    provider: "credentials",
    passwordHash: await hash(password, 12),
    providerAccountId: null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  await provider.saveUser(user);
  const dto = toAuthUserDTO(user);
  await accountProvisioner.ensureAccountForUser(dto);
  return dto;
}

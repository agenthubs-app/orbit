// 认证核心逻辑,live/mock 共用;存储通过 AuthUserStorageProvider 注入。
// 密码用 bcryptjs cost 12(与参考实现 seiki-world 一致)。
import { compare, hash } from "bcryptjs";

import {
  AUTH_PASSWORD_MIN_LENGTH,
  authUserFailure,
  isValidAuthEmail,
  normalizeAuthEmail,
  type AuthUserResult,
  type OAuthUserInput,
  type RegisterUserInput,
  type VerifyCredentialsInput,
} from "./contract";
import type { AuthUserService } from "./service";
import {
  toAuthUserDTO,
  type AuthUserStorageProvider,
  type StoredAuthUser,
} from "./storage/auth-user-live-record-provider";

const BCRYPT_COST = 12;

export interface CreateAuthUserServiceOptions {
  provider: AuthUserStorageProvider | null;
  now?: () => Date;
}

function displayNameFor(email: string, displayName?: string): string {
  const name = displayName?.trim();

  return name && name.length > 0 ? name : normalizeAuthEmail(email).split("@")[0];
}

function newUserId(now: Date): string {
  return `user_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAuthUserService({
  provider,
  now = () => new Date(),
}: CreateAuthUserServiceOptions): AuthUserService {
  return {
    async registerUser(input: RegisterUserInput): Promise<AuthUserResult> {
      if (!provider) {
        return authUserFailure("AUTH_LIVE_STORE_UNCONFIGURED");
      }

      if (
        !isValidAuthEmail(input.email) ||
        typeof input.password !== "string" ||
        input.password.length < AUTH_PASSWORD_MIN_LENGTH
      ) {
        return authUserFailure("AUTH_INVALID_INPUT");
      }

      const email = normalizeAuthEmail(input.email);
      const existingUser = await provider.getUserByEmail(email);

      if (existingUser) {
        return authUserFailure("AUTH_EMAIL_TAKEN");
      }

      const timestamp = now().toISOString();
      const user: StoredAuthUser = {
        id: newUserId(now()),
        email,
        displayName: displayNameFor(email, input.displayName),
        provider: "credentials",
        passwordHash: await hash(input.password, BCRYPT_COST),
        providerAccountId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await provider.saveUser(user);

      return { data: { user: toAuthUserDTO(user) }, state: "success" };
    },

    async verifyCredentials(
      input: VerifyCredentialsInput,
    ): Promise<AuthUserResult> {
      if (!provider) {
        return authUserFailure("AUTH_LIVE_STORE_UNCONFIGURED");
      }

      if (!isValidAuthEmail(input.email) || !input.password) {
        return authUserFailure("AUTH_INVALID_CREDENTIALS");
      }

      const user = await provider.getUserByEmail(input.email);

      if (!user?.passwordHash) {
        return authUserFailure("AUTH_INVALID_CREDENTIALS");
      }

      const passwordMatches = await compare(input.password, user.passwordHash);

      if (!passwordMatches) {
        return authUserFailure("AUTH_INVALID_CREDENTIALS");
      }

      return { data: { user: toAuthUserDTO(user) }, state: "success" };
    },

    async getOrCreateOAuthUser(input: OAuthUserInput): Promise<AuthUserResult> {
      if (!provider) {
        return authUserFailure("AUTH_LIVE_STORE_UNCONFIGURED");
      }

      if (!isValidAuthEmail(input.email)) {
        return authUserFailure("AUTH_INVALID_INPUT");
      }

      const email = normalizeAuthEmail(input.email);
      const existingUser = await provider.getUserByEmail(email);

      // 同邮箱已有账号(含密码注册的)直接复用:IdP 已验证邮箱所有权,
      // 与参考实现 allowDangerousEmailAccountLinking 的语义一致。
      if (existingUser) {
        return { data: { user: toAuthUserDTO(existingUser) }, state: "success" };
      }

      const timestamp = now().toISOString();
      const user: StoredAuthUser = {
        id: newUserId(now()),
        email,
        displayName: displayNameFor(email, input.displayName),
        provider: input.provider,
        passwordHash: null,
        providerAccountId: input.providerAccountId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await provider.saveUser(user);

      return { data: { user: toAuthUserDTO(user) }, state: "success" };
    },
  };
}

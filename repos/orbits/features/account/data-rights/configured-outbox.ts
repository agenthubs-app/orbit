import { createTransactionalMailer } from "../../mail/transactional";
import { createConfiguredExpoPushAdapter } from "../../notifications/push-adapter";
import { createPushDeviceService } from "../../notifications/push-device-service";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { createAccountRightsOutbox, type AccountRightsMessage } from "./outbox";

function detailPath(message: AccountRightsMessage): string {
  if (message.kind === "export-ready") return `/app/settings/exports?id=${encodeURIComponent(message.exportId ?? "")}`;
  return message.kind === "deletion-request" ? "/app/account/pending" : "/app/account/deleted";
}

function copy(message: AccountRightsMessage): { subject: string; text: string; title: string; body: string } {
  const link = detailPath(message);
  if (message.kind === "export-ready") return {
    subject: "Orbit: データの書き出しが完了しました",
    text: `データの書き出しが完了しました。ログインして詳細を確認してください。\n${link}`,
    title: "データの書き出しが完了しました", body: "ログインして詳細を確認してください。",
  };
  if (message.kind === "deletion-request") return {
    subject: "Orbit: アカウント削除の申請を受け付けました",
    text: `アカウント削除の申請を受け付けました。ご自身の操作でない場合はログインして申請を取り消してください。\n${link}`,
    title: "アカウント削除の申請を受け付けました", body: "ご自身の操作でない場合は申請を取り消してください。",
  };
  return {
    subject: "Orbit: アカウントの削除が完了しました",
    text: `アカウントの削除が完了しました。\n${link}`,
    title: "アカウントの削除が完了しました", body: "アカウントの削除が完了しました。",
  };
}

export function createConfiguredAccountRightsOutbox() {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const { client: db, workspaceId } = runtime;
  const mailer = createTransactionalMailer();
  const push = createConfiguredExpoPushAdapter();
  return createAccountRightsOutbox({ db, workspaceId, deliver: {
    async mail(message) {
      const email = await resolveAccountRightsEmail(db, workspaceId, message.actorId);
      if (!email) return "unavailable";
      const content = copy(message);
      const delivered = await mailer.send({ to: email, subject: content.subject, text: content.text,
        idempotencyKey: `account-rights:${message.id}:mail` });
      if (delivered.delivered) return "delivered";
      if (delivered.reason === "rejected") return "retry";
      return delivered.reason === "failed" ? "uncertain" : "unavailable";
    },
    async push(message) {
      if (!push || !process.env.ORBIT_PUSH_TOKEN_KEY) return "unavailable";
      const devices = await createPushDeviceService({ actorId: message.actorId }).listActive();
      if (!devices.length) return "unavailable";
      const content = copy(message);
      let sent = 0;
      for (const device of devices) {
        try {
          await push.send({ token: device.token, title: content.title, body: content.body,
            data: { url: detailPath(message), notificationId: message.id } });
          sent++;
        } catch (error) {
          return sent === 0 && (error as { notAccepted?: unknown }).notAccepted === true ? "retry" : "uncertain";
        }
      }
      return "delivered";
    },
  } });
}

export async function resolveAccountRightsEmail(db: TransactionalSqlExecutor, workspaceId: string, actorId: string): Promise<string | null> {
  const users = await db.query<{ email: string | null }>(`select a.payload->>'email' as email from orbit_records a
    where a.workspace_id=$1 and a.collection_name='auth_users' and a.lifecycle_state='active' and
    a.payload->>'id' in (select p.provider_record_id from orbit_records p where p.workspace_id=$1
      and p.collection_name='profiles' and p.user_id=$2 and p.payload->>'accountId'=$2 and p.lifecycle_state='active'
      and p.provider_record_id is not null)
    limit 2`, [workspaceId, actorId]);
  return users.rows.length === 1 && users.rows[0]?.email ? users.rows[0].email : null;
}

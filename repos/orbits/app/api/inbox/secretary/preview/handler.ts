import { NextResponse } from 'next/server';
import { resolveAuthenticatedApiActor, authenticatedApiActorRequiredResponse, type ResolveAuthenticatedApiActor } from '../../../_shared/authenticated-actor';
import { parseSecretaryPreviewForActor, secretaryPreviewSchema } from '../../../../../shared/api-schema/secretary-preview';
import { failure, runtimeBoundaryHeaders, success } from '../../../../../shared/api/envelope';
import { resolveFeatureMode, type FeatureMode } from '../../../../../shared/config/feature-mode';
import { AppError } from '../../../../../shared/errors/app-error';
import { demoSecretaryPreview } from '../../../../../shared/mock/demo-world/fixtures';
import { buildSecretaryPreview } from '../../../../../shared/compute/secretary-source';
import { readConfiguredSecretaryPages, type SecretaryPage } from '../../../../../features/notifications/secretary/preview-reader';

export function createSecretaryPreviewGetHandler(options: { resolveActor?: ResolveAuthenticatedApiActor; mode?: () => FeatureMode; readLive?: (actorId: string) => Promise<SecretaryPage[] | null>; now?: () => string } = {}) {
  return async function GET(): Promise<Response> {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse('live');
    const mode = (options.mode ?? resolveFeatureMode)();
    const actorId = actor.accountId ?? actor.id;
    if (mode === 'mock') {
      const data = secretaryPreviewSchema.parse(demoSecretaryPreview(actorId));
      return NextResponse.json(success(data), { headers: runtimeBoundaryHeaders(mode) });
    }
    try {
      const pages = await (options.readLive ?? (id => readConfiguredSecretaryPages(id, actor.workspaceId)))(actorId);
      if (pages === null) {
        return NextResponse.json(failure(new AppError('SERVICE_UNAVAILABLE', 'Secretary preview is not available yet'), {
          capabilityId: 'secretary-preview', reason: 'NOT_IMPLEMENTED', requestedMode: mode,
        }), { status: 503, headers: runtimeBoundaryHeaders(mode) });
      }
      const notifications = pages.flatMap(page => page.items);
      if (notifications.some(notification => notification.actorId !== actorId)) throw new Error('Secretary preview owner mismatch');
      const data = parseSecretaryPreviewForActor(buildSecretaryPreview(actorId, notifications.map(notification => ({
        notification, sourceState: notification.target.status === 'available' ? 'available' as const : 'unavailable' as const,
      })), (options.now ?? (() => new Date().toISOString()))()), actorId);
      return NextResponse.json(success(data), { headers: runtimeBoundaryHeaders(mode) });
    } catch {
      return NextResponse.json(failure(new AppError('SERVICE_UNAVAILABLE', 'Secretary preview is temporarily unavailable')),
        { status: 503, headers: runtimeBoundaryHeaders(mode) });
    }
  };
}

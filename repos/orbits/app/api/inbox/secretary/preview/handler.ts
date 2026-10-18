import { NextResponse } from 'next/server';
import { resolveAuthenticatedApiActor, authenticatedApiActorRequiredResponse, type ResolveAuthenticatedApiActor } from '../../../_shared/authenticated-actor';
import { secretaryPreviewSchema } from '../../../../../shared/api-schema/secretary-preview';
import { failure, runtimeBoundaryHeaders, success } from '../../../../../shared/api/envelope';
import { resolveFeatureMode, type FeatureMode } from '../../../../../shared/config/feature-mode';
import { AppError } from '../../../../../shared/errors/app-error';
import { demoSecretaryPreview } from '../../../../../shared/mock/demo-world/fixtures';

/** M0: mock is usable by R10; live stays visibly unavailable until SC-04. */
export function createSecretaryPreviewGetHandler(options: { resolveActor?: ResolveAuthenticatedApiActor; mode?: () => FeatureMode } = {}) {
  return async function GET(): Promise<Response> {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse('live');
    const mode = (options.mode ?? resolveFeatureMode)();
    if (mode !== 'mock') {
      return NextResponse.json(failure(new AppError('SERVICE_UNAVAILABLE', 'Secretary preview is not available yet'), {
        capabilityId: 'secretary-preview', reason: 'NOT_IMPLEMENTED', requestedMode: mode,
      }), { status: 503, headers: runtimeBoundaryHeaders(mode) });
    }
    const data = secretaryPreviewSchema.parse(demoSecretaryPreview(actor.accountId ?? actor.id));
    return NextResponse.json(success(data), { headers: runtimeBoundaryHeaders(mode) });
  };
}

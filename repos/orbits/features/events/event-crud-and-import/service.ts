import type {
  EventCrudImportFailure,
  EventCrudImportInput,
  EventDetailInput,
  EventDetailResult,
  EventListResult,
  ManualEventCreationInput,
  ManualEventCreationResult,
} from "./contract";
import {
  eventCrudImportErrorContext,
  eventCrudImportErrorToAppError,
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
} from "./contract";

export type EventCrudAndImportServiceResult<TResult> =
  TResult | Promise<TResult>;

// EventCrudAndImportService 定义活动列表、详情和手动创建预览的服务边界。
// 当前实现仍是 mock-first：不会写真实日历，也不会导入外部活动源。
export interface EventCrudAndImportService {
  // 读取活动列表，供活动页和 dashboard 入口复用。
  listEvents: (
    input?: EventCrudImportInput,
  ) => EventCrudAndImportServiceResult<EventListResult>;
  // 创建活动的可复核结果；真实持久化需要后续 live 实现接入。
  createEvent: (
    input?: ManualEventCreationInput,
  ) => EventCrudAndImportServiceResult<ManualEventCreationResult>;
  // 按活动 ID 读取详情。
  getEvent: (
    input: EventDetailInput,
  ) => EventCrudAndImportServiceResult<EventDetailResult>;
}

export {
  eventCrudImportErrorContext,
  eventCrudImportErrorToAppError,
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
};

export type {
  EventCrudImportFailure,
  EventDetailResult,
  EventListResult,
  ManualEventCreationResult,
};

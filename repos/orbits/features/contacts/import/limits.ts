/**
 * W0053：联系人导入的上限与常量（W53-3：单文件 5 MB、2,000 行；W53-6：解析行在批次结束 7 天后清理）。
 */
export const CONTACT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const CONTACT_IMPORT_MAX_ROWS = 2_000;
/** 核对表分页。 */
export const CONTACT_IMPORT_PAGE_SIZE = 50;
/** 每个写入事务最多处理的行数（也是一次三层更新入口调用的人数上限，与 enqueuePlanMatchJob 的 200 一致）。 */
export const CONTACT_IMPORT_CHUNK_SIZE = 200;
/** 批次完成／取消后解析行的保留期。未完成的批次从创建起算同样 7 天过期。 */
export const CONTACT_IMPORT_ROW_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 单个字段的最大长度（超出截断并记一条解析问题）。 */
export const CONTACT_IMPORT_MAX_FIELD_LENGTH = 500;
export const CONTACT_IMPORT_MAX_NOTES_LENGTH = 4_000;

import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  businessCardScanOcrFailureContext,
  businessCardScanOcrFailureToAppError,
  type BusinessCardScanOcrInput,
} from "../../../../../features/acquisition/business-card-contract";
import { createBusinessCardScanOcrService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// business-card scan route 是名片 OCR 草稿入口。
// route 只兼容 form/json 两种上传表达；OCR 解析、草稿生成和 provenance 在 scan service 中。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFormText(
  formData: FormData,
  fieldName: string,
): string | undefined {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : undefined;
}

async function readBusinessCardScanInput(
  request: Request,
  scenario: string | null,
): Promise<BusinessCardScanOcrInput> {
  const contentType = request.headers.get("content-type") ?? "";

  // 表单路径服务浏览器表单或 multipart 上传；当前 mock 只读取 imageText/imageName。
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      scenario,
      imageText: readFormText(formData, "imageText"),
      imageName: readFormText(formData, "imageName"),
    };
  }

  // 非 JSON/form 请求只保留 scenario，由 service 决定默认或失败状态。
  if (!contentType.includes("application/json")) {
    return { scenario };
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return { scenario };
  }

  // JSON 路径服务 fetch 调用；route 不在这里做 OCR 业务校验。
  const parsedBody: unknown = JSON.parse(rawBody);
  const body = isRecord(parsedBody) ? parsedBody : {};

  return {
    scenario,
    imageText: typeof body.imageText === "string" ? body.imageText : undefined,
    imageName: typeof body.imageName === "string" ? body.imageName : undefined,
  };
}

export async function POST(request: Request): Promise<Response> {
  // scanBusinessCard 返回的是可复核 contact draft，不会直接创建联系人。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const scanService = createBusinessCardScanOcrService(mode);
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = await scanService.scanBusinessCard(
    await readBusinessCardScanInput(request, scenario),
  );

  if (result.success === false) {
    // OCR scan failure 统一映射成 AppError/envelope。
    const appError = businessCardScanOcrFailureToAppError(result);

    return NextResponse.json(
      failure(appError, businessCardScanOcrFailureContext(result, mode)),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  }

  return NextResponse.json(success(result.data), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}

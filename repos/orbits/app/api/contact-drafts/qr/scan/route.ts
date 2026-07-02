import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  qrScanConnectFailureContext,
  qrScanConnectFailureToAppError,
  type QrScanConnectInput,
} from "../../../../../features/acquisition/qr-contract";
import { createQrScanConnectService } from "../../../../../features/acquisition/service-factory";

export const dynamic = "force-dynamic";

// QR scan route 是扫码建立联系人草稿的入口。
// route 只解析 QR 文本和显示标签；二维码内容解释、草稿生成在 QR service 中。
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

async function readQrScanInput(
  request: Request,
  scenario: string | null,
): Promise<QrScanConnectInput> {
  const contentType = request.headers.get("content-type") ?? "";

  // 表单路径兼容普通页面提交和 multipart 上传。
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      scenario,
      qrText: readFormText(formData, "qrText"),
      scanLabel: readFormText(formData, "scanLabel"),
    };
  }

  // 其他 content type 不解析 body，只把 scenario 交给 service。
  if (!contentType.includes("application/json")) {
    return { scenario };
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return { scenario };
  }

  // JSON 路径只接受 qrText/scanLabel 两个字段，避免任意 body 字段进入 contract。
  const parsedBody: unknown = JSON.parse(rawBody);
  const body = isRecord(parsedBody) ? parsedBody : {};

  return {
    scenario,
    qrText: typeof body.qrText === "string" ? body.qrText : undefined,
    scanLabel:
      typeof body.scanLabel === "string" ? body.scanLabel : undefined,
  };
}

export async function POST(request: Request): Promise<Response> {
  // scanQrCode 只生成待确认草稿，不在 route 层保存联系人或发送通知。
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const scanService = createQrScanConnectService(mode);
  const scenario = new URL(request.url).searchParams.get("scenario");
  const result = await scanService.scanQrCode(
    await readQrScanInput(request, scenario),
  );

  if (result.success === false) {
    // QR scan failure 统一映射成 AppError/envelope。
    const appError = qrScanConnectFailureToAppError(result);

    return NextResponse.json(
      failure(appError, qrScanConnectFailureContext(result, mode)),
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

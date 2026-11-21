import { GET as resourceMetadata } from "../route";

export const dynamic = "force-dynamic";

// agent-design AG17：带路径的写法（RFC 9728 §3.1）。资源地址有路径（/connect）时客户端先试这个地址，内容相同。
export async function GET(request: Request): Promise<Response> {
  return resourceMetadata(request);
}

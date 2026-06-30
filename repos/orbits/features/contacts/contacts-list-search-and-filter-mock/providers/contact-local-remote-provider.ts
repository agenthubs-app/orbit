import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../../shared/domain/contracts";
import {
  createOrbitLocalRemoteDatabase,
  type OrbitLocalRemoteDatabase,
} from "../../../../shared/local-remote-store/orbit-database";

// LocalRemoteContactGraph 是 contacts 列表需要的最小图数据：
// contacts 提供展示字段，connections 提供关系摘要/价值类型，evidence 提供来源证据。
export interface LocalRemoteContactGraph {
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
}

// provider 把“从哪里读数据”封装起来，hybrid service 不直接依赖 store 实现。
export interface ContactLocalRemoteProvider {
  readContactGraph: () => LocalRemoteContactGraph;
}

export interface ContactLocalRemoteProviderOptions {
  database?: OrbitLocalRemoteDatabase;
}

// 默认 provider 读取 Orbit local remote database。
// 未来换成 Supabase/Postgres/HTTP 时，只需要替换 provider，不改 contacts contract 映射。
export function createContactLocalRemoteProvider(
  options: ContactLocalRemoteProviderOptions = {},
): ContactLocalRemoteProvider {
  const database = options.database ?? createOrbitLocalRemoteDatabase();

  return {
    readContactGraph() {
      // getState 返回 clone 后的状态，因此这里直接切出 contacts/connections/evidence 是安全的。
      const state = database.getState();

      return {
        connections: state.connections,
        contacts: state.contacts,
        evidence: state.evidence,
        generatedAt: state.generatedAt,
      };
    },
  };
}

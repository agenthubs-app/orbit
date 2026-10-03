"use client";

/**
 * W0045（W45-2）：联系人详情弹窗 hero 区的行业／职级／地区轻量编辑。
 * 保存走 PATCH /api/contacts/[id]，服务端把改动的字段来源记为 `user`，之后补全不再覆盖。
 * 对标 HubSpot／Apollo 记录侧栏行内改属性。
 * W0060：头卡里显示为三个小 chip（行业「一级 / 二级」、职级四档派生名、地区），点任一 chip 打开同一个编辑表单；
 * 编辑能力、写入接口与来源规则不变。来源（AI 推断／名片规则／手动）放在 chip 的提示里；`trailing` 接在 chip 后面
 * （头卡的「· 来自 {来源} · {日期}」）。
 */
import { useState, type ReactNode } from "react";
import { z } from "zod";

import { INDUSTRY_CATALOG, industryLabel, isIndustryIdCode, listSecondaryIndustries, secondaryIndustryLabel, validateIndustrySelection } from "../../../../../shared/domain/industries";
import { REGION_CITY_ALIASES, REGION_COMMON_COUNTRY_CODES, countryDisplayName, regionDisplayName } from "../../../../../shared/domain/regions";
import { SENIORITY_GROUP_LABELS, SENIORITY_LEVELS, SENIORITY_LEVEL_LABELS, isSeniorityLevelValue, seniorityGroup } from "../../../../../shared/domain/seniority";
import type { OrbitContactView } from "../../orbit-contacts-route-view-model";

type Translate = (copy: { en: string; zh: string }) => string;
type Origin = "ai" | "user" | "card";
type Field = "industry" | "seniorityLevel" | "region";

interface EnrichmentValues {
  primaryIndustryId: string | null;
  secondaryIndustryId: string | null;
  seniorityLevel: string | null;
  countryCode: string | null;
  city: string | null;
}

const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    contact: z.object({
      primaryIndustryId: z.string().nullish(),
      secondaryIndustryId: z.string().nullish(),
      seniorityLevel: z.string().nullish(),
      region: z.object({ countryCode: z.string(), city: z.string().nullable() }).nullish(),
      enrichment: z.object({ fields: z.record(z.string(), z.object({ origin: z.enum(["ai", "user", "card"]) })) }).nullish(),
    }),
  }),
});

function valuesOf(contact: OrbitContactView): EnrichmentValues {
  return {
    primaryIndustryId: contact.primaryIndustryId ?? null,
    secondaryIndustryId: contact.secondaryIndustryId ?? null,
    seniorityLevel: contact.seniorityLevel ?? null,
    countryCode: contact.region?.countryCode ?? null,
    city: contact.region?.city ?? null,
  };
}

const SAVE_TIMEOUT_MS = 20_000;

const ORIGIN_COPY: Record<Origin, { en: string; zh: string }> = {
  ai: { en: "AI", zh: "AI 推断" },
  card: { en: "From card", zh: "名片规则" },
  user: { en: "Manual", zh: "手动" },
};

export function ContactEnrichmentInline({ contact, guardWrite, language, t, trailing = null }: {
  contact: OrbitContactView;
  guardWrite?: (label: string) => void;
  language: "zh" | "en" | "ja";
  t: Translate;
  trailing?: ReactNode;
}) {
  const [saved, setSaved] = useState<EnrichmentValues>(() => valuesOf(contact));
  const [origins, setOrigins] = useState<Partial<Record<Field, Origin>>>(() => ({ ...(contact.enrichmentOrigins ?? {}) }));
  const [draft, setDraft] = useState<EnrichmentValues>(saved);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lang = language === "en" ? "en" : "zh";
  const dash = "—";

  const industryText = saved.primaryIndustryId && isIndustryIdCode(saved.primaryIndustryId)
    ? [industryLabel(saved.primaryIndustryId, language), saved.secondaryIndustryId ? secondaryIndustryLabel(saved.secondaryIndustryId as Parameters<typeof secondaryIndustryLabel>[0], language) : null].filter(Boolean).join(" / ")
    : null;
  // chip 显示四档派生名（决策层…）；具体职级放在提示里。
  const seniorityText = isSeniorityLevelValue(saved.seniorityLevel) ? t(SENIORITY_GROUP_LABELS[seniorityGroup(saved.seniorityLevel)]) : null;
  const seniorityDetail = isSeniorityLevelValue(saved.seniorityLevel)
    ? `${t(SENIORITY_LEVEL_LABELS[saved.seniorityLevel])} · ${t(SENIORITY_GROUP_LABELS[seniorityGroup(saved.seniorityLevel)])}`
    : null;
  const regionText = saved.countryCode ? regionDisplayName({ countryCode: saved.countryCode, city: saved.city }, lang) : null;

  const changed = {
    industry: draft.primaryIndustryId !== saved.primaryIndustryId || draft.secondaryIndustryId !== saved.secondaryIndustryId,
    seniorityLevel: draft.seniorityLevel !== saved.seniorityLevel,
    region: draft.countryCode !== saved.countryCode || (draft.city ?? "").trim() !== (saved.city ?? ""),
  };
  const industryValid = validateIndustrySelection({ primaryIndustryId: draft.primaryIndustryId, secondaryIndustryId: draft.secondaryIndustryId }).valid;
  const dirty = changed.industry || changed.seniorityLevel || changed.region;

  function startEdit() {
    if (guardWrite) {
      guardWrite(t({ en: "contact profile", zh: "联系人资料" }));
      return;
    }
    setDraft(saved);
    setStatus("idle");
    setEditing(true);
  }

  async function save() {
    if (!dirty || !industryValid || status === "saving") return;
    setStatus("saving");
    const body: Record<string, unknown> = {};
    if (changed.industry) Object.assign(body, { primaryIndustryId: draft.primaryIndustryId, secondaryIndustryId: draft.secondaryIndustryId });
    if (changed.seniorityLevel) body.seniorityLevel = draft.seniorityLevel;
    if (changed.region) body.region = draft.countryCode ? { countryCode: draft.countryCode, city: draft.city?.trim() || null } : null;
    // 请求挂住时不能一直停在「正在保存」：超时按失败处理，修改保留可重试。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("save failed");
      const next = responseSchema.parse(await response.json()).data.contact;
      const values: EnrichmentValues = {
        primaryIndustryId: next.primaryIndustryId ?? null,
        secondaryIndustryId: next.secondaryIndustryId ?? null,
        seniorityLevel: next.seniorityLevel ?? null,
        countryCode: next.region?.countryCode ?? null,
        city: next.region?.city ?? null,
      };
      setSaved(values);
      setDraft(values);
      setOrigins(Object.fromEntries(Object.entries(next.enrichment?.fields ?? {}).map(([field, provenance]) => [field, provenance.origin])) as Partial<Record<Field, Origin>>);
      setStatus("saved");
      setEditing(false);
    } catch {
      setStatus("error");
    } finally {
      clearTimeout(timer);
    }
  }

  const FIELD_LABEL: Record<Field, { en: string; zh: string }> = {
    industry: { en: "Industry", zh: "行业" },
    region: { en: "Region", zh: "地区" },
    seniorityLevel: { en: "Seniority", zh: "职级" },
  };
  const chip = (field: Field, value: string | null, detail: string | null = value) => {
    const origin = origins[field];
    const label = t(FIELD_LABEL[field]);
    const hint = [label, detail ?? dash, origin ? t(ORIGIN_COPY[origin]) : null].filter(Boolean).join(" · ");
    return (
      <button
        type="button"
        className={`btn nw-enrich-chip${value ? "" : " nw-enrich-chip-empty"}`}
        data-enrichment-field={field}
        data-enrichment-edit={field}
        data-enrichment-origin={origin}
        title={hint}
        aria-label={t({ en: `Edit ${label.toLowerCase()}: ${detail ?? "not set"}`, zh: `编辑${label}：${detail ?? "未填写"}` })}
        onClick={startEdit}
      >
        {value ?? `＋ ${label}`}
      </button>
    );
  };
  const busy = status === "saving";
  const countries = draft.countryCode && !REGION_COMMON_COUNTRY_CODES.includes(draft.countryCode) ? [draft.countryCode, ...REGION_COMMON_COUNTRY_CODES] : REGION_COMMON_COUNTRY_CODES;

  return (
    <div className="nw-enrich" data-network-detail-enrichment>
      {!editing ? (
        <div className="nw-enrich-row">
          {chip("industry", industryText)}
          {chip("seniorityLevel", seniorityText, seniorityDetail)}
          {chip("region", regionText)}
          {trailing}
          {status === "saved" ? <span role="status" className="nw-enrich-status">{t({ en: "Saved", zh: "已保存" })}</span> : null}
        </div>
      ) : (
        <div className="nw-enrich-form">
          <label className="nw-enrich-field">
            <span className="nw-enrich-l">{t({ en: "Industry", zh: "行业" })}</span>
            <span className="nw-enrich-pair">
              <select aria-label={t({ en: "Primary industry", zh: "一级行业" })} disabled={busy} value={draft.primaryIndustryId ?? ""} onChange={event => setDraft(current => ({ ...current, primaryIndustryId: event.target.value || null, secondaryIndustryId: event.target.value === current.primaryIndustryId ? current.secondaryIndustryId : null }))}>
                <option value="">{t({ en: "Unclassified", zh: "未分类" })}</option>
                {INDUSTRY_CATALOG.map(industry => <option key={industry.id} value={industry.id}>{industry.labels[language]}</option>)}
              </select>
              <select aria-label={t({ en: "Secondary industry", zh: "二级行业" })} disabled={busy || !isIndustryIdCode(draft.primaryIndustryId)} value={draft.secondaryIndustryId ?? ""} onChange={event => setDraft(current => ({ ...current, secondaryIndustryId: event.target.value || null }))}>
                <option value="">{t({ en: "Not set", zh: "二级未填写" })}</option>
                {isIndustryIdCode(draft.primaryIndustryId) ? listSecondaryIndustries(draft.primaryIndustryId).map(industry => <option key={industry.id} value={industry.id}>{industry.labels[language]}</option>) : null}
              </select>
            </span>
          </label>
          <label className="nw-enrich-field">
            <span className="nw-enrich-l">{t({ en: "Seniority", zh: "职级" })}</span>
            <select aria-label={t({ en: "Seniority", zh: "职级" })} disabled={busy} value={draft.seniorityLevel ?? ""} onChange={event => setDraft(current => ({ ...current, seniorityLevel: event.target.value || null }))}>
              <option value="">{t({ en: "Not set", zh: "未填写" })}</option>
              {SENIORITY_LEVELS.map(level => <option key={level} value={level}>{t(SENIORITY_LEVEL_LABELS[level])}</option>)}
            </select>
          </label>
          <label className="nw-enrich-field">
            <span className="nw-enrich-l">{t({ en: "Region", zh: "地区" })}</span>
            <span className="nw-enrich-pair">
              <select aria-label={t({ en: "Country", zh: "国家／地区" })} disabled={busy} value={draft.countryCode ?? ""} onChange={event => setDraft(current => ({ ...current, countryCode: event.target.value || null, city: event.target.value === current.countryCode ? current.city : null }))}>
                <option value="">{t({ en: "Not set", zh: "未填写" })}</option>
                {countries.map(code => <option key={code} value={code}>{countryDisplayName(code, lang)}</option>)}
              </select>
              <input aria-label={t({ en: "City", zh: "城市" })} disabled={busy || !draft.countryCode} list="nw-enrich-cities" placeholder={t({ en: "City (e.g. Tokyo)", zh: "城市（英文，如 Tokyo）" })} value={draft.city ?? ""} onChange={event => setDraft(current => ({ ...current, city: event.target.value }))} />
              <datalist id="nw-enrich-cities">
                {REGION_CITY_ALIASES.filter(entry => entry.countryCode === draft.countryCode).map(entry => <option key={entry.city} value={entry.city}>{entry.labels[language]}</option>)}
              </datalist>
            </span>
          </label>
          {status === "error" ? <p role="alert" className="nw-enrich-error">{t({ en: "Could not save. Your changes are still here; please retry.", zh: "未能保存，修改仍保留，请重试。" })}</p> : null}
          <span className="nw-enrich-actions">
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { setEditing(false); setStatus("idle"); }}>{t({ en: "Cancel", zh: "取消" })}</button>
            <button type="button" className="btn btn-primary" data-enrichment-save disabled={busy || !dirty || !industryValid} onClick={save}>{busy ? t({ en: "Saving…", zh: "正在保存…" }) : t({ en: "Save", zh: "保存" })}</button>
          </span>
        </div>
      )}
    </div>
  );
}

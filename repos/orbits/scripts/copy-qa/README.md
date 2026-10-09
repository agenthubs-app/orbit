# copy-qa — R03 翻译质量循环的自动检查

规则来源：`docs/designs/redesign-2026-10/sprints/R03-copy-and-ja/glossary.md`（开头的「全局禁用清单」与匹配方式）和 `style-guide.md`（标 ✔ 的条目）。文档与代码不一致时以文档为准、改代码。

## 用法（在 `repos/orbits`）

| 命令 | 检查什么 |
| --- | --- |
| `npm run copy:qa` | 标准用词 `shared/copy`、Web `app/(app)/app/orbit-2026/copy/`、App 范围内的域（`cli.mjs` 的 `APP_DOMAINS_IN_SCOPE`） |
| `npm run copy:qa -- --shared` / `--web` | 只查一类 |
| `npm run copy:qa -- --app tasks,notes` | 查指定的 App 域字典（`repos/orbit-app/src/i18n/<lang>/<domain>.ts`） |
| `--json` | 机器可读输出 |

有问题时退出码 1。功能 Sprint 重写旧屏后，把自己的域加进 `APP_DOMAINS_IN_SCOPE`，并在 App `src/i18n/copy-kinds.ts` 给每个键登记组件类型。

## 组件类型（决定长度和语气规则）

`chip`、`toast`、`button`、`fullButton`、`swipe`、`nav`、`tab`、`dialogTitle`、`confirmTitle`、`banner`、`label`、`sentence`、`menu`。标准用词的类型在 `kinds.mjs`，App 的在 App `src/i18n/copy-kinds.ts`，Web 的写在文案对象的 `kind` 字段。

## 规则

| 规则 | 内容 | 依据 |
| --- | --- | --- |
| `kind` | App 键没有登记组件类型 | R03 复核 M1 |
| `empty` | 某种语言为空 | style-guide §4 |
| `placeholders` | 三语占位符不一致 | style-guide §4 |
| `forbidden` | 全局禁用清单：笼统失败句、Orbit 主语的「送信」、私たち、过度敬语、英文 we / Sent / Send；中文「已发送」类只在按钮和 Toast 里查 | glossary 全局禁用清单 |
| `glossary` | 全局禁用清单里的术语写法（コンタクト、受信トレイ、ドラフト、リトライ、ToDo、词尾缺长音等），外部服务名白名单 | glossary 全局禁用清单 |
| `length` | 按组件类型的长度上限（日 / 中按全角计，半角 0.5、占位符 2、末尾括号补充不计；英文按字符） | style-guide §1.2、§3 |
| `simplified-in-ja` | 日文里出现简体字形 | style-guide §1.3 |
| `untranslated` | 日中完全相同（同形词白名单 `SAME_OK`） | style-guide §4 |
| `tone` | 按钮不用です・ます；标签和 Toast 不加「。」；正文用です・ます并加「。」；确认框标题是问句；英文 sentence case、`{count}` 后不接复数名词 | style-guide §1.1、§3 |
| `width` | 全角半角、括号、问号、日期空格、波浪线 U+301C、拉丁字母与日文之间的空格、中文数字空格、中文标点 | style-guide §1.3、§2 |

`check.mjs` 里还有少量比全局禁用清单更细的写法检查（如 `再試行してください`），都在术语表对应行的「禁用写法」里有出处。

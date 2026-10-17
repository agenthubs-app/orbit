// Generated from shared/mock/demo-world/account.ts. Only load inside an __DEV__ guard.
export const accountDesignFixtures = {
  "integrations": {
    "empty": [
      {
        "authorizationId": "demo-gmail",
        "provider": "gmail",
        "scopes": [],
        "capabilities": [],
        "status": "pending",
        "healthStatus": "not_checked",
        "healthMessage": "",
        "createdAt": "2026-10-07T00:00:00.000Z",
        "updatedAt": "2026-10-07T00:00:00.000Z",
        "sample": true
      },
      {
        "authorizationId": "demo-google_calendar",
        "provider": "google_calendar",
        "scopes": [],
        "capabilities": [],
        "status": "pending",
        "healthStatus": "not_checked",
        "healthMessage": "",
        "createdAt": "2026-10-07T00:00:00.000Z",
        "updatedAt": "2026-10-07T00:00:00.000Z",
        "sample": true
      }
    ],
    "few": [
      {
        "authorizationId": "demo-gmail",
        "provider": "gmail",
        "scopes": [],
        "capabilities": [],
        "status": "active",
        "healthStatus": "healthy",
        "healthMessage": "",
        "createdAt": "2026-10-07T00:00:00.000Z",
        "updatedAt": "2026-10-07T00:00:00.000Z",
        "sample": true
      },
      {
        "authorizationId": "demo-google_calendar",
        "provider": "google_calendar",
        "scopes": [],
        "capabilities": [],
        "status": "pending",
        "healthStatus": "not_checked",
        "healthMessage": "",
        "createdAt": "2026-10-07T00:00:00.000Z",
        "updatedAt": "2026-10-07T00:00:00.000Z",
        "sample": true
      }
    ],
    "many": [
      {
        "authorizationId": "demo-gmail",
        "provider": "gmail",
        "scopes": [],
        "capabilities": [],
        "status": "active",
        "healthStatus": "healthy",
        "healthMessage": "",
        "createdAt": "2026-10-07T00:00:00.000Z",
        "updatedAt": "2026-10-07T00:00:00.000Z",
        "sample": true
      },
      {
        "authorizationId": "demo-google_calendar",
        "provider": "google_calendar",
        "scopes": [],
        "capabilities": [],
        "status": "active",
        "healthStatus": "healthy",
        "healthMessage": "",
        "createdAt": "2026-10-07T00:00:00.000Z",
        "updatedAt": "2026-10-07T00:00:00.000Z",
        "sample": true
      }
    ]
  },
  "memories": [
    {
      "memoryId": "demo-memory-1",
      "category": "goal",
      "content": "中部の製造業に販路を広げたい",
      "source": "manual",
      "createdAt": "2026-09-28T00:00:00.000Z",
      "updatedAt": "2026-09-28T00:00:00.000Z",
      "sample": true
    },
    {
      "memoryId": "demo-memory-2",
      "category": "preference",
      "content": "評価額より、リード投資家の業界理解を重視",
      "source": "conversation",
      "createdAt": "2026-10-06T00:00:00.000Z",
      "updatedAt": "2026-10-06T00:00:00.000Z",
      "sample": true
    },
    {
      "memoryId": "demo-memory-3",
      "category": "constraint",
      "content": "平日夜のイベントは月2回まで",
      "source": "conversation",
      "createdAt": "2026-10-02T00:00:00.000Z",
      "updatedAt": "2026-10-02T00:00:00.000Z",
      "sample": true
    }
  ],
  "seekCandidates": [
    "シリーズA のリード投資家",
    "製造業の決裁者",
    "CFO 候補"
  ],
  "suggestions": [
    {
      "id": "account-design-suzuki",
      "target": "contact",
      "name": "鈴木 大輔",
      "company": "北辰製作所",
      "source": "business-card",
      "sourceLabel": "新しい名刺",
      "createdAt": "2026-10-07",
      "fields": [
        {
          "key": "role",
          "label": "役職",
          "current": "DX 推進室 課長",
          "proposed": "DX 推進室 室長"
        },
        {
          "key": "phone",
          "label": "携帯",
          "current": "（なし）",
          "proposed": "090-5555-0263"
        }
      ],
      "sample": true
    },
    {
      "id": "account-design-self",
      "target": "self",
      "name": "あなたのプロフィール",
      "company": "佐藤 健一",
      "source": "resume",
      "sourceLabel": "職務経歴書",
      "createdAt": "2026-10-05",
      "fields": [
        {
          "key": "bio",
          "label": "経歴",
          "current": "（なし）",
          "proposed": "2019–2022 テクノフォージ 事業開発部長"
        },
        {
          "key": "offering",
          "label": "得意分野",
          "current": "製造業 SaaS",
          "proposed": "製造業 SaaS · 工場 DX の導入支援"
        }
      ],
      "sample": true
    },
    {
      "id": "account-design-watanabe",
      "target": "contact",
      "name": "渡辺 翔",
      "company": "Nexa Robotics",
      "source": "conversation",
      "sourceLabel": "iOrbit との会話",
      "createdAt": "2026-10-02",
      "fields": [
        {
          "key": "employees",
          "label": "従業員数",
          "current": "約30名",
          "proposed": "約55名"
        },
        {
          "key": "memo",
          "label": "メモに追加",
          "current": "—",
          "proposed": "2026年9月にシリーズA 調達済み"
        }
      ],
      "sample": true
    },
    {
      "id": "account-design-ito",
      "target": "contact",
      "name": "伊藤 直子",
      "company": "株式会社ハルモニア",
      "source": "business-card",
      "sourceLabel": "新しい名刺",
      "createdAt": "2026-10-06",
      "fields": [
        {
          "key": "organization",
          "label": "会社",
          "current": "株式会社ハルモニア",
          "proposed": "ハルモニア・ホールディングス株式会社"
        },
        {
          "key": "email",
          "label": "メール",
          "current": "n.ito@harmonia.example",
          "proposed": "n.ito@harmonia-hd.example"
        }
      ],
      "sample": true
    },
    {
      "id": "account-design-kato",
      "target": "contact",
      "name": "加藤 健太",
      "company": "アクシス商事",
      "source": "conversation",
      "sourceLabel": "iOrbit との会話",
      "createdAt": "2026-09-30",
      "fields": [
        {
          "key": "role",
          "label": "役職",
          "current": "営業本部長",
          "proposed": "執行役員 営業本部長"
        }
      ],
      "sample": true
    },
    {
      "id": "account-design-nakamura",
      "target": "contact",
      "name": "中村 由紀",
      "company": "光が丘法律事務所",
      "source": "business-card",
      "sourceLabel": "新しい名刺",
      "createdAt": "2026-09-28",
      "fields": [
        {
          "key": "organization",
          "label": "会社",
          "current": "光が丘法律事務所",
          "proposed": "光が丘・みなと法律事務所"
        }
      ],
      "sample": true
    }
  ],
  "eventSummary": {
    "hosted": 2,
    "active": 1,
    "attending": 2
  },
  "unread": {
    "new": 0,
    "regular": 5,
    "complete": 5
  },
  "goal": {
    "planId": "demo-plan-series-a",
    "goal": "シリーズA 資金調達（3億円）"
  },
  "bio": "工場の稼働データを可視化する SaaS を運営しています。製造業の DX と、シリーズA の調達に取り組んでいます。"
} as const;

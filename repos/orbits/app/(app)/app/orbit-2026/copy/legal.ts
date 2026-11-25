import type { OrbitLanguage } from "../../../../../shared/contract/language";

type LegalSection = {
  title: Record<OrbitLanguage, string>;
  body: Record<OrbitLanguage, string>;
};

export const legalCopy: Record<"terms" | "privacy", readonly LegalSection[]> = {
  terms: [
    {
      title: { ja: "適用範囲", zh: "适用范围", en: "Scope" },
      body: {
        ja: "本規約は、連絡先の管理、人脈や行動計画の整理、イベントの主催・参加を支援する Orbit のウェブサイト及びアプリ（以下「サービス」）の利用に適用されます。",
        zh: "本条款适用于 Orbit 网站和应用（以下简称「服务」）。Orbit 提供联系人管理、人脉和行动计划整理，以及活动主办和参与功能。",
        en: "These terms apply to the Orbit website and apps (the service), which help you manage contacts and plans, and organize or join events.",
      },
    },
    {
      title: { ja: "アカウント", zh: "账号", en: "Your account" },
      body: {
        ja: "登録情報は正確に入力し、変更があったときは更新してください。認証情報はご自身で管理し、他人のアカウントを本人の許可なく使用しないでください。",
        zh: "请提供准确的注册信息，在信息变化时及时更新。请妥善保管登录凭据，并且只使用你有权使用的账号。",
        en: "Provide accurate account information and update it when it changes. Keep your credentials secure and use only accounts you are authorized to access.",
      },
    },
    {
      title: { ja: "登録・共有する情報", zh: "录入和分享的信息", en: "Content you add or share" },
      body: {
        ja: "名刺、連絡先、メモ及びプロフィールなどを登録・共有するときは、必要な権限を有し、適用される法令を守ってください。登録情報はサービスの提供及び保守に必要な範囲で処理します。イベントへの申込みや連絡先の交換前には、共有先と共有項目を確認してください。",
        zh: "录入或分享名片、联系人、笔记和个人资料时，请确保你有相应权限并遵守适用法律。Orbit 在提供和维护服务所需的范围内处理这些信息。报名活动或交换联系人前，请查看共享对象和共享内容。",
        en: "When adding or sharing cards, contacts, notes, or profile data, ensure you have the necessary permission and comply with applicable law. Orbit processes this information to provide and maintain the service. Review the recipients and fields before registering for an event or exchanging contact details.",
      },
    },
    {
      title: { ja: "AI による提案と下書き", zh: "AI 建议和草稿", en: "AI suggestions and drafts" },
      body: {
        ja: "文字認識、要約、紹介文、提案及び下書きには、誤りや情報の欠落が含まれる場合があります。送信、公開、連絡先の確定などの前に内容を確認し、必要に応じて修正してください。",
        zh: "文字识别、摘要、介绍、建议和草稿可能有误或遗漏。发送、发布或确认联系人之前，请检查内容并按需修改。",
        en: "Recognition results, summaries, introductions, recommendations, and drafts may contain errors or omissions. Review and correct them as needed before sending, publishing, or confirming a contact.",
      },
    },
    {
      title: { ja: "イベントと禁止事項", zh: "活动与禁止行为", en: "Events and prohibited conduct" },
      body: {
        ja: "イベントの参加条件、変更及び取消しは、各イベントの案内を確認してください。運営に関するお問い合わせは主催者にご連絡ください。不正アクセス、なりすまし、違法行為、権利侵害、迷惑行為、許可のない個人情報の収集・公開及びサービスの妨害を禁止します。",
        zh: "活动的参加条件、变更和取消以活动说明为准。有关活动运营的问题请联系主办方。禁止未经授权的访问、冒用身份、违法侵权、骚扰、未经授权收集或公开个人信息，以及干扰服务。",
        en: "Check each event listing for participation, changes, and cancellation information. Contact the organizer about event operations. Unauthorized access, impersonation, unlawful conduct, infringement, harassment, unauthorized collection or disclosure of personal information, and interference with the service are prohibited.",
      },
    },
    {
      title: { ja: "退会、変更及び利用者の権利", zh: "注销、变更与用户权利", en: "Account deletion, changes, and your rights" },
      body: {
        ja: "アカウントの削除は設定から手続きできます。保守、障害対応及び安全確保のため、サービスの一部を中断する場合があります。利用に重要な影響を及ぼす変更については、内容と適用日をサービス上などでお知らせします。本規約は、適用法令で保障される利用者の権利を制限しません。",
        zh: "你可以在设置中申请删除账号。维护、故障处理或保障安全时，部分服务可能暂停。对使用有重大影响的变更会通过服务等渠道说明内容和生效日期。本条款不限制适用法律保障的用户权利。",
        en: "You can request account deletion in settings. Parts of the service may pause for maintenance, incident response, or safety. Material changes and their effective dates will be communicated through the service or another appropriate channel. These terms do not limit rights protected by applicable law.",
      },
    },
  ],
  privacy: [
    {
      title: { ja: "適用範囲と利用目的", zh: "适用范围与用途", en: "Scope and purposes" },
      body: {
        ja: "本ポリシーは Orbit のウェブサイト及びアプリに適用されます。メールアドレスと認証情報は登録、ログイン、復旧及び不正利用の防止に使用します。プロフィール、目標、名刺画像、連絡先、メモ、予定及びタスクは、資料・人脈の管理、名刺の文字認識及び計画の支援に使用します。イベントの申込情報、回答及び出欠は受付・運営に使用します。接続・操作の記録や Cookie は、ログイン状態の維持、設定の反映、安全確保及び障害対応に使用します。",
        zh: "本政策适用于 Orbit 网站及应用。邮箱和认证信息用于注册、登录、账号恢复及防止滥用。个人资料、目标、名片图片、联系人、笔记、日程和任务用于资料管理、人脉整理、名片识别和计划辅助。活动报名、回答和出席信息用于签到及活动运营。连接与操作记录及 Cookie 用于维持登录、应用设置、保障安全和排查故障。",
        en: "This policy applies to the Orbit website and apps. Email and authentication data support registration, sign-in, recovery, and abuse prevention. Profile and goal information, card images, contacts, notes, schedules, and tasks support profile and contact management, card recognition, and planning. Event registrations, answers, and attendance support check-in and event operations. Connection and activity records and cookies support sessions, preferences, security, and incident response.",
      },
    },
    {
      title: { ja: "イベント・連絡先の共有", zh: "活动与联系人共享", en: "Events and contact sharing" },
      body: {
        ja: "イベントの申込み、プロフィールの共有又は連絡先の交換に伴い、対象項目が主催者、対象参加者又は交換相手に表示される場合があります。対象項目と共有先は各機能の案内をご確認ください。主催者が取得した情報の取扱いについては、各主催者の案内をご確認ください。",
        zh: "活动报名、共享资料或交换联系人时，相应信息可能向主办方、相关参会者或交换对象展示。请查看各功能的共享提示。主办方取得信息后的处理方式以其说明为准。",
        en: "Event registration, profile sharing, or contact exchange may show relevant fields to organizers, eligible attendees, or the people you exchange details with. Check the sharing information for each feature. For information an event organizer receives, consult that organizer’s notice.",
      },
    },
    {
      title: { ja: "AI 処理・委託・国外での取扱い", zh: "AI 处理、委托与跨境处理", en: "AI processing, service providers, and processing abroad" },
      body: {
        ja: "文字認識、紹介文、要約、提案及び下書きの作成に、入力内容や機能に必要な情報を使用します。サービスの提供に必要な範囲で、ホスティング、データベース、ファイル保管、認証、通知・メール配信又は AI 処理を外部事業者に委託し、国外で情報を取り扱う場合があります。第三者への提供及び国外での取扱いは適用法令に従います。",
        zh: "文字识别、自我介绍、摘要、建议和草稿会使用你的输入和相应功能所需的信息。提供服务时，托管、数据库、文件存储、认证、通知、邮件投递或 AI 处理可能由外部服务商完成，部分信息可能在境外处理。第三方提供和跨境处理遵循适用法律。",
        en: "Recognition, introductions, summaries, recommendations, and drafts use your inputs and information needed for the feature. External providers may handle hosting, databases, file storage, authentication, notifications, email delivery, or AI processing, and information may be processed abroad. Third-party disclosures and processing abroad are subject to applicable law.",
      },
    },
    {
      title: { ja: "保存と安全管理", zh: "保存与安全管理", en: "Retention and security" },
      body: {
        ja: "個人情報は利用目的に必要な期間保存します。法令上の義務、不正利用又は紛争への対応に必要な記録を保持する場合があります。アクセス制限など、漏えい、滅失又は毀損の防止に必要な安全管理措置を講じます。",
        zh: "个人信息在实现相应处理目的所需的期间内保存。为履行法律义务、防止滥用或处理争议，相关记录可能继续保留。Orbit 使用访问限制等措施保护信息，防止泄露、丢失或损坏。",
        en: "Personal information is kept for as long as needed for the stated purposes. Records may be kept to meet legal obligations, address abuse, or resolve disputes. Orbit uses safeguards such as access controls to protect information from disclosure, loss, or damage.",
      },
    },
    {
      title: { ja: "確認・変更・書き出し・削除", zh: "查看、修改、导出与删除", en: "Review, correction, export, and deletion" },
      body: {
        ja: "サービス内で登録情報の一部を確認・変更できます。設定のデータ書き出し及びアカウント削除から、書き出しや削除を手続きできます。適用法令に基づき、開示、訂正、利用停止又は第三者提供の停止などを請求できる場合があります。",
        zh: "你可以在服务内查看和修改部分注册信息，并通过设置中的数据导出和账号删除功能提出相应请求。你也可能依适用法律享有查阅、更正、停止使用或停止向第三方提供等权利。",
        en: "You can review and update some information in the service and use settings to export data or request account deletion. Applicable law may also give you rights to disclosure, correction, suspension of use, or suspension of third-party disclosure.",
      },
    },
    {
      title: { ja: "ポリシーの変更", zh: "政策变更", en: "Policy changes" },
      body: {
        ja: "本ポリシーを変更するときは、このページなどで変更内容と適用日をお知らせします。法令により通知又は同意が必要な場合は、所定の手続きを行います。",
        zh: "政策变更时，我们会在本页等渠道说明变更内容及生效日期。适用法律要求通知或征得同意时，将按要求办理。",
        en: "When this policy changes, we will communicate the changes and their effective date on this page or through another appropriate channel. We will provide notice or obtain consent where required by law.",
      },
    },
  ],
};

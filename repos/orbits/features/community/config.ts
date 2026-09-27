/**
 * iOrbit 用户社群的展示素材（RW-06、D4）。
 *
 * 社群不是活动（D6）：这里只放卡片要显示的群名、介绍、微信号和二维码，
 * 不进 `event_ops_events`、目录、推荐过滤或报名规则。
 *
 * 素材到位前全部是占位，`placeholder` 逐项标明哪些还是占位；
 * 界面据此显示「占位」标注。素材到位只改这个文件：填入真实值并把对应标记改成 false。
 */
export interface CommunityCopy {
  en: string;
  zh: string;
}

export interface CommunityConfig {
  /** 群名（卡片标题）。 */
  name: CommunityCopy;
  /** 中性的一句话：只说明这张卡片是什么，不做任何承诺。 */
  summary: CommunityCopy;
  /** 群介绍正文；用户未提供前为 null，界面显示「【占位：群介绍，待提供】」。 */
  intro: CommunityCopy | null;
  /** 助手微信号：用户添加助手，由助手拉进群。 */
  wechatId: string;
  /** 二维码图片路径（public/ 下）；未到位时为 null，界面画虚线占位框。 */
  qrImageSrc: string | null;
  /** true = 该项仍是占位，界面必须显示「占位」标注。 */
  placeholder: {
    intro: boolean;
    qr: boolean;
    wechatId: boolean;
  };
}

export const COMMUNITY_CONFIG: CommunityConfig = {
  name: { en: "Join the iOrbit user community", zh: "加入 iOrbit 用户社群" },
  summary: { en: "iOrbit user group.", zh: "iOrbit 用户交流群。" },
  intro: null,
  wechatId: "orbit_helper",
  qrImageSrc: null,
  placeholder: {
    intro: true,
    qr: true,
    wechatId: true,
  },
};

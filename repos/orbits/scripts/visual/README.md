# 0918 像素比对

前置：`python3 -m http.server 3320 -d /Users/li/work/orbit/docs/designs`（或 launch.json 的 `designs`）与 dev server（launch.json `orbits-newui`，3100）。

## 认证方式

两种方式二选一：

- **`--cookie`**：浏览器登录 qa@orbit.test 后从 DevTools 复制 `authjs.session-token`（本地 http 为 `authjs.session-token`，https 为 `__Secure-authjs.session-token`）。
- **`--login "email:password"`**：脚本会在截 app 图之前自动打开 `<app origin>/app/account/login`，填写邮箱（占位符「输入邮箱地址」）和密码（占位符「输入密码」），点击「登录」按钮并等待导航完成，再继续截图。适合本地跑冒烟，不用每次手动复制 cookie。

两者互不冲突：都传时先设置 cookie，再走登录流程（一般只用其中一种）。

## 用法

```bash
node scripts/visual/compare-0918.mjs \
  --design "http://localhost:3320/Orbit_0918/Network%20v2.dc.html" --design-view all \
  --app "http://localhost:3100/app/contacts" \
  --login "qa@orbit.test:<password>" \
  --out /tmp/network-all
```

判定：mismatch ≤ 0.02 且 diff.png 中红色只出现在真实数据文字/数字区域（不得出现在布局线、圆角、间距、色块）。

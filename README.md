# Market Emoji Picker for Linux.do (Performance & UI Pro 终极性能版)

本脚本专为 [Linux.do](https://linux.do/) 论坛打造，支持从云端市场自由挑选、组合海量表情包分组，支持**自定义表情收藏**、**版本号实时直显**、**从 GitHub 一键在线自动更新**、**IndexedDB 二进制离线图片缓存**与**高并发并行拉取**，并以现代化、高性能的弹窗交互无缝注入到论坛回复框与聊天框中。

---

## 🚀 v3.4.1 修复优化：修复添加新表情包分组后无法显示的问题

- **修复分组 URL 请求前缀重复问题**：修复由于 `groupId` 自带 `group-` 前缀导致的 URL 拼接异常（`group-group-xxx.json`），解决在管理面板添加新表情包组后无法正确拉取并显示 Tab 分组的 Bug。
- **优化分组缓存同步**：保存新分组时即时刷新缓存与状态，添加成功后弹出 Toast 提示。

---

## 🚀 v3.4.0 新增特性：版本号直显 & GitHub 一键直接更新

### 1. 🏷️ 表情弹窗与管理面板直显版本号
- **选择器底部状态栏**：新增版本徽章 `v3.4.1`，清晰展示当前运行版本。
- **分组管理弹窗**：标题栏直显版本标签 `v3.4.1`。

### 2. ⚡ 支持从 GitHub 直接更新新版本
本脚本提供了两种从 GitHub 更新的机制：
- **机制一（全自动/油猴原生更新）**：
  脚本头部已配置标准 `@updateURL` 与 `@downloadURL`：
  ```
  https://raw.githubusercontent.com/shidehai/linuxdo-plugin/main/market-emoji-picker.user.js
  ```
  在 Tampermonkey / Violentmonkey / 脚本猫 中点击 **「检查更新」** 或开启自动检查，扩展会自动从 GitHub 拉取最新版本并静默升级。
- **机制二（弹窗内一键点击检查更新）**：
  - 点击表情选择器底部的 **`v3.4.1` 徽章**，或在油猴菜单点击 **「🚀 检查 GitHub 最新版本」**。
  - 脚本会自动连线 GitHub 检测是否有更高版本，当有新版本时会弹出确认框，一键跳转到油猴原生安装页面进行一键更新！

---

## ⚡ v3.3.0 终极性能飞跃（彻底解决加载慢与卡顿）

1. **💾 本地 IndexedDB 二进制离线图片持久化**：加载过的表情自动在后台以 Blob 二进制存入本地磁盘，**二次打开 0ms 瞬间直出，完全绕过 CDN 网络**。
2. **⚡ 高并发并行拉取（Promise.allSettled）**：多分组配置由单线串行改为多路并行并发拉取，初始化耗时由 2~3 秒骤降至 **200~300ms**。
3. **🎞️ 分片渐进式渲染（Progressive Chunk Rendering @ 60 FPS）**：大图庞大分组首屏 36 个表情瞬间挂载，后续表情通过 `requestAnimationFrame` 异步分片追加，彻底消除界面卡顿。
4. **🚀 智能后台预热与预解码池**：收藏夹与前排分组表情在空闲时段自动预解码到显存。

---

## ⭐ v3.2.0 表情收藏（Favorites）

1. **🌟 置顶常驻「⭐ 收藏」Tab**：导航栏首位常驻，随时秒级直达常用表情库。
2. **⚡ 极速快捷收藏与取消**：
   - **最推荐**：在任意表情上 **【鼠标右键点击】** 即可瞬间加入/移出收藏！
   - **大图预览**：悬浮预览时点击右上角 **【⭐】** 按钮。
   - **移动端**：**【长按】** 触屏 450ms 触发收藏/移出。
3. **🔄 实时双向同步**：已收藏表情显示金色 **★** 角标，跨面板实时无感同步。

---

## 📦 文件列表

- [`market-emoji-picker.user.js`](file:///home/sdh/vibehub/linuxdo-plugin/market-emoji-picker.user.js)：用户脚本源代码（可直接导入 Tampermonkey / Violentmonkey / ScriptCat 等）。
- [`README.md`](file:///home/sdh/vibehub/linuxdo-plugin/README.md)：项目说明文档。

---

## 🚀 安装与更新指南

### 1. 一键安装 / 更新地址
- **GitHub 原链直装**：[点击安装/更新最新版脚本](https://raw.githubusercontent.com/shidehai/linuxdo-plugin/main/market-emoji-picker.user.js)
- **项目开源仓库**：[https://github.com/shidehai/linuxdo-plugin](https://github.com/shidehai/linuxdo-plugin)

### 2. 功能使用
1. **打开表情选择器**：点击回复框工具栏右侧的 **😊 笑脸图标**。
2. **检查更新**：点击弹窗右下角 **`v3.4.1`** 按钮即可在线检查 GitHub 最新版本。
3. **收藏表情**：在任意表情上**右键点击**（或悬浮在大图上点击右上角 **⭐** 按钮），即可加入「⭐ 收藏」列表。
4. **挑选表情包**：点击弹窗中的 **「⚙️」** 图标打开市场，挑选心仪分组并点击 **「保存并应用」**。

# Market Emoji Picker for Linux.do (Performance & UI Pro 终极优化版)

本脚本专为 [Linux.do](https://linux.do/) 论坛打造，支持从云端市场自由挑选、组合海量表情包分组，支持**自定义表情收藏**，并以现代化、高性能的弹窗交互无缝注入到论坛回复框与聊天框中。

---

## ⭐ v3.2.0 新增功能：表情收藏（Favorites）

方便用户一键沉淀与快速使用高频常用表情：

### 1. 🌟 置顶常驻「⭐ 收藏」Tab
- 表情选择器顶部 Tab 导航栏永远将 **「⭐ 收藏」** 放在第一位。
- 打开表情选择器可随时秒级直达常用表情库，支持全局实时检索收藏夹内的表情。

### 2. ⚡ 多种快捷收藏与取消方式
- **方式一（最推荐·极速）：【鼠标右键】点击任意表情**
  - 在任何表情包列表或搜索结果中，直接**鼠标右键**点击表情，即可一秒加入/移除收藏，伴随轻量 Toast 提示！
- **方式二：悬浮大图预览上的【⭐】按钮**
  - 鼠标悬浮在表情上查看大图时，点击预览窗口右上角的 **⭐ 星星按钮** 即可实时切换收藏状态。
- **方式三（移动端）：【长按】表情卡片**
  - 触屏长按表情 450ms 自动触发收藏/移出操作。

### 3. 🔄 实时双向同步与视觉标记
- 已收藏的表情右上角会亮起金色的 **★ 星标小角标**。
- 无论在哪个面板或搜索结果中收藏/取消表情，收藏夹面板与表情卡片角标均会**无感实时同步更新**。
- 支持在油猴菜单中使用「⭐ 管理/清空我的收藏」。

---

## ⚡ v3.1.0 性能与体验跃升（极速加载与零闪烁）

1. **🗂️ 常驻 DOM 缓存池（Keep-Alive Tab Panes）**：每个分组拥有独立常驻面板，切换分组仅切换 CSS 显隐，**0ms 瞬时切页，彻底杜绝切页白屏与闪烁**。
2. **🚀 内存级图片预热与预解码池（Preload & Pre-decode Pool）**：利用 `requestIdleCallback` 在后台将收藏夹和前排分组表情提前解码至 GPU 显存，**秒开呈现**。
3. **🛡️ 悬浮大图双缓冲防闪烁（Double-Buffered Hover Preview）**：预览窗口增加图片双缓冲机制，消除快速划过时的黑白闪烁。
4. **🎨 CSS 渲染隔离与固定骨架底色（Zero Layout Shift）**：应用 `contain: paint layout;` 与 `content-visibility: auto;`，隔离重排影响，实现丝滑 60 FPS 滚动。

---

## 🛠️ 核心问题排查与修复说明

1. **首次未选表情时弹窗不可见**：重构 `positionPicker`，修复空状态分支提前 return 导致丢失坐标的问题。
2. **工具栏图标缺失**：改用内联标准矢量 FontAwesome SVG 图标，自适应论坛主题色彩。
3. **市场分组管理分页截断 Bug**：加载全量 287+ 个分组元数据（84KB），支持全部分类秒级切换与全局搜索。
4. **Discourse SPA 动态注入**：采用 `MutationObserver` 结合 `requestAnimationFrame` 防抖机制，毫秒级捕获回复框与聊天室。

---

## 📦 文件列表

- [`market-emoji-picker.user.js`](file:///home/sdh/vibehub/linuxdo-plugin/market-emoji-picker.user.js)：用户脚本源代码（可直接导入 Tampermonkey / Violentmonkey / ScriptCat 等）。
- [`README.md`](file:///home/sdh/vibehub/linuxdo-plugin/README.md)：项目说明文档。

---

## 🚀 安装与使用指南

### 1. 安装方式
1. 打开浏览器扩展（如 **Tampermonkey / 暴力猴 / 脚本猫**）。
2. 将 [`market-emoji-picker.user.js`](file:///home/sdh/vibehub/linuxdo-plugin/market-emoji-picker.user.js) 中的代码复制并更新保存。
3. 刷新 [Linux.do](https://linux.do/) 页面即可生效。

### 2. 功能使用
1. **打开表情选择器**：点击回复框工具栏右侧的 **😊 笑脸图标**。
2. **收藏表情**：在任意表情上**右键点击**（或悬浮在大图上点击右上角 **⭐** 按钮），即可加入「⭐ 收藏」列表。
3. **挑选表情包**：首次点击弹窗中的 **「⚙️ 前往挑选表情包」**，在市场中挑选心仪分组并点击 **「保存并应用」**。
4. **格式与缩放切换**：底部工具栏可一键切换缩放比例（30% / 50% / 100%）与输出格式（Markdown / HTML）。

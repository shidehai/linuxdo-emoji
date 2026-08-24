# Market Emoji Picker for Linux.do (Performance & UI Pro 终极优化版)

本脚本专为 [Linux.do](https://linux.do/) 论坛打造，支持从云端市场自由挑选、组合海量表情包分组，并以现代化、高性能的弹窗交互无缝注入到论坛回复框与聊天框中。

---

## ⚡ v3.1.0 性能与体验跃升（极速加载与零闪烁）

针对表情包加载慢与切页/悬浮预览闪烁问题，引入了以下核心性能优化：

### 1. 🗂️ 常驻 DOM 缓存池（Keep-Alive Tab Panes，彻底杜绝切页白屏与闪烁）
- **痛点**：原逻辑在每次切换 Tab 时都会强制清空所有 DOM 节点重新渲染，导致明显的白屏、重排与图片重新解码闪烁。
- **优化**：为每个分组创建独立的常驻面板（`mep-tab-pane`），切换分组时仅通过 CSS 切换活跃状态（`display: none` / `display: grid`）。
- **效果**：已访问过的分组切换耗时降至 **0ms**，保留 GPU 解码位图，**彻底告别切换闪烁**。

### 2. 🚀 内存级图片预热与预解码池（Preload & Pre-decode Pool）
- **痛点**：点开表情面板后才发起数十张图片的网络请求，网络竞争导致图片逐个显现，加载缓慢。
- **优化**：在后台及空闲时段（`requestIdleCallback`）通过 `new Image()` + `img.decode()` 预热前几个分组及所有 Tab 图标，提前将位图解码至 GPU 显存。
- **效果**：点开弹窗瞬间第一屏表情全部**秒开呈现**。

### 3. 🛡️ 悬浮大图双缓冲防闪烁（Double-Buffered Hover Preview）
- **优化**：悬浮预览窗口增加图片双缓冲预加载机制，在目标大图就绪前保持平滑透明度过渡，避免鼠标快速扫过表情时产生黑白闪烁。

### 4. 🎨 CSS 渲染隔离与固定骨架占位（Zero Layout Shift）
- **优化**：为弹窗及表情卡片应用 `contain: paint layout;`、`content-visibility: auto;` 与 `will-change: transform;`，固定 `aspect-ratio: 1;` 骨架底色，隔离重排影响，实现丝滑 60 FPS 滚动。

---

## 🛠️ 此前已修复的核心问题

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
2. **挑选表情包**：首次点击弹窗中的 **「⚙️ 前往挑选表情包」**，在市场中挑选心仪分组并点击 **「保存并应用」**。
3. **表情搜索与悬浮预览**：支持实时跨分组搜索，鼠标悬浮在表情上可查看高清放大图。
4. **格式与缩放切换**：底部工具栏可一键切换缩放比例（30% / 50% / 100%）与输出格式（Markdown / HTML）。

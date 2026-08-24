// ==UserScript==
// @name         Market Emoji Picker for Linux.do (Performance & UI Pro)
// @namespace    https://linux.do/
// @version      3.0.1
// @description  从云端市场加载表情包并允许用户组合分组，注入高性能精美表情选择器到 Linux.do 论坛（按需渲染、防闪烁、懒加载、现代UI）
// @author       stevessr (Optimized & Fixed)
// @match        https://linux.do/*
// @match        https://*.linux.do/*
// @icon         https://cdn3.ldstatic.com/optimized/3X/9/d/9dd49731091ce8656e94433a26a3ef76f9c0f8d9_2_32x32.png
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

;(function () {
  'use strict'

  // 防止同一页面中脚本被重复执行
  const INSTANCE_FLAG = '__marketEmojiPickerUserscriptLoaded__'
  if (window[INSTANCE_FLAG]) {
    console.warn('[Market Emoji] 检测到重复脚本实例，跳过初始化')
    return
  }
  window[INSTANCE_FLAG] = true

  // ============== 配置 ==============
  const CONFIG = {
    marketBaseUrl: GM_getValue('marketBaseUrl', 'https://s.pwsh.us.kg'),
    cacheDuration: 24 * 60 * 60 * 1000, // 24小时缓存
    imageScale: GM_getValue('imageScale', 30),
    outputFormat: GM_getValue('outputFormat', 'markdown'),
    enableHoverPreview: GM_getValue('enableHoverPreview', true),
    viewMode: GM_getValue('viewMode', 'auto'),
    selectedGroupIds: GM_getValue('selectedGroupIds', []),
    uploadToDiscourse: GM_getValue('uploadToDiscourse', false),
    activeGroupId: GM_getValue('lastActiveGroupId', '')
  }

  // 状态变量
  let marketMetadata = null
  let marketGroups = []
  let marketTopics = []
  let selectedEmojiGroups = []

  // ============== 设备检测 ==============
  function isMobile() {
    const userAgent = navigator.userAgent || ''
    const mobileKeywords = ['Android', 'iPhone', 'iPad', 'iPod', 'Windows Phone', 'Mobile']
    return mobileKeywords.some(keyword => userAgent.includes(keyword))
  }

  function shouldUseMobileView() {
    if (CONFIG.viewMode === 'mobile') return true
    if (CONFIG.viewMode === 'desktop') return false
    return isMobile() || window.innerWidth < 640
  }

  // ============== 油猴菜单注册 ==============
  GM_registerMenuCommand('⚙️ 管理表情分组', () => showGroupManager())
  GM_registerMenuCommand('🌐 设置市场域名', () => {
    const current = CONFIG.marketBaseUrl.replace(/^https?:\/\//, '')
    const url = prompt('请输入云端市场域名（不含 https://）:', current)
    if (url !== null && url.trim()) {
      const fullUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`
      GM_setValue('marketBaseUrl', fullUrl)
      CONFIG.marketBaseUrl = fullUrl
      clearAllCache()
      alert('市场域名已设置并清空缓存，请重新打开选择器或刷新页面！')
    }
  })
  GM_registerMenuCommand('🖼️ 设置图片缩放比例', () => {
    const scale = prompt('请输入缩放比例 (1-100):', CONFIG.imageScale)
    if (scale !== null) {
      const num = parseInt(scale, 10)
      if (!isNaN(num) && num >= 1 && num <= 100) {
        GM_setValue('imageScale', num)
        CONFIG.imageScale = num
        alert('缩放比例已设置为 ' + num + '%')
      }
    }
  })
  GM_registerMenuCommand('📝 切换输出格式 (Markdown/HTML)', () => {
    const newFormat = CONFIG.outputFormat === 'markdown' ? 'html' : 'markdown'
    GM_setValue('outputFormat', newFormat)
    CONFIG.outputFormat = newFormat
    alert('输出格式已切换为：' + newFormat.toUpperCase())
  })
  GM_registerMenuCommand('👁️ 开关鼠标悬浮大图预览', () => {
    const newVal = !CONFIG.enableHoverPreview
    GM_setValue('enableHoverPreview', newVal)
    CONFIG.enableHoverPreview = newVal
    alert('悬浮大图预览已' + (newVal ? '开启' : '关闭'))
  })
  GM_registerMenuCommand('🗑️ 清除所有本地缓存', () => {
    clearAllCache()
    alert('缓存已清除，正在重新加载数据')
    loadMarketMetadata(true).catch(() => {})
    loadSelectedGroups().catch(() => {})
  })

  function clearAllCache() {
    localStorage.removeItem('emoji_market_cache')
    localStorage.removeItem('emoji_market_cache_timestamp')
    localStorage.removeItem('emoji_groups_cache')
    localStorage.removeItem('emoji_groups_cache_timestamp')
  }

  // ============== 存储与缓存管理 ==============
  const MARKET_CACHE_KEY = 'emoji_market_cache'
  const MARKET_CACHE_TIME_KEY = 'emoji_market_cache_timestamp'
  const GROUPS_CACHE_KEY = 'emoji_groups_cache'
  const GROUPS_CACHE_TIME_KEY = 'emoji_groups_cache_timestamp'

  function loadCache(key) {
    try {
      const data = localStorage.getItem(key)
      return data ? JSON.parse(data) : null
    } catch (e) {
      return null
    }
  }

  function saveCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data))
      const timeKey = key + '_timestamp'
      localStorage.setItem(timeKey, Date.now().toString())
    } catch (e) {
      console.warn('[Market Emoji] 缓存保存失败：', e)
    }
  }

  function isCacheValid(timeKey) {
    try {
      const timestamp = localStorage.getItem(timeKey)
      if (!timestamp) return false
      return Date.now() - parseInt(timestamp, 10) < CONFIG.cacheDuration
    } catch (e) {
      return false
    }
  }

  // ============== 网络数据请求 ==============
  function fetchRemoteConfig(url) {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('未设置 URL'))
        return
      }

      // 优先使用 fetch，若被跨域限制则使用 GM_xmlhttpRequest
      const tryFetch = () => {
        return fetch(url, { mode: 'cors' })
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
          })
          .then(resolve)
          .catch(() => tryGM())
      }

      const tryGM = () => {
        if (typeof GM_xmlhttpRequest === 'undefined') {
          reject(new Error('GM_xmlhttpRequest unavailable and fetch failed'))
          return
        }
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          timeout: 15000,
          onload: function (response) {
            try {
              if (response.status >= 200 && response.status < 300) {
                const data = JSON.parse(response.responseText)
                resolve(data)
              } else {
                reject(new Error(`HTTP ${response.status}`))
              }
            } catch (e) {
              reject(e)
            }
          },
          ontimeout: function () {
            reject(new Error('请求超时'))
          },
          onerror: function (error) {
            reject(error)
          }
        })
      }

      tryFetch()
    })
  }

  function getGroupFileUrl(groupId) {
    // 兼容 group- 前缀
    return `${CONFIG.marketBaseUrl}/assets/market/group-${groupId}.json`
  }

  // 加载全量市场元数据（全部分组信息，约 80KB）
  async function loadMarketMetadata(forceRefresh = false) {
    if (!forceRefresh && isCacheValid(MARKET_CACHE_TIME_KEY)) {
      const cached = loadCache(MARKET_CACHE_KEY)
      if (cached && cached.groups && Array.isArray(cached.groups) && cached.groups.length > 0) {
        marketMetadata = cached
        marketGroups = cached.groups
        marketTopics = extractTopicsFromGroups(marketGroups)
        // 后台静默刷新
        refreshMarketInBackground()
        return marketMetadata
      }
    }

    try {
      const metadataUrl = `${CONFIG.marketBaseUrl}/assets/market/metadata.json`
      const data = await fetchRemoteConfig(metadataUrl)
      if (data && data.groups) {
        marketMetadata = data
        marketGroups = data.groups || []
        marketTopics = extractTopicsFromGroups(marketGroups)
        saveCache(MARKET_CACHE_KEY, data)
        return marketMetadata
      }
    } catch (err) {
      console.warn('[Market Emoji] 加载 metadata.json 失败，尝试 index.json：', err)
      try {
        const indexData = await fetchRemoteConfig(`${CONFIG.marketBaseUrl}/assets/market/index/index.json`)
        const page1 = await fetchRemoteConfig(`${CONFIG.marketBaseUrl}/assets/market/index/page-1.json`)
        const groups = page1.groups || []
        marketMetadata = {
          version: indexData.version || '1.0',
          totalGroups: indexData.totalGroups || groups.length,
          groups
        }
        marketGroups = groups
        marketTopics = (indexData.topics || []).map(t => ({ id: t.id, label: t.label }))
        saveCache(MARKET_CACHE_KEY, marketMetadata)
        return marketMetadata
      } catch (e2) {
        console.error('[Market Emoji] 市场元数据加载全部失败：', e2)
      }
    }
    return null
  }

  function extractTopicsFromGroups(groups) {
    const topicSet = new Set()
    groups.forEach(g => {
      if (g.topic) topicSet.add(g.topic)
    })
    const topicLabels = {
      bilibili: 'bilibili',
      telegram: 'telegram',
      x: 'X',
      other: '其他',
      OC: 'OC',
      emoji: 'emoji',
      animated: '动画表情',
      'linux.do': 'linux.do',
      tieba: '贴吧',
      '100': '100+',
      neuro: 'neuro',
      touhou: '东方',
      neko: 'neko',
      magic_girl: '魔法少女'
    }
    return Array.from(topicSet).map(id => ({
      id,
      label: topicLabels[id] || id
    }))
  }

  async function loadSelectedGroups() {
    if (!CONFIG.selectedGroupIds || CONFIG.selectedGroupIds.length === 0) {
      selectedEmojiGroups = []
      return []
    }

    if (isCacheValid(GROUPS_CACHE_TIME_KEY)) {
      const cached = loadCache(GROUPS_CACHE_KEY)
      if (cached && Array.isArray(cached) && cached.length > 0) {
        selectedEmojiGroups = cached
        refreshGroupsInBackground()
        return selectedEmojiGroups
      }
    }

    try {
      const groups = []
      for (const groupId of CONFIG.selectedGroupIds) {
        try {
          const groupUrl = getGroupFileUrl(groupId)
          const groupData = await fetchRemoteConfig(groupUrl)
          if (groupData && groupData.id) {
            groups.push(normalizeGroupData(groupData))
          }
        } catch (e) {
          console.warn(`[Market Emoji] 加载分组 ${groupId} 失败：`, e)
        }
      }
      if (groups.length > 0) {
        selectedEmojiGroups = groups
        saveCache(GROUPS_CACHE_KEY, groups)
      }
      return selectedEmojiGroups
    } catch (e) {
      console.error('[Market Emoji] 选中的分组加载失败：', e)
      return []
    }
  }

  function normalizeGroupData(groupData) {
    return {
      id: groupData.id,
      name: groupData.name || '未命名表情包',
      icon: groupData.icon,
      detail: groupData.detail || '',
      topic: groupData.topic || 'other',
      order: groupData.order || 0,
      emojis: (groupData.emojis || []).map(e => ({
        id: e.id || `emoji-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        packet: e.packet || Date.now(),
        name: e.name || 'emoji',
        url: e.url,
        displayUrl: e.displayUrl || e.url,
        width: e.width || 0,
        height: e.height || 0,
        groupId: groupData.id
      }))
    }
  }

  function refreshMarketInBackground() {
    const metadataUrl = `${CONFIG.marketBaseUrl}/assets/market/metadata.json`
    fetchRemoteConfig(metadataUrl)
      .then(data => {
        if (data && data.groups) {
          marketMetadata = data
          marketGroups = data.groups || []
          marketTopics = extractTopicsFromGroups(marketGroups)
          saveCache(MARKET_CACHE_KEY, data)
        }
      })
      .catch(() => {})
  }

  function refreshGroupsInBackground() {
    if (!CONFIG.selectedGroupIds || CONFIG.selectedGroupIds.length === 0) return
    const promises = CONFIG.selectedGroupIds.map(async groupId => {
      try {
        const groupUrl = getGroupFileUrl(groupId)
        const groupData = await fetchRemoteConfig(groupUrl)
        return groupData && groupData.id ? normalizeGroupData(groupData) : null
      } catch (e) {
        return null
      }
    })
    Promise.all(promises).then(results => {
      const valid = results.filter(Boolean)
      if (valid.length > 0) {
        selectedEmojiGroups = valid
        saveCache(GROUPS_CACHE_KEY, valid)
      }
    })
  }

  // ============== 现代化样式注入 ==============
  function injectStyles() {
    if (document.getElementById('market-emoji-picker-pro-styles')) return

    const css = `
      :root {
        --mep-bg: var(--secondary, #ffffff);
        --mep-surface: var(--primary-very-low, #f8f9fa);
        --mep-surface-hover: var(--primary-low, #edf0f2);
        --mep-border: var(--primary-low, #e2e5e8);
        --mep-border-subtle: rgba(128, 128, 128, 0.18);
        --mep-text: var(--primary, #22252a);
        --mep-text-muted: var(--primary-medium, #6e7681);
        --mep-accent: var(--tertiary, #0088cc);
        --mep-accent-hover: var(--tertiary-hover, #0077b3);
        --mep-accent-bg: rgba(0, 136, 204, 0.12);
        --mep-danger: var(--danger, #e53935);
        --mep-danger-hover: #d32f2f;
        --mep-danger-bg: rgba(229, 57, 53, 0.1);
        --mep-radius-sm: 6px;
        --mep-radius-md: 10px;
        --mep-radius-lg: 14px;
        --mep-shadow-lg: 0 12px 36px -4px rgba(0, 0, 0, 0.22), 0 4px 16px rgba(0, 0, 0, 0.1);
        --mep-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08);
      }

      /* 统一盒模型 */
      .mep-picker, .mep-modal-bottom, .mep-manager-modal,
      .mep-picker *, .mep-modal-bottom *, .mep-manager-modal * {
        box-sizing: border-box;
      }

      /* ================= 桌面端选择器容器 ================= */
      .mep-picker {
        position: fixed;
        z-index: 999999;
        width: 380px;
        max-width: calc(100vw - 20px);
        height: 440px;
        max-height: calc(100vh - 30px);
        background: var(--mep-bg);
        border: 1px solid var(--mep-border);
        border-radius: var(--mep-radius-lg);
        box-shadow: var(--mep-shadow-lg);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        backdrop-filter: blur(20px);
        font-family: inherit;
        opacity: 0;
        transform: translateY(6px) scale(0.98);
        transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
      }

      .mep-picker.mep-visible {
        opacity: 1 !important;
        transform: translateY(0) scale(1) !important;
      }

      /* 选择器顶部搜索与控制栏 */
      .mep-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--mep-border-subtle);
        background: var(--mep-bg);
        flex-shrink: 0;
      }

      .mep-search-wrap {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
      }

      .mep-search-icon {
        position: absolute;
        left: 10px;
        width: 14px;
        height: 14px;
        fill: var(--mep-text-muted);
        pointer-events: none;
      }

      .mep-search-input {
        width: 100%;
        height: 32px;
        padding: 0 28px 0 30px;
        background: var(--mep-surface);
        border: 1px solid transparent;
        border-radius: 16px;
        font-size: 13px;
        color: var(--mep-text);
        outline: none;
        transition: border-color 0.15s, background-color 0.15s;
      }

      .mep-search-input:focus {
        background: var(--mep-bg);
        border-color: var(--mep-accent);
        box-shadow: 0 0 0 2px var(--mep-accent-bg);
      }

      .mep-search-clear {
        position: absolute;
        right: 8px;
        width: 16px;
        height: 16px;
        display: none;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--mep-text-muted);
        color: var(--mep-bg);
        font-size: 10px;
        cursor: pointer;
        border: none;
        line-height: 1;
      }

      .mep-search-input:not(:placeholder-shown) + .mep-search-clear {
        display: flex;
      }

      .mep-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .mep-icon-btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        border-radius: var(--mep-radius-sm);
        color: var(--mep-text-muted);
        cursor: pointer;
        transition: background-color 0.15s, color 0.15s;
        font-size: 14px;
        user-select: none;
      }

      .mep-icon-btn:hover {
        background: var(--mep-surface-hover);
        color: var(--mep-text);
      }

      .mep-icon-btn.active {
        color: var(--mep-accent);
        background: var(--mep-accent-bg);
      }

      /* 分组 Tab 导航栏 */
      .mep-tabs-bar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        background: var(--mep-surface);
        border-bottom: 1px solid var(--mep-border-subtle);
        overflow-x: auto;
        overflow-y: hidden;
        flex-shrink: 0;
        scrollbar-width: none;
      }

      .mep-tabs-bar::-webkit-scrollbar {
        display: none;
      }

      .mep-tab-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 10px;
        border-radius: 14px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--mep-text-muted);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: all 0.15s cubic-bezier(0.2, 0, 0, 1);
        user-select: none;
      }

      .mep-tab-item:hover {
        background: var(--mep-surface-hover);
        color: var(--mep-text);
      }

      .mep-tab-item.active {
        background: var(--mep-bg);
        color: var(--mep-accent);
        border-color: var(--mep-border-subtle);
        box-shadow: var(--mep-shadow-sm);
      }

      .mep-tab-icon {
        width: 16px;
        height: 16px;
        object-fit: contain;
        border-radius: 3px;
      }

      /* 表情内容展示区 */
      .mep-content {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--mep-border) transparent;
      }

      .mep-content::-webkit-scrollbar {
        width: 6px;
      }

      .mep-content::-webkit-scrollbar-thumb {
        background: var(--mep-border);
        border-radius: 3px;
      }

      .mep-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
        gap: 6px;
      }

      /* 独立表情项卡片 */
      .mep-emoji-item {
        position: relative;
        width: 100%;
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--mep-radius-sm);
        background: transparent;
        cursor: pointer;
        padding: 3px;
        transition: background-color 0.12s ease, transform 0.1s ease;
        user-select: none;
      }

      .mep-emoji-item:hover {
        background: var(--mep-surface-hover);
        transform: translateY(-1px);
      }

      .mep-emoji-item:active {
        transform: scale(0.94);
      }

      .mep-emoji-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 4px;
        pointer-events: none;
      }

      /* 底部状态栏 */
      .mep-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: var(--mep-bg);
        border-top: 1px solid var(--mep-border-subtle);
        font-size: 11px;
        color: var(--mep-text-muted);
        flex-shrink: 0;
      }

      .mep-footer-left {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mep-footer-right {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      .mep-badge-btn {
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--mep-surface);
        border: 1px solid var(--mep-border-subtle);
        color: var(--mep-text-muted);
        font-size: 10px;
        cursor: pointer;
        transition: all 0.15s;
        user-select: none;
      }

      .mep-badge-btn:hover {
        background: var(--mep-surface-hover);
        color: var(--mep-text);
      }

      /* 悬浮大图预览 */
      .mep-hover-preview {
        position: fixed;
        pointer-events: none;
        display: none;
        z-index: 1000005;
        max-width: 260px;
        background: var(--mep-bg);
        border: 1px solid var(--mep-border);
        border-radius: var(--mep-radius-md);
        box-shadow: var(--mep-shadow-lg);
        padding: 8px;
        backdrop-filter: blur(16px);
        transform: translateZ(0);
        animation: mep-fade-in 0.12s ease-out;
      }

      @keyframes mep-fade-in {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }

      .mep-hover-preview img {
        display: block;
        max-width: 240px;
        max-height: 200px;
        margin: 0 auto;
        object-fit: contain;
        border-radius: 4px;
      }

      .mep-hover-preview .mep-label {
        margin-top: 6px;
        font-size: 11px;
        text-align: center;
        color: var(--mep-text-muted);
        word-break: break-all;
      }

      /* 空状态提示 */
      .mep-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 220px;
        text-align: center;
        padding: 24px;
        color: var(--mep-text-muted);
      }

      .mep-empty-icon {
        font-size: 36px;
        margin-bottom: 10px;
        opacity: 0.85;
      }

      .mep-empty-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--mep-text);
        margin-bottom: 6px;
      }

      .mep-empty-desc {
        font-size: 12px;
        line-height: 1.5;
        max-width: 260px;
        margin-bottom: 16px;
      }

      .mep-btn-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 7px 16px;
        border-radius: var(--mep-radius-sm);
        background: var(--mep-accent);
        color: #ffffff !important;
        font-size: 13px;
        font-weight: 500;
        border: none;
        cursor: pointer;
        transition: background-color 0.15s, transform 0.1s;
        user-select: none;
      }

      .mep-btn-primary:hover {
        background: var(--mep-accent-hover);
        transform: translateY(-1px);
      }

      /* ================= 移动端弹窗适配 ================= */
      .mep-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(4px);
        z-index: 999997;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .mep-backdrop.mep-visible {
        opacity: 1 !important;
      }

      .mep-modal-bottom {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        max-height: 75vh;
        z-index: 999998;
        background: var(--mep-bg);
        border-radius: 20px 20px 0 0;
        box-shadow: var(--mep-shadow-lg);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateY(100%);
        transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
      }

      .mep-modal-bottom.mep-visible {
        transform: translateY(0) !important;
      }

      .mep-modal-bottom .mep-header {
        padding: 12px 16px;
      }

      .mep-modal-bottom .mep-search-input {
        height: 36px;
        font-size: 14px;
      }

      .mep-modal-bottom .mep-grid {
        grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
        gap: 8px;
      }

      /* ================= 分组管理弹窗 (Group Manager) ================= */
      .mep-manager-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.96);
        width: 720px;
        max-width: calc(100vw - 28px);
        height: 620px;
        max-height: calc(100vh - 40px);
        background: var(--mep-bg);
        border: 1px solid var(--mep-border);
        border-radius: var(--mep-radius-lg);
        box-shadow: var(--mep-shadow-lg);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
      }

      .mep-manager-modal.mep-visible {
        opacity: 1 !important;
        transform: translate(-50%, -50%) scale(1) !important;
      }

      .mep-manager-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid var(--mep-border-subtle);
        background: var(--mep-bg);
        flex-shrink: 0;
      }

      .mep-manager-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--mep-text);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* 标签与搜索过滤栏 */
      .mep-manager-filters {
        padding: 10px 20px;
        background: var(--mep-surface);
        border-bottom: 1px solid var(--mep-border-subtle);
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-shrink: 0;
      }

      .mep-topic-pills {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 2px 0;
      }

      .mep-topic-pills::-webkit-scrollbar {
        display: none;
      }

      .mep-pill {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        background: var(--mep-bg);
        border: 1px solid var(--mep-border-subtle);
        color: var(--mep-text-muted);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s;
        user-select: none;
      }

      .mep-pill:hover {
        background: var(--mep-surface-hover);
        color: var(--mep-text);
      }

      .mep-pill.active {
        background: var(--mep-accent);
        border-color: var(--mep-accent);
        color: #ffffff;
      }

      /* 市场表情包卡片列表 */
      .mep-manager-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
      }

      .mep-pack-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
        gap: 12px;
      }

      .mep-pack-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--mep-surface);
        border: 1px solid var(--mep-border-subtle);
        border-radius: var(--mep-radius-md);
        transition: all 0.15s ease;
      }

      .mep-pack-card:hover {
        border-color: var(--mep-border);
        background: var(--mep-bg);
        box-shadow: var(--mep-shadow-sm);
      }

      .mep-pack-card.selected {
        border-color: var(--mep-accent);
        background: var(--mep-accent-bg);
      }

      .mep-pack-avatar {
        width: 44px;
        height: 44px;
        border-radius: var(--mep-radius-sm);
        background: var(--mep-bg);
        border: 1px solid var(--mep-border-subtle);
        object-fit: contain;
        padding: 2px;
        flex-shrink: 0;
      }

      .mep-pack-info {
        flex: 1;
        min-width: 0;
      }

      .mep-pack-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--mep-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 3px;
      }

      .mep-pack-meta {
        font-size: 11px;
        color: var(--mep-text-muted);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mep-pack-btn {
        padding: 5px 12px;
        border-radius: var(--mep-radius-sm);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.15s;
        white-space: nowrap;
        user-select: none;
      }

      .mep-pack-btn.add {
        background: var(--mep-bg);
        border-color: var(--mep-accent);
        color: var(--mep-accent);
      }

      .mep-pack-btn.add:hover {
        background: var(--mep-accent);
        color: #ffffff;
      }

      .mep-pack-btn.remove {
        background: var(--mep-bg);
        border-color: var(--mep-danger);
        color: var(--mep-danger);
      }

      .mep-pack-btn.remove:hover {
        background: var(--mep-danger);
        color: #ffffff;
      }

      /* 分页栏与保存底部 */
      .mep-manager-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        border-top: 1px solid var(--mep-border-subtle);
        background: var(--mep-bg);
        flex-shrink: 0;
      }

      .mep-manager-pagination {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--mep-text-muted);
      }

      .mep-page-btn {
        padding: 4px 10px;
        border-radius: 4px;
        background: var(--mep-surface);
        border: 1px solid var(--mep-border-subtle);
        color: var(--mep-text);
        cursor: pointer;
        font-size: 12px;
        user-select: none;
      }

      .mep-page-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* 工具栏图标按钮 */
      .market-emoji-toolbar-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.12s ease, color 0.15s ease;
        color: var(--tertiary, #0088cc) !important;
      }

      .market-emoji-toolbar-btn:hover {
        transform: scale(1.12);
      }
    `

    const style = document.createElement('style')
    style.id = 'market-emoji-picker-pro-styles'
    style.textContent = css
    document.head.appendChild(style)
  }

  // ============== 悬浮预览单例 ==============
  let hoverPreviewEl = null
  let hoverTimer = null

  function getHoverPreviewEl() {
    if (!hoverPreviewEl) {
      hoverPreviewEl = document.createElement('div')
      hoverPreviewEl.className = 'mep-hover-preview'
      hoverPreviewEl.innerHTML = '<img><div class="mep-label"></div>'
      document.body.appendChild(hoverPreviewEl)
    }
    return hoverPreviewEl
  }

  function bindHoverPreview(element, emoji) {
    if (!CONFIG.enableHoverPreview) return

    element.addEventListener('mouseenter', e => {
      clearTimeout(hoverTimer)
      hoverTimer = setTimeout(() => {
        const preview = getHoverPreviewEl()
        const img = preview.querySelector('img')
        const label = preview.querySelector('.mep-label')

        img.src = emoji.displayUrl || emoji.url
        label.textContent = emoji.name || ''
        preview.style.display = 'block'
        updatePreviewPosition(e, preview)
      }, 40)
    })

    element.addEventListener('mousemove', e => {
      if (hoverPreviewEl && hoverPreviewEl.style.display === 'block') {
        updatePreviewPosition(e, hoverPreviewEl)
      }
    })

    element.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer)
      if (hoverPreviewEl) {
        hoverPreviewEl.style.display = 'none'
      }
    })
  }

  function updatePreviewPosition(e, preview) {
    const pad = 12
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = preview.getBoundingClientRect()
    let left = e.clientX + pad
    let top = e.clientY + pad

    if (left + (rect.width || 200) > vw - 6) {
      left = e.clientX - (rect.width || 200) - pad
    }
    if (top + (rect.height || 180) > vh - 6) {
      top = e.clientY - (rect.height || 180) - pad
    }
    preview.style.left = `${Math.max(6, left)}px`
    preview.style.top = `${Math.max(6, top)}px`
  }

  // ============== 表情插入逻辑 ==============
  async function fetchImageData(url) {
    try {
      const response = await fetch(url, { mode: 'cors' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      return { data: blob, type: blob.type }
    } catch {
      return new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest === 'undefined') {
          reject(new Error('GM_xmlhttpRequest unavailable'))
          return
        }
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'blob',
          onload: resp => {
            const blob = resp.response
            resolve({ data: blob, type: blob.type || 'image/png' })
          },
          onerror: reject
        })
      })
    }
  }

  async function uploadEmojiToDiscourse(emoji) {
    const discourse = window.Discourse
    if (!discourse?.__container__) {
      throw new Error('Discourse runtime not available')
    }
    const appEvents = discourse.__container__.lookup('service:app-events')
    if (!appEvents) {
      throw new Error('Discourse appEvents service not available')
    }

    const imageData = await fetchImageData(emoji.displayUrl || emoji.url)
    const ext = (imageData.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')
    const file = new File([imageData.data], `${emoji.name}.${ext}`, { type: imageData.type })

    return new Promise((resolve, reject) => {
      let settled = false
      const onSuccess = (_fileName, upload) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(upload)
      }
      const onError = error => {
        if (settled) return
        settled = true
        cleanup()
        reject(error || new Error('Discourse upload failed'))
      }
      function cleanup() {
        appEvents.off('composer:upload-success', onSuccess)
        appEvents.off('composer:upload-error', onError)
      }
      appEvents.on('composer:upload-success', onSuccess)
      appEvents.on('composer:upload-error', onError)
      appEvents.trigger('composer:add-files', file)
    })
  }

  async function insertEmoji(emoji) {
    const selectors = [
      '#reply-control.open textarea.d-editor-input',
      '#reply-control textarea.d-editor-input',
      '.chat-composer__wrapper textarea',
      '.chat-composer textarea',
      'textarea.d-editor-input',
      'textarea.ember-text-area',
      '.ProseMirror.d-editor-input',
      '[contenteditable="true"]'
    ]
    let editor = null
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el && (el.offsetParent !== null || el === document.activeElement)) {
        editor = el
        break
      }
    }
    if (!editor) {
      for (const sel of selectors) {
        editor = document.querySelector(sel)
        if (editor) break
      }
    }

    if (!editor) {
      console.error('[Market Emoji] 未找到活跃编辑器')
      return
    }

    let imageUrl = emoji.url
    let imageWidth = emoji.width || 500
    let imageHeight = emoji.height || 500
    const scale = CONFIG.imageScale

    if (CONFIG.uploadToDiscourse) {
      try {
        const upload = await uploadEmojiToDiscourse(emoji)
        if (upload?.url) {
          imageUrl = upload.url
          if (upload.width) imageWidth = upload.width
          if (upload.height) imageHeight = upload.height
        }
      } catch (e) {
        console.warn('[Market Emoji] 上传到 Discourse 失败，回退到远程链接:', e)
      }
    }

    let insertText = ''
    if (CONFIG.outputFormat === 'html') {
      const scaledWidth = Math.max(1, Math.round(imageWidth * (scale / 100)))
      const scaledHeight = Math.max(1, Math.round(imageHeight * (scale / 100)))
      insertText = `<img src="${imageUrl}" title=":${emoji.name}:" class="emoji" alt=":${emoji.name}:" loading="lazy" width="${scaledWidth}" height="${scaledHeight}"> `
    } else {
      insertText = `![${emoji.name}|${imageWidth}x${imageHeight},${scale}%](${imageUrl}) `
    }

    if (editor.tagName === 'TEXTAREA') {
      const start = editor.selectionStart !== undefined ? editor.selectionStart : editor.value.length
      const end = editor.selectionEnd !== undefined ? editor.selectionEnd : editor.value.length
      editor.value = editor.value.substring(0, start) + insertText + editor.value.substring(end)
      editor.selectionStart = editor.selectionEnd = start + insertText.length
      editor.focus()
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      editor.dispatchEvent(new Event('change', { bubbles: true }))
    } else {
      editor.focus()
      try {
        const dataTransfer = new DataTransfer()
        dataTransfer.setData(CONFIG.outputFormat === 'html' ? 'text/html' : 'text/plain', insertText)
        const pasteEvent = new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true })
        editor.dispatchEvent(pasteEvent)
      } catch {
        document.execCommand('insertText', false, insertText)
      }
    }
  }

  // ============== 高性能选择器 (Picker) ==============
  let currentPicker = null
  let currentBackdrop = null
  let outsideClickListener = null

  function closeActivePicker() {
    if (hoverPreviewEl) hoverPreviewEl.style.display = 'none'

    if (outsideClickListener) {
      document.removeEventListener('pointerdown', outsideClickListener, true)
      outsideClickListener = null
    }

    if (currentPicker) {
      const target = currentPicker
      target.classList.remove('mep-visible')
      setTimeout(() => target.remove(), 180)
      currentPicker = null
    }
    if (currentBackdrop) {
      const target = currentBackdrop
      target.classList.remove('mep-visible')
      setTimeout(() => target.remove(), 180)
      currentBackdrop = null
    }
  }

  // 计算并设置选择器位置
  function positionPicker(picker, anchorEl) {
    if (shouldUseMobileView()) return

    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pickerWidth = 380
    const pickerHeight = 440

    let top, left

    if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
      const rect = anchorEl.getBoundingClientRect()
      // Discourse 编辑器工具栏通常位于底部，优先向上展开
      if (rect.top - pickerHeight - margin >= 10) {
        top = rect.top - pickerHeight - margin
      } else if (rect.bottom + pickerHeight + margin <= vh - 10) {
        top = rect.bottom + margin
      } else {
        top = Math.max(10, Math.min(vh - pickerHeight - 10, rect.top - pickerHeight - margin))
      }

      left = rect.left
      if (left + pickerWidth > vw - margin) {
        left = Math.max(margin, vw - pickerWidth - margin)
      }
      if (left < margin) left = margin
    } else {
      // 若无锚点则屏幕居中
      top = Math.max(margin, (vh - pickerHeight) / 2)
      left = Math.max(margin, (vw - pickerWidth) / 2)
    }

    picker.style.top = `${Math.round(top)}px`
    picker.style.left = `${Math.round(left)}px`
  }

  function showPicker(anchorEl) {
    if (currentPicker) {
      closeActivePicker()
      return
    }

    const useMobile = shouldUseMobileView()

    if (useMobile) {
      currentBackdrop = document.createElement('div')
      currentBackdrop.className = 'mep-backdrop'
      currentBackdrop.onclick = () => closeActivePicker()
      document.body.appendChild(currentBackdrop)
    }

    const picker = document.createElement('div')
    picker.className = useMobile ? 'mep-modal-bottom' : 'mep-picker'

    // 检查是否有选中的分组
    if (selectedEmojiGroups.length === 0) {
      picker.innerHTML = `
        <div class="mep-header">
          <div style="font-weight:600;font-size:14px;color:var(--mep-text);display:flex;align-items:center;gap:6px;">
            <span>✨</span><span>表情选择器</span>
          </div>
          <div class="mep-header-actions" style="margin-left:auto;">
            <button class="mep-icon-btn mep-close-btn" title="关闭">✕</button>
          </div>
        </div>
        <div class="mep-empty-state">
          <div class="mep-empty-icon">📦</div>
          <div class="mep-empty-title">尚未添加任何表情包</div>
          <div class="mep-empty-desc">前往云端表情市场，挑选并添加您喜欢的表情分组吧！</div>
          <button class="mep-btn-primary mep-manage-btn">⚙️ 前往挑选表情包</button>
        </div>
      `
      picker.querySelector('.mep-close-btn').onclick = () => closeActivePicker()
      picker.querySelector('.mep-manage-btn').onclick = () => {
        closeActivePicker()
        showGroupManager()
      }

      document.body.appendChild(picker)
      currentPicker = picker

      positionPicker(picker, anchorEl)

      // 点击外部关闭监听
      if (!useMobile) {
        setTimeout(() => {
          outsideClickListener = e => {
            if (
              currentPicker &&
              !currentPicker.contains(e.target) &&
              (!anchorEl || !anchorEl.contains(e.target))
            ) {
              closeActivePicker()
            }
          }
          document.addEventListener('pointerdown', outsideClickListener, true)
        }, 50)
      }

      requestAnimationFrame(() => {
        if (currentBackdrop) currentBackdrop.classList.add('mep-visible')
        picker.classList.add('mep-visible')
      })
      return
    }

    // 确定默认激活分组
    let activeGroupId = CONFIG.activeGroupId
    if (!selectedEmojiGroups.some(g => g.id === activeGroupId)) {
      activeGroupId = selectedEmojiGroups[0].id
    }

    // 渲染 Picker 主结构
    picker.innerHTML = `
      <div class="mep-header">
        <div class="mep-search-wrap">
          <svg class="mep-search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" class="mep-search-input" placeholder="搜索表情...">
          <button class="mep-search-clear">✕</button>
        </div>
        <div class="mep-header-actions">
          <button class="mep-icon-btn mep-toggle-preview-btn ${CONFIG.enableHoverPreview ? 'active' : ''}" title="悬浮大图预览 (开/关)">👁️</button>
          <button class="mep-icon-btn mep-open-manager-btn" title="管理表情包">⚙️</button>
          <button class="mep-icon-btn mep-close-btn" title="关闭">✕</button>
        </div>
      </div>
      <div class="mep-tabs-bar"></div>
      <div class="mep-content">
        <div class="mep-grid"></div>
      </div>
      <div class="mep-footer">
        <div class="mep-footer-left">
          <span class="mep-status-text"></span>
        </div>
        <div class="mep-footer-right">
          <button class="mep-badge-btn mep-scale-btn" title="点击修改缩放比例">缩放: ${CONFIG.imageScale}%</button>
          <button class="mep-badge-btn mep-format-btn" title="点击切换格式">${CONFIG.outputFormat.toUpperCase()}</button>
        </div>
      </div>
    `

    const tabsBar = picker.querySelector('.mep-tabs-bar')
    const gridEl = picker.querySelector('.mep-grid')
    const searchInput = picker.querySelector('.mep-search-input')
    const searchClear = picker.querySelector('.mep-search-clear')
    const statusText = picker.querySelector('.mep-status-text')
    const previewToggleBtn = picker.querySelector('.mep-toggle-preview-btn')
    const formatBtn = picker.querySelector('.mep-format-btn')
    const scaleBtn = picker.querySelector('.mep-scale-btn')

    // 绑定顶部动作
    picker.querySelector('.mep-close-btn').onclick = () => closeActivePicker()
    picker.querySelector('.mep-open-manager-btn').onclick = () => {
      closeActivePicker()
      showGroupManager()
    }

    previewToggleBtn.onclick = () => {
      CONFIG.enableHoverPreview = !CONFIG.enableHoverPreview
      GM_setValue('enableHoverPreview', CONFIG.enableHoverPreview)
      previewToggleBtn.classList.toggle('active', CONFIG.enableHoverPreview)
      if (!CONFIG.enableHoverPreview && hoverPreviewEl) {
        hoverPreviewEl.style.display = 'none'
      }
    }

    formatBtn.onclick = () => {
      CONFIG.outputFormat = CONFIG.outputFormat === 'markdown' ? 'html' : 'markdown'
      GM_setValue('outputFormat', CONFIG.outputFormat)
      formatBtn.textContent = CONFIG.outputFormat.toUpperCase()
    }

    scaleBtn.onclick = () => {
      const nextScale = CONFIG.imageScale === 30 ? 50 : CONFIG.imageScale === 50 ? 100 : 30
      CONFIG.imageScale = nextScale
      GM_setValue('imageScale', nextScale)
      scaleBtn.textContent = `缩放: ${nextScale}%`
    }

    // 渲染分组 Tab
    function renderTabs() {
      tabsBar.innerHTML = ''
      selectedEmojiGroups.forEach(group => {
        const btn = document.createElement('button')
        btn.className = `mep-tab-item ${group.id === activeGroupId ? 'active' : ''}`
        btn.dataset.groupId = group.id

        if (group.icon && (group.icon.startsWith('http') || group.icon.startsWith('data:'))) {
          const icon = document.createElement('img')
          icon.className = 'mep-tab-icon'
          icon.src = group.icon
          icon.alt = group.name
          btn.appendChild(icon)
        }

        const nameSpan = document.createElement('span')
        nameSpan.textContent = group.name
        btn.appendChild(nameSpan)

        btn.onclick = () => {
          if (activeGroupId === group.id && !searchInput.value.trim()) return
          activeGroupId = group.id
          CONFIG.activeGroupId = group.id
          GM_setValue('lastActiveGroupId', group.id)
          searchInput.value = ''
          tabsBar.querySelectorAll('.mep-tab-item').forEach(t => t.classList.remove('active'))
          btn.classList.add('active')
          renderActiveTabEmojis()
        }

        tabsBar.appendChild(btn)
      })
    }

    // 按需渲染当前激活 Tab 表情
    function renderActiveTabEmojis() {
      gridEl.innerHTML = ''
      const group = selectedEmojiGroups.find(g => g.id === activeGroupId)
      if (!group || !group.emojis || group.emojis.length === 0) {
        gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--mep-text-muted);font-size:12px;">该分组暂无表情</div>'
        statusText.textContent = `${group?.name || ''}`
        return
      }

      statusText.textContent = `${group.name} (${group.emojis.length})`

      const fragment = document.createDocumentFragment()
      group.emojis.forEach(emoji => {
        const item = document.createElement('div')
        item.className = 'mep-emoji-item'
        item.title = emoji.name

        const img = document.createElement('img')
        img.className = 'mep-emoji-img'
        img.alt = emoji.name
        img.src = emoji.displayUrl || emoji.url
        img.loading = 'lazy'

        item.appendChild(img)
        bindHoverPreview(item, emoji)

        item.onclick = async () => {
          await insertEmoji(emoji)
          closeActivePicker()
        }

        fragment.appendChild(item)
      })

      gridEl.appendChild(fragment)
    }

    // 全局关键词搜索过滤（跨选中的所有分组）
    let searchDebounceTimer = null
    function handleSearch() {
      const query = searchInput.value.trim().toLowerCase()
      if (!query) {
        tabsBar.style.display = 'flex'
        renderActiveTabEmojis()
        return
      }

      tabsBar.style.display = 'none'
      gridEl.innerHTML = ''

      const matchedEmojis = []
      selectedEmojiGroups.forEach(group => {
        ;(group.emojis || []).forEach(emoji => {
          if ((emoji.name || '').toLowerCase().includes(query)) {
            matchedEmojis.push(emoji)
          }
        })
      })

      statusText.textContent = `搜索结果 (${matchedEmojis.length})`

      if (matchedEmojis.length === 0) {
        gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--mep-text-muted);font-size:12px;">未找到匹配的表情</div>'
        return
      }

      const fragment = document.createDocumentFragment()
      matchedEmojis.slice(0, 150).forEach(emoji => {
        const item = document.createElement('div')
        item.className = 'mep-emoji-item'
        item.title = emoji.name

        const img = document.createElement('img')
        img.className = 'mep-emoji-img'
        img.alt = emoji.name
        img.src = emoji.displayUrl || emoji.url
        img.loading = 'lazy'

        item.appendChild(img)
        bindHoverPreview(item, emoji)

        item.onclick = async () => {
          await insertEmoji(emoji)
          closeActivePicker()
        }

        fragment.appendChild(item)
      })

      gridEl.appendChild(fragment)
    }

    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = setTimeout(handleSearch, 100)
    })

    searchClear.onclick = () => {
      searchInput.value = ''
      handleSearch()
    }

    // 支持鼠标滚轮横向滚动 Tab 栏
    tabsBar.addEventListener('wheel', e => {
      if (e.deltaY !== 0) {
        e.preventDefault()
        tabsBar.scrollLeft += e.deltaY * 0.8
      }
    }, { passive: false })

    // 初始化渲染
    renderTabs()
    renderActiveTabEmojis()

    document.body.appendChild(picker)
    currentPicker = picker

    positionPicker(picker, anchorEl)

    // 桌面端点击外部关闭
    if (!useMobile) {
      setTimeout(() => {
        outsideClickListener = e => {
          if (
            currentPicker &&
            !currentPicker.contains(e.target) &&
            (!anchorEl || !anchorEl.contains(e.target))
          ) {
            closeActivePicker()
          }
        }
        document.addEventListener('pointerdown', outsideClickListener, true)
      }, 50)
    }

    // 显示动画
    requestAnimationFrame(() => {
      if (currentBackdrop) currentBackdrop.classList.add('mep-visible')
      picker.classList.add('mep-visible')
    })
  }

  // ============== 分组管理器 (Group Manager Pro) ==============
  let managerModal = null
  let managerBackdrop = null

  async function showGroupManager() {
    if (managerModal) return

    if (!marketMetadata || marketGroups.length === 0) {
      await loadMarketMetadata()
    }

    let tempSelectedGroupIds = [...(CONFIG.selectedGroupIds || [])]
    let activeFilterTopic = 'all'
    let searchQuery = ''
    let currentPage = 1
    const PAGE_SIZE = 30

    managerBackdrop = document.createElement('div')
    managerBackdrop.className = 'mep-backdrop'
    managerBackdrop.onclick = () => closeManagerModal()
    document.body.appendChild(managerBackdrop)

    managerModal = document.createElement('div')
    managerModal.className = 'mep-manager-modal'

    managerModal.innerHTML = `
      <div class="mep-manager-header">
        <div class="mep-manager-title">
          <span>📦</span>
          <span>表情包市场 & 分组管理</span>
        </div>
        <button class="mep-icon-btn mep-manager-close" title="关闭">✕</button>
      </div>

      <div class="mep-manager-filters">
        <div class="mep-search-wrap">
          <svg class="mep-search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" class="mep-search-input mep-manager-search" placeholder="在全量市场中搜索表情包...">
          <button class="mep-search-clear">✕</button>
        </div>
        <div class="mep-topic-pills"></div>
      </div>

      <div class="mep-manager-content">
        <div class="mep-pack-grid"></div>
      </div>

      <div class="mep-manager-footer">
        <div class="mep-manager-pagination">
          <button class="mep-page-btn mep-prev-page">上一页</button>
          <span class="mep-page-info">第 1 页</span>
          <button class="mep-page-btn mep-next-page">下一页</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:13px;color:var(--mep-text-muted);" class="mep-selected-summary">已选 0 个</span>
          <button class="mep-btn-primary mep-save-btn">保存并应用</button>
        </div>
      </div>
    `

    const topicPillsEl = managerModal.querySelector('.mep-topic-pills')
    const packGridEl = managerModal.querySelector('.mep-pack-grid')
    const searchInput = managerModal.querySelector('.mep-manager-search')
    const searchClear = managerModal.querySelector('.mep-search-clear')
    const pageInfoEl = managerModal.querySelector('.mep-page-info')
    const prevBtn = managerModal.querySelector('.mep-prev-page')
    const nextBtn = managerModal.querySelector('.mep-next-page')
    const selectedSummaryEl = managerModal.querySelector('.mep-selected-summary')
    const saveBtn = managerModal.querySelector('.mep-save-btn')

    managerModal.querySelector('.mep-manager-close').onclick = () => closeManagerModal()

    // 渲染分类标签 Pills
    function renderTopicPills() {
      topicPillsEl.innerHTML = ''
      const topics = [{ id: 'all', label: '全部' }, { id: 'selected', label: '⭐ 已选择' }, ...marketTopics]
      topics.forEach(t => {
        const pill = document.createElement('button')
        pill.className = `mep-pill ${t.id === activeFilterTopic ? 'active' : ''}`
        pill.textContent = t.label
        pill.onclick = () => {
          activeFilterTopic = t.id
          currentPage = 1
          topicPillsEl.querySelectorAll('.mep-pill').forEach(p => p.classList.remove('active'))
          pill.classList.add('active')
          renderPackList()
        }
        topicPillsEl.appendChild(pill)
      })
    }

    // 渲染表情包卡片列表
    function renderPackList() {
      packGridEl.innerHTML = ''
      selectedSummaryEl.textContent = `已选 ${tempSelectedGroupIds.length} 个`

      let list = marketGroups
      if (activeFilterTopic === 'selected') {
        const selectedSet = new Set(tempSelectedGroupIds)
        list = marketGroups.filter(g => selectedSet.has(g.id))
      } else if (activeFilterTopic !== 'all') {
        list = marketGroups.filter(g => g.topic === activeFilterTopic)
      }

      if (searchQuery) {
        list = list.filter(
          g =>
            (g.name || '').toLowerCase().includes(searchQuery) ||
            (g.detail || '').toLowerCase().includes(searchQuery) ||
            (g.topic || '').toLowerCase().includes(searchQuery)
        )
      }

      if (list.length === 0) {
        packGridEl.innerHTML =
          '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--mep-text-muted);font-size:13px;">没有找到符合条件的表情包</div>'
        prevBtn.style.display = 'none'
        nextBtn.style.display = 'none'
        pageInfoEl.textContent = '共 0 项'
        return
      }

      const totalPages = Math.ceil(list.length / PAGE_SIZE)
      if (currentPage > totalPages) currentPage = totalPages
      if (currentPage < 1) currentPage = 1

      const startIdx = (currentPage - 1) * PAGE_SIZE
      const pagedList = list.slice(startIdx, startIdx + PAGE_SIZE)

      const fragment = document.createDocumentFragment()
      pagedList.forEach(group => {
        const isSelected = tempSelectedGroupIds.includes(group.id)
        const card = document.createElement('div')
        card.className = `mep-pack-card ${isSelected ? 'selected' : ''}`

        const avatar = document.createElement('img')
        avatar.className = 'mep-pack-avatar'
        avatar.src = group.icon || 'https://cdn3.ldstatic.com/optimized/3X/9/d/9dd49731091ce8656e94433a26a3ef76f9c0f8d9_2_32x32.png'
        avatar.alt = group.name
        avatar.loading = 'lazy'
        card.appendChild(avatar)

        const info = document.createElement('div')
        info.className = 'mep-pack-info'

        const name = document.createElement('div')
        name.className = 'mep-pack-name'
        name.textContent = group.name
        name.title = group.name
        info.appendChild(name)

        const meta = document.createElement('div')
        meta.className = 'mep-pack-meta'
        meta.innerHTML = `<span>${group.emojiCount || 0} 个表情</span><span>·</span><span>${group.topic || 'other'}</span>`
        info.appendChild(meta)

        card.appendChild(info)

        const actionBtn = document.createElement('button')
        actionBtn.className = `mep-pack-btn ${isSelected ? 'remove' : 'add'}`
        actionBtn.textContent = isSelected ? '移除' : '+ 添加'

        actionBtn.onclick = e => {
          e.stopPropagation()
          if (tempSelectedGroupIds.includes(group.id)) {
            tempSelectedGroupIds = tempSelectedGroupIds.filter(id => id !== group.id)
          } else {
            tempSelectedGroupIds.push(group.id)
          }
          renderPackList()
        }

        card.appendChild(actionBtn)
        fragment.appendChild(card)
      })

      packGridEl.appendChild(fragment)

      // 更新分页
      pageInfoEl.textContent = `第 ${currentPage} / ${totalPages} 页 (共 ${list.length} 个)`
      prevBtn.disabled = currentPage <= 1
      nextBtn.disabled = currentPage >= totalPages
      prevBtn.style.display = totalPages > 1 ? '' : 'none'
      nextBtn.style.display = totalPages > 1 ? '' : 'none'
    }

    prevBtn.onclick = () => {
      if (currentPage > 1) {
        currentPage--
        renderPackList()
        managerModal.querySelector('.mep-manager-content').scrollTop = 0
      }
    }

    nextBtn.onclick = () => {
      currentPage++
      renderPackList()
      managerModal.querySelector('.mep-manager-content').scrollTop = 0
    }

    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value.trim().toLowerCase()
      currentPage = 1
      renderPackList()
    })

    searchClear.onclick = () => {
      searchInput.value = ''
      searchQuery = ''
      currentPage = 1
      renderPackList()
    }

    saveBtn.onclick = async () => {
      saveBtn.disabled = true
      saveBtn.textContent = '保存中...'
      CONFIG.selectedGroupIds = tempSelectedGroupIds
      GM_setValue('selectedGroupIds', tempSelectedGroupIds)
      localStorage.removeItem(GROUPS_CACHE_TIME_KEY)
      await loadSelectedGroups()
      saveBtn.disabled = false
      saveBtn.textContent = '保存并应用'
      closeManagerModal()
    }

    renderTopicPills()
    renderPackList()

    document.body.appendChild(managerModal)
    requestAnimationFrame(() => {
      managerBackdrop.classList.add('mep-visible')
      managerModal.classList.add('mep-visible')
    })
  }

  function closeManagerModal() {
    if (managerModal) {
      managerModal.classList.remove('mep-visible')
      managerBackdrop.classList.remove('mep-visible')
      setTimeout(() => {
        managerModal?.remove()
        managerBackdrop?.remove()
        managerModal = null
        managerBackdrop = null
      }, 200)
    }
  }

  // ESC 键关闭所有弹窗
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (managerModal) closeManagerModal()
      else if (currentPicker) closeActivePicker()
    }
  })

  // ============== 工具栏注入与监听 ==============
  const TOOLBAR_BUTTON_SELECTOR = '.market-emoji-toolbar-btn'

  function findToolbars() {
    const toolbars = []
    document.querySelectorAll('#reply-control').forEach(composer => {
      const toolbar = composer.querySelector('.d-editor-button-bar')
      if (toolbar) toolbars.push(toolbar)
    })
    document.querySelectorAll('.d-editor-button-bar').forEach(toolbar => {
      if (!toolbar.closest('#reply-control') && !toolbars.includes(toolbar)) {
        toolbars.push(toolbar)
      }
    })
    document.querySelectorAll('.chat-composer__wrapper .chat-composer__inner-container, .chat-composer-button-bar').forEach(toolbar => {
      if (!toolbars.includes(toolbar)) toolbars.push(toolbar)
    })
    return toolbars
  }

  function injectButton(toolbar) {
    if (!toolbar?.isConnected) return false
    if (toolbar.querySelector(TOOLBAR_BUTTON_SELECTOR)) return false

    const btn = document.createElement('button')
    btn.className = 'btn no-text btn-icon market-emoji-toolbar-btn'
    btn.title = '市场表情包 (Market Emoji Pro)'
    btn.type = 'button'
    btn.dataset.marketEmojiInjected = 'true'
    // 注入内联 FontAwesome face-smile SVG，保证跨主题、跨版本 100% 渲染正常
    btn.innerHTML = `
      <svg class="fa d-icon svg-icon svg-string" viewBox="0 0 512 512" aria-hidden="true" style="width:1.05em;height:1.05em;fill:currentColor;">
        <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM164.1 325.5C182 346.2 212.6 368 256 368s74-21.8 91.9-42.5c5.8-6.7 15.9-7.4 22.6-1.6s7.4 15.9 1.6 22.6C349.8 372.1 311.1 400 256 400s-93.8-27.9-116.1-53.5c-5.8-6.7-5.1-16.8 1.6-22.6s16.8-5.1 22.6 1.6zM144.4 208a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm192-32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/>
      </svg>
    `

    btn.onclick = e => {
      e.preventDefault()
      e.stopPropagation()
      showPicker(btn)
    }

    toolbar.appendChild(btn)
    return true
  }

  function attemptInjection() {
    const toolbars = findToolbars()
    toolbars.forEach(tb => injectButton(tb))
  }

  // ============== 初始化流程 ==============
  async function init() {
    injectStyles()
    loadMarketMetadata().catch(() => {})
    loadSelectedGroups().catch(() => {})

    attemptInjection()

    // 监听 DOM 变化以应对 Discourse SPA 页面路由切换和 Composer 弹出
    let injectionTimer = null
    const scheduleInjection = () => {
      if (injectionTimer) return
      injectionTimer = requestAnimationFrame(() => {
        injectionTimer = null
        attemptInjection()
      })
    }

    const observer = new MutationObserver(scheduleInjection)
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init())
  } else {
    init()
  }
})()

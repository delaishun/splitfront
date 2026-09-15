// splitapp/src/main.ts

import './assets/index.css';

import { createApp } from 'vue';
import { retrieveLaunchParams } from '@tma.js/sdk-vue';

import App from './App.vue';
import router from './router';
import { errorHandler } from './errorHandler';
import { init } from './init';
import { TonConnectUIPlugin } from './tonconnect';
import { publicUrl } from './helperts/publicUrl';

import { Buffer } from 'buffer';

// 💡 必须与 init.ts / api.ts保持一致的 Session Cache Key
const INIT_DATA_SESSION_KEY = 'sp_tg_init_data_cache';

// 💡 防御性措施：如果 URL 中带有了最新的 tgWebAppData，则优先清除旧 Session 缓存以使用最新凭证
if (typeof window !== 'undefined') {
  try {
    const href = window.location.href;
    if (href.includes('tgWebAppData=') || href.includes('tgWebAppStartParam=')) {
      sessionStorage.removeItem(INIT_DATA_SESSION_KEY);
      console.log('[Main Init] 🧹 检测到 URL 携带最新 WebApp 参数，已自动刷新 Session 身份缓存');
    }
  } catch (e) {
    // 忽略 sessionStorage 异常
  }
}

// 解决 Vite / 浏览器环境找不到 Buffer 的问题
if (typeof window !== 'undefined' && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
  console.log('[Main Debug] 已成功挂载全局 Buffer 对象');
}

// 🚨 严禁在生产或真机测试环境引入 mockEnv！确保已被完全注释/删除
// import './mockEnv';

// 💡 辅助工具：提取并格式化 initData 参数中的 User 对象
function parseUserFromInitDataStr(initDataStr: string): any | null {
  if (!initDataStr) return null;
  try {
    const decoded = initDataStr.includes('%22') || initDataStr.includes('%7B')
      ? decodeURIComponent(initDataStr)
      : initDataStr;
    const searchParams = new URLSearchParams(decoded);
    const userStr = searchParams.get('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch (e) {
    // 忽略解析异常
  }
  return null;
}

// 💡 1. 拦截与全局注入 Telegram LaunchParams 及 initData
let platform = 'unknown';
let debug = import.meta.env.DEV;
let globalInitData = '';

try {
  const launchParams = retrieveLaunchParams();
  platform = launchParams.tgWebAppPlatform || 'unknown';
  
  const startParam = typeof launchParams.startParam === 'string' 
    ? launchParams.startParam 
    : (launchParams.tgWebAppStartParam || '');

  debug = startParam.includes('debug') || import.meta.env.DEV;
  
  // 从 LaunchParams 安全提取 initDataRaw
  if (launchParams && launchParams.initDataRaw) {
    const rawStr = typeof launchParams.initDataRaw === 'string'
      ? launchParams.initDataRaw
      : String(launchParams.initDataRaw);
    if (rawStr && rawStr.trim() && rawStr !== '[object Object]') {
      globalInitData = rawStr.trim();
    }
  }

  console.log('[Main Debug] 成功提取 Telegram LaunchParams:', {
    platform,
    debug,
    startParam,
    hasInitDataInLaunchParams: Boolean(globalInitData)
  });
} catch (e) {
  console.warn('[Main Debug] retrieveLaunchParams 获取失败 (可能在普通浏览器或 Hash 页面环境):', e);
}

// 💡 2. 原生 WebApp & URL 多重提取并全局挂载兜底，保障路由跳转前身份已就位
if (typeof window !== 'undefined') {
  const nativeWebApp = (window as any).Telegram?.WebApp;
  const nativeInitData = nativeWebApp?.initData || '';

  if (!globalInitData && nativeInitData) {
    globalInitData = nativeInitData.trim();
  }

  // 从 URL Search / Hash 解构 fallback
  if (!globalInitData) {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const searchData = searchParams.get('tgWebAppData');
      if (searchData && searchData.trim()) {
        globalInitData = decodeURIComponent(searchData.trim());
      } else {
        const rawHash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(rawHash);
        const hashData = hashParams.get('tgWebAppData');
        if (hashData && hashData.trim()) {
          globalInitData = decodeURIComponent(hashData.trim());
        }
      }
    } catch (e) {}
  }

  // 从 SessionStorage 恢复 fallback
  if (!globalInitData) {
    try {
      const cached = sessionStorage.getItem(INIT_DATA_SESSION_KEY);
      if (cached && cached.trim()) {
        globalInitData = cached.trim();
      }
    } catch (e) {}
  }

  // 成功获取后挂载到 window 单例并写入 Session
  if (globalInitData) {
    (window as any).__SP_INIT_DATA__ = globalInitData;
    try {
      sessionStorage.setItem(INIT_DATA_SESSION_KEY, globalInitData);
    } catch (e) {}
  }

  const currentTgUser = parseUserFromInitDataStr(globalInitData);

  if (globalInitData) {
    console.log(
      `%c[Main Debug] 🚀 入口身份加载成功: User ID=[${currentTgUser?.id || '未知'}] | Username=[${currentTgUser?.username || '无'}] | 凭证长度=[${globalInitData.length}]`,
      'background: #000; color: #00ffcc; font-weight: bold; font-size: 13px; padding: 4px;'
    );
  } else {
    console.log(
      `%c[Main Debug] 🔴 警告: 启动入口未识别到任何有效的 initData，若在 Telegram 环境运行请检查入口配置！`,
      'background: #330000; color: #ff3333; font-weight: bold; font-size: 13px; padding: 4px;'
    );
  }
}

console.log(`[Main Debug] 启动配置 - Debug: ${debug}, Platform: ${platform}`);

// Configure all application dependencies.
init({
  debug,
  eruda: debug && ['ios', 'android'].includes(platform),
  // 💡 【重要修复】关闭 mockForMacOS，强制 macOS 客户端使用真实的 Telegram 签名数据
  mockForMacOS: false,
})
  // 💡 3. 安全等待 init 执行完成
  .then(async () => {
    console.log('[Main Debug] SDK init 初始化完成，开始创建 Vue 实例...');
    
    const app = createApp(App);

    app.config.errorHandler = errorHandler;
    app.use(router);
    
    const manifestUrl = publicUrl('tonconnect-manifest.json');
    console.log('[Main Debug] 配置 TonConnect Manifest 地址:', manifestUrl);
    app.use(TonConnectUIPlugin, { manifestUrl });

    // 💡 核心优化：确保异步路由（懒加载组件）全部解析完毕后再挂载 DOM，防止 Hash 路由抹去参数
    console.log('[Main Debug] 等待 Vue Router 准备完毕 (router.isReady)...');
    await router.isReady();

    app.mount('#app');
    console.log('[Main Debug] 🎉 Vue 应用成功挂载到 #app！全流程启动完毕。');
  })
  .catch((err) => {
    // 💡 4. 捕获入口顶层的全量异常，防止静默白屏
    console.error('[Main Debug] ❌ 应用初始化或挂载过程中发生致命错误:', err);
  });
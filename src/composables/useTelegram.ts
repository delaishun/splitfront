// splitapp/src/composables/useTelegram.ts

import { ref, readonly, computed } from 'vue';
import {
  parseLaunchParamsQuery,
  retrieveLaunchParams,
  hapticFeedback,
} from '@tma.js/sdk';

// 声明 SessionStorage 缓存 Key
const INIT_DATA_SESSION_KEY = 'sp_tg_init_data_cache';
const START_PARAM_SESSION_KEY = 'sp_tg_start_param_cache';

// 声明 Telegram 启动参数的内部响应式状态
const isReady = ref(false);
const initRawData = ref<string>('');
const startParam = ref<string>('');
const theme = ref<Record<string, string>>({});

// 1. 创建或保留 initPromise 实例
const initPromise = new Promise<void>((resolve) => {
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
    const tg = (window as any).Telegram.WebApp;
    tg.ready();
    isReady.value = true;
    resolve();
  } else {
    // 兼容在非 Telegram 环境下的处理
    resolve();
  }
});

/**
 * 💡 辅助函数：安全清洗多重 URL 编码的字符串（例如 %253D -> %3D -> =）
 * 修复：防止 URL 或路由传递时产生二次编码（含有 %25），导致发往后端的 initData HMAC 签名无法对齐而触发 401
 */
function safeFullyDecode(str: string): string {
  if (!str) return '';
  let current = str.trim();
  let prev = '';
  let count = 0;

  // 只要字符串中包含二次编码标志 %25，并且递归次数小于5次，就进行递归解码还原
  while (current !== prev && current.includes('%25') && count < 5) {
    prev = current;
    try {
      current = decodeURIComponent(current);
    } catch (e) {
      break;
    }
    count++;
  }
  return current;
}

/**
 * 💡 辅助函数：从 initData 查询字符串中安全解析 user 对象
 */
function parseUserFromInitData(initDataStr: string): any | null {
  if (!initDataStr) return null;
  try {
    let cleanStr = safeFullyDecode(initDataStr);

    if (cleanStr.startsWith('tgWebAppData=')) {
      cleanStr = cleanStr.replace('tgWebAppData=', '');
      cleanStr = safeFullyDecode(cleanStr);
    }

    const searchParams = new URLSearchParams(cleanStr);
    const userJson = searchParams.get('user');
    if (userJson) {
      return JSON.parse(userJson);
    }
  } catch (e) {
    console.warn('[useTelegram Debug] ⚠️ 解析 user JSON 失败:', e);
  }
  return null;
}

/**
 * 💡 辅助函数：针对 Hash 路由破坏 URL 的情况，使用正则强行直接剥离 tgWebAppData 字符串
 */
function extractRawTgWebAppDataFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fullHref = window.location.href;
    const match = fullHref.match(/[?&#]tgWebAppData=([^&#]+)/);
    if (match && match[1]) {
      const decoded = safeFullyDecode(match[1]);
      console.log('[useTelegram Debug] 🛠️ [URL Regex Fallback] 成功强行剥离 tgWebAppData 凭证');
      return decoded.trim();
    }
  } catch (e) {
    console.error('[useTelegram Debug] ❌ 正则强行剥离 tgWebAppData 异常:', e);
  }
  return '';
}

/**
 * 💡 辅助函数：从 URL 中直接拦截提取 tgWebAppStartParam 或 start_param 参数
 */
function extractStartParamFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fullHref = window.location.href;
    const match = fullHref.match(/[?&#](?:tgWebAppStartParam|start_param|startapp)=([^&#]+)/);
    if (match && match[1]) {
      const decoded = safeFullyDecode(match[1]);
      console.log(`[useTelegram Debug] 🛠️ [URL Regex Fallback] 强行解析出 URL 中的 startParam: [${decoded}]`);
      return decoded.trim();
    }
  } catch (e) {
    console.error('[useTelegram Debug] ❌ 正则强行剥离 startParam 异常:', e);
  }
  return '';
}

/**
 * 💡 实时解析 Telegram 启动参数与 initData 原始字符串
 */
function extractLaunchParams() {
  let freshInitData = '';
  let freshStartParam = '';
  let freshTheme: Record<string, string> = {};
  let matchedSource = '';

  // 1. 【最高优先级】直接读取 window.Telegram.WebApp.initData 及 initDataUnsafe.start_param
  if (typeof window !== 'undefined') {
    const windowInitData = (window as any).Telegram?.WebApp?.initData;
    if (typeof windowInitData === 'string' && windowInitData.trim()) {
      freshInitData = safeFullyDecode(windowInitData.trim());
      matchedSource = '1. window.Telegram.WebApp.initData (原生最权威)';
    }
    
    // 从原生 Telegram SDK 尝试读取 initDataUnsafe.start_param
    const nativeStartParam = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (nativeStartParam && typeof nativeStartParam === 'string' && nativeStartParam.trim()) {
      freshStartParam = nativeStartParam.trim();
    }
  }

  // 2. 尝试从 init.ts 注入的全局变量或 SessionStorage 提取（防御 SDK 未挂载前的打点）
  if (typeof window !== 'undefined') {
    if (!freshInitData) {
      const globalInitData = (window as any).__SP_INIT_DATA__;
      if (globalInitData && typeof globalInitData === 'string' && globalInitData.trim()) {
        freshInitData = safeFullyDecode(globalInitData.trim());
        matchedSource = '2. window.__SP_INIT_DATA__ (全局挂载)';
      }
    }
    if (!freshStartParam) {
      const globalStartParam = (window as any).__SP_START_PARAM__;
      if (globalStartParam && typeof globalStartParam === 'string' && globalStartParam.trim()) {
        freshStartParam = globalStartParam.trim();
      }
    }
  }

  // 3. 尝试从 SDK 官方提供的 retrieveLaunchParams() 获取
  if (!freshInitData || !freshStartParam) {
    try {
      const lp = retrieveLaunchParams();
      if (lp) {
        if (!freshInitData && typeof lp.initDataRaw === 'string' && lp.initDataRaw.trim()) {
          freshInitData = safeFullyDecode(lp.initDataRaw.trim());
          matchedSource = '3. retrieveLaunchParams()';
        }
        if (!freshStartParam && lp.startParam) {
          freshStartParam = String(lp.startParam).trim();
        }
        if (lp.themeParams) {
          freshTheme = lp.themeParams as Record<string, string>;
        }
      }
    } catch (e) {
      // 忽略 SDK 提取失败
    }
  }

  // 4. 尝试使用 SDK 的 parseLaunchParamsQuery 解析 location.search 和 location.hash
  if ((!freshInitData || !freshStartParam) && typeof window !== 'undefined') {
    try {
      const searchQuery = window.location.search.slice(1);
      const hashQuery = window.location.hash.slice(1);
      const combinedQuery = [searchQuery, hashQuery].filter(Boolean).join('&');

      if (combinedQuery) {
        const launchParams = parseLaunchParamsQuery(combinedQuery);
        if (!freshInitData && launchParams.initDataRaw) {
          if (typeof launchParams.initDataRaw === 'string') {
            freshInitData = safeFullyDecode(launchParams.initDataRaw.trim());
          } else if (launchParams.initDataRaw) {
            freshInitData = safeFullyDecode((launchParams.initDataRaw as any).raw || '');
          }
          matchedSource = '4. URL Query/Hash (parseLaunchParamsQuery)';
        }
        if (!freshStartParam && launchParams.startParam) {
          freshStartParam = String(launchParams.startParam).trim();
        }
        if (launchParams.themeParams && Object.keys(freshTheme).length === 0) {
          freshTheme = launchParams.themeParams as Record<string, string>;
        }
      }
    } catch (e) {
      // 忽略 URL 解析错误
    }
  }

  // 5. 【兜底强力保障】正则表达式提取 URL 中的 startParam 与 initData
  if (!freshStartParam && typeof window !== 'undefined') {
    const rawStartParam = extractStartParamFromUrl();
    if (rawStartParam) {
      freshStartParam = rawStartParam;
    }
  }

  if (!freshInitData && typeof window !== 'undefined') {
    const rawFallback = extractRawTgWebAppDataFromUrl();
    if (rawFallback) {
      freshInitData = rawFallback;
      matchedSource = '5. Direct URL Regex Fallback (正则强提取)';
    }
  }

  // 6. 【SessionStorage 兜底保障】如果依旧没有拿到，从本地缓存提取
  if (typeof window !== 'undefined') {
    if (!freshInitData) {
      try {
        const cachedInitData = sessionStorage.getItem(INIT_DATA_SESSION_KEY);
        if (cachedInitData && cachedInitData.trim()) {
          freshInitData = safeFullyDecode(cachedInitData.trim());
          matchedSource = '6. SessionStorage 缓存兜底';
        }
      } catch (e) {}
    }
    if (!freshStartParam) {
      try {
        const cachedStart = sessionStorage.getItem(START_PARAM_SESSION_KEY);
        if (cachedStart && cachedStart.trim()) {
          freshStartParam = cachedStart.trim();
        }
      } catch (e) {}
    }
  }

  // 更新 Telegram 主题配置
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.themeParams) {
    freshTheme = { ...freshTheme, ...(window as any).Telegram.WebApp.themeParams };
  }

  // 🚨 强行更新/重置全局响应式变量
  initRawData.value = freshInitData;
  startParam.value = freshStartParam; 
  theme.value = freshTheme;

  const parsedUser = parseUserFromInitData(freshInitData);
  const currentUserId = parsedUser?.id ? String(parsedUser.id) : 'UNKNOWN';

  console.log(
    `[useTelegram Debug] 🔄 状态同步完成 | startParam: "${startParam.value}" | Source: ${matchedSource || 'None'} | TG User: ${currentUserId}`
  );
}

/**
 * 💡 结构化解析 startParam
 * 能够自动将 "history_12345" 或 "history?billId=12345" 转换为标准的对象 { route: 'history', billId: '12345' }
 */
function parseStartParam(): { route: string; billId: string; raw: string } {
  const raw = startParam.value || '';
  if (!raw) {
    return { route: '', billId: '', raw: '' };
  }

  // 1. 处理格式: "history_0536d397-9e41-40b0-ad77-61238873a4d1" 或 "stats_0536d397"
  if (raw.includes('_')) {
    const parts = raw.split('_');
    const route = parts[0] || '';
    const billId = parts.slice(1).join('_'); // 支持 UUID 中可能自带的连接符或多段拼接
    return { route, billId, raw };
  }

  // 2. 处理格式: "history?billId=0536d397-9e41-40b0-ad77-61238873a4d1"
  if (raw.includes('?')) {
    const [route, queryString] = raw.split('?');
    const searchParams = new URLSearchParams(queryString);
    const billId = searchParams.get('billId') || searchParams.get('bill_id') || searchParams.get('id') || '';
    return { route: route || '', billId, raw };
  }

  // 3. 兜底情况: 当 startParam 本身就是 billId UUID 时，或者单独的路由字符时
  if (raw.length > 20) { // 类似 UUID 的长度
    return { route: 'history', billId: raw, raw };
  }

  return { route: raw, billId: '', raw };
}

/**
 * 手动重置/清空 startParam（在发起新账单或路由跳转后调用）
 */
function clearStartParam() {
  console.log(`[useTelegram Debug] 🧹 显式清除全局 startParam (旧值: "${startParam.value}")`);
  startParam.value = '';
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initDataUnsafe) {
    (window as any).Telegram.WebApp.initDataUnsafe.start_param = undefined;
  }
}

/**
 * 初始化 Telegram Mini App 上下文
 */
function initTelegramApp() {
  extractLaunchParams();
  isReady.value = true;
  console.log('[useTelegram Init] 🚀 Telegram SDK 初始化完成');
}

/**
 * 💡 供路由 Guard 和组件 await 的阻塞等待函数
 */
async function ensureReady(): Promise<void> {
  if (isReady.value && initRawData.value) return;

  if (typeof window !== 'undefined' && (window as any).__SP_INIT_READY_PROMISE__) {
    await (window as any).__SP_INIT_READY_PROMISE__;
  }

  extractLaunchParams();
  isReady.value = true;
}

export function useTelegram() {
  if (typeof window !== 'undefined') {
    extractLaunchParams();
  }

  const tgUser = computed(() => parseUserFromInitData(initRawData.value));
  const tgUserId = computed<string>(() => (tgUser.value?.id ? String(tgUser.value.id) : ''));

  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    const nativeHaptic = (window as any).Telegram?.WebApp?.HapticFeedback;
    if (nativeHaptic && typeof nativeHaptic.impactOccurred === 'function') {
      nativeHaptic.impactOccurred(type);
      return;
    }
    if (hapticFeedback && typeof hapticFeedback.impactOccurred === 'function') {
      hapticFeedback.impactOccurred(type);
    }
  };

  const triggerNotificationHaptic = (type: 'success' | 'warning' | 'error') => {
    const nativeHaptic = (window as any).Telegram?.WebApp?.HapticFeedback;
    if (nativeHaptic && typeof nativeHaptic.notificationOccurred === 'function') {
      nativeHaptic.notificationOccurred(type);
      return;
    }
    if (hapticFeedback && typeof hapticFeedback.notificationOccurred === 'function') {
      hapticFeedback.notificationOccurred(type);
    }
  };

  const closeApp = () => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.close) {
      (window as any).Telegram.WebApp.close();
    }
  };

  return {
    isReady: readonly(isReady),
    startParam: readonly(startParam),
    initRawData: readonly(initRawData),
    theme: readonly(theme),
    tgUser,
    tgUserId,
    ensureReady,
    initTelegramApp,
    recheckStartParam: extractLaunchParams,
    parseStartParam,
    clearStartParam,
    triggerHaptic,
    triggerNotificationHaptic,
    closeApp,
    initPromise
  };
}
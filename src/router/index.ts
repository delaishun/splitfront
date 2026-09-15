// splitapp/src/router/index.ts

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { retrieveLaunchParams } from '@tma.js/sdk-vue';
import { useTelegram } from '../composables/useTelegram';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../pages/IndexPage.vue')
  },
  {
    path: '/split/:billId',
    name: 'BillDetails',
    component: () => import('../pages/IndexPage.vue'),
    props: true
  },
  {
    // 支持传入指定账单 billId 的统计页面，或展示全局历史
    path: '/history/:billId?',
    name: 'History',
    component: () => import('../pages/HistoryPage.vue'),
    props: true
  },
  {
    path: '/terms',
    name: 'Terms',
    component: () => import('../pages/TermsPage.vue'),
  },
  {
    path: '/bind',
    name: 'bind',
    component: () => import('../pages/BindPage.vue')
  },
  {
    path: '/privacy',
    name: 'Privacy',
    component: () => import('../pages/PrivacyPage.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// 防止在同一 session 里因为 start_param 残留导致无限死循环重定向
let handledStartParam: string | null = null;

/**
 * 💡 辅助工具：多重 URL 安全解码，强行还原 %2520 / %253D 等二次编码
 */
function safeFullyDecode(str: string): string {
  if (!str) return '';
  let current = str.trim();
  let prev = '';
  let count = 0;
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
 * 💡 关键阻塞机制：等待全局 TMA 初始化完全结束
 * 解决 SDK 未完成异步加载时 Telegram.WebApp.initDataUnsafe.user 为空的死锁问题
 */
async function waitForInitReady(timeoutMs: number = 2000): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. 优先检查全局挂载的初始化 Promise
  const initPromise = (window as any).__SP_INIT_READY_PROMISE__;
  if (initPromise && typeof initPromise.then === 'function') {
    try {
      const timer = new Promise((resolve) => setTimeout(resolve, timeoutMs));
      await Promise.race([initPromise, timer]);
    } catch (e) {
      console.warn('[Router Guard InitGuard] ⚠️ 等待全局初始化 Promise 产生异常:', e);
    }
  }

  // 2. 轮询确认 initData 与 user 对象是否已注入 Telegram.WebApp 或全局快照
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const tgWebApp = (window as any).Telegram?.WebApp;
    const hasUser = tgWebApp?.initDataUnsafe?.user?.id;
    const hasData =
      (window as any).__SP_INIT_DATA__ ||
      tgWebApp?.initData ||
      window.location.href.includes('tgWebAppData');

    if (hasUser || hasData) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * 💡 从 initData 强行解析 Telegram 用户对象
 */
function parseUserFromInitData(initDataStr: string): any | null {
  if (!initDataStr) return null;
  try {
    const decodedStr = safeFullyDecode(initDataStr);
    const searchParams = new URLSearchParams(decodedStr);
    const userJson = searchParams.get('user');
    if (userJson) {
      return JSON.parse(userJson);
    }
  } catch (e) {
    // 忽略解析错误
  }
  return null;
}

/**
 * 💡 多源抽取并彻底解码 raw tgWebAppData 凭证
 */
function extractRawTgWebAppData(): string {
  if (typeof window === 'undefined') return '';
  try {
    // 1. 全局快照
    const globalData = (window as any).__SP_INIT_DATA__;
    if (globalData) return safeFullyDecode(globalData);

    // 2. Telegram WebApp 原生 SDK 实例
    const sdkInitData = (window as any).Telegram?.WebApp?.initData;
    if (sdkInitData) return safeFullyDecode(sdkInitData);

    // 3. 全局 URL 匹配
    const href = safeFullyDecode(window.location.href);
    const match = href.match(/(?:#|\?|&)tgWebAppData=([^&]+)/);
    if (match && match[1]) {
      return safeFullyDecode(match[1]);
    }

    // 4. URLSearchParams 提取
    const searchParams = new URLSearchParams(safeFullyDecode(window.location.search));
    const tgWebAppData = searchParams.get('tgWebAppData');
    if (tgWebAppData) return safeFullyDecode(tgWebAppData);
  } catch (err) {
    console.error('[Router Guard Debug] ❌ 强行剥离 tgWebAppData 异常:', err);
  }
  return '';
}

/**
 * 💡 解析启动参数 startParam
 */
function extractStartParamFromUrl(): string | undefined {
  try {
    const decodedSearch = safeFullyDecode(window.location.search);
    const searchParams = new URLSearchParams(decodedSearch);
    let param = searchParams.get('tgWebAppStartParam') || searchParams.get('startapp');
    if (param) return param;

    const hashUrl = safeFullyDecode(window.location.hash);
    const queryIndex = hashUrl.indexOf('?');
    if (queryIndex !== -1) {
      const hashSearchParams = new URLSearchParams(hashUrl.substring(queryIndex));
      param = hashSearchParams.get('tgWebAppStartParam') || hashSearchParams.get('startapp');
      if (param) return param;
    }

    const rawInitData = extractRawTgWebAppData();
    if (rawInitData) {
      const initParams = new URLSearchParams(rawInitData);
      const startParamInInit = initParams.get('start_param');
      if (startParamInInit) return startParamInInit;
    }
  } catch (err) {
    console.error('[Router Guard Debug] 原生 URLSearchParams 解析失败:', err);
  }
  return undefined;
}

// 全局路由前置守卫
router.beforeEach(async (to, from) => {
  const { clearStartParam } = useTelegram();

  const guardStartTime = Date.now();
  // 🛡️ 核心修复时序门禁：阻塞等待 TMA 初始化完成，防止身份获取失败
  await waitForInitReady(2000);
  const initWaitDuration = Date.now() - guardStartTime;

  let currentUserId = 'UNKNOWN';
  
  // 优先从 Native Telegram SDK 提取 id
  const nativeUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  if (nativeUser?.id) {
    currentUserId = String(nativeUser.id);
  } else {
    // 降级从 rawInitData 解析
    const rawInitData = extractRawTgWebAppData();
    const userObj = parseUserFromInitData(rawInitData);
    if (userObj?.id) {
      currentUserId = String(userObj.id);
    }
  }

  console.log(
    `%c[Router Guard Debug] 🧭 路由变动: "${from.fullPath}" -> "${to.fullPath}" | TG ID: [${currentUserId}] (Init 等待: ${initWaitDuration}ms)`,
    'background: #333; color: #646cff; font-weight: bold; padding: 2px 6px; border-radius: 4px;'
  );

  // 当用户显式从详情页或历史页切回到首页时，主动清空缓存的 billId / startParam，防止新账单创建污染
  if ((from.name === 'BillDetails' || from.name === 'History') && to.name === 'Home') {
    console.log('[Router Guard Debug] 🔄 检测到从详情/历史页返回首页，主动清空历史 startParam 状态');
    clearStartParam();
    handledStartParam = null;
    localStorage.removeItem('active_bill_id'); // 擦除本地主账单缓存
  }

  // 仅在根路径 '/' 启动拦截与分发
  if (to.path === '/' || to.path === '') {
    let startParam: string | undefined = undefined;
    let source = '';

    try {
      const launchParams = retrieveLaunchParams();
      if (typeof launchParams.startParam === 'string' && launchParams.startParam.trim() !== '') {
        startParam = launchParams.startParam.trim();
        source = '@tma.js/sdk-vue';
      }
    } catch (e: any) {
      // SDK 解析失败降级
    }

    if (!startParam) {
      const fallbackParam = extractStartParamFromUrl();
      if (fallbackParam) {
        startParam = fallbackParam.trim();
        source = 'URLSearchParams Fallback';
      }
    }

    if (startParam) {
      // 避免同一 startParam 陷入无限重定向
      if (handledStartParam === startParam && (to.name === 'BillDetails' || to.name === 'History' || to.name === 'bind')) {
        console.log(`[Router Guard Debug] 🛑 startParam="${startParam}" 已被消费且已被路由处理，阻断死循环`);
        return true;
      }

      console.log(`[Router Guard Debug] 🎯 捕获启动参数 startParam="${startParam}" (来源: ${source})`);

      const lowerParam = startParam.toLowerCase();

      // 1. 处理绑定钱包页面
      if (lowerParam === 'bind') {
        handledStartParam = startParam;
        if (to.name !== 'bind') {
          return { name: 'bind' };
        }
        return true;
      }

      // 2. 处理跳转至单笔账单的支付统计页 (支持 stats_BILLID 或 history_BILLID 格式，或者纯 history)
      if (lowerParam.startsWith('stats') || lowerParam.startsWith('history')) {
        handledStartParam = startParam;

        // 精准提取指定账单 billId（支持下划线分隔，如 stats_4cef36c9-... 或 history_4cef36c9-...）
        let targetBillId = '';
        const underscoreIndex = startParam.indexOf('_');
        if (underscoreIndex !== -1) {
          targetBillId = startParam.slice(underscoreIndex + 1).trim();
        } else {
          // 若没有带下划线，尝试取 localStorage 缓存的当前账单 ID
          targetBillId = localStorage.getItem('active_bill_id') || '';
        }

        if (to.name !== 'History' || String(to.params.billId || '') !== targetBillId) {
          console.log(`[Router Guard Debug] 🔄 重定向至账单支付统计页: /history/${targetBillId}`);
          return {
            name: 'History',
            params: targetBillId ? { billId: targetBillId } : {},
            query: targetBillId ? { billId: targetBillId } : {}
          };
        }
        return true;
      }

      // 3. 携带账单 ID，重定向至账单支付详情页 (纯 UUID 格式)
      if (to.name !== 'BillDetails' || String(to.params.billId || '') !== startParam) {
        handledStartParam = startParam;
        const targetPath = `/split/${startParam}`;
        console.log(`[Router Guard Debug] 🔄 重定向至账单详情(支付页): ${targetPath}`);

        return {
          name: 'BillDetails',
          params: { billId: String(startParam) }
        };
      }
    }
  }

  return true;
});

export default router;
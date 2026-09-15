// splitapp/src/init.ts

import {
  setDebug,
  themeParams,
  initData,
  viewport,
  init as initSDK,
  mockTelegramEnv,
  retrieveLaunchParams,
  emitEvent,
  miniApp,
  backButton,
} from '@tma.js/sdk-vue';

// 💡 会话级别缓存 Key，仅在当前 App 会话生命周期内保存最新原始 initData 与 startParam
const INIT_DATA_SESSION_KEY = 'sp_tg_init_data_cache';
const START_PARAM_SESSION_KEY = 'sp_tg_start_param_cache';

// 💡 全局初始化 Promise 锁，确保路由守卫和组件可以 await 等待 SDK 初始化完成
let resolveInitReady: () => void;
let initPromise: Promise<void> | null = null;

if (typeof window !== 'undefined') {
  // 如果 window 上尚未挂载 Promise，则初始化全局单例
  if (!(window as any).__SP_INIT_READY_PROMISE__) {
    (window as any).__SP_INIT_READY_PROMISE__ = new Promise<void>((resolve) => {
      resolveInitReady = resolve;
    });
  }
}

/**
 * 💡 导出的等待初始化完成函数，供路由守卫/IndexPage.vue 显式 await
 */
export async function ensureInitialized(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).__SP_INIT_READY_PROMISE__) {
    await (window as any).__SP_INIT_READY_PROMISE__;
  }
}

/**
 * 💡 辅助函数：安全清洗 initData 字符串，防止二次/多重 URL 编码（如 %2520 -> %20）破坏 HMAC 签名
 */
function sanitizeRawInitData(rawStr: string): string {
  if (!rawStr) return '';
  let cleaned = rawStr.trim();

  // 如果检测到二次编码的标志 %25，进行一次解码还原为单层 Raw 串
  if (cleaned.includes('%25')) {
    try {
      cleaned = decodeURIComponent(cleaned);
      console.log('[Init Auth Check] 🔄 检测到 initData 存在多重编码，已成功还原为原始单层 Raw 串');
    } catch (e) {
      console.warn('[Init Auth Check] ⚠️ 尝试对多重编码 initData 进行 decodeURIComponent 失败:', e);
    }
  }

  return cleaned;
}

/**
 * 💡 辅助函数：从原始 initData 查询字符串中安全解析 user 对象（仅用于控制台日志展示，绝不篡改原始字符串）
 */
function parseUserFromInitData(initDataStr: string): any | null {
  if (!initDataStr) return null;
  try {
    const searchParams = new URLSearchParams(initDataStr);
    const userJson = searchParams.get('user');
    if (userJson) {
      return JSON.parse(userJson);
    }
  } catch (e) {
    // 若原串未解码，尝试做一次标准 URLDecode 辅助解析 JSON
    try {
      const searchParams = new URLSearchParams(decodeURIComponent(initDataStr));
      const userJson = searchParams.get('user');
      if (userJson) return JSON.parse(userJson);
    } catch (err) { }
  }
  return null;
}

/**
 * 💡 辅助函数：多源提取 Telegram 启动参数 startParam 并缓存
 */
function captureAndPersistStartParam(): string {
  let startParam = '';

  if (typeof window !== 'undefined') {
    // 1. 原生 Telegram WebApp 提取
    const nativeStartParam = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (nativeStartParam && typeof nativeStartParam === 'string' && nativeStartParam.trim()) {
      startParam = nativeStartParam.trim();
    }

    // 2. retrieveLaunchParams 提取
    if (!startParam) {
      try {
        const launchParams = retrieveLaunchParams();
        if (launchParams.startParam) {
          startParam = String(launchParams.startParam).trim();
        }
      } catch (e) { }
    }

    // 3. URL 正则匹配提取
    if (!startParam) {
      try {
        const match = window.location.href.match(/[?&#](?:tgWebAppStartParam|start_param|startapp)=([^&#]+)/);
        if (match && match[1]) {
          startParam = decodeURIComponent(match[1]).trim();
        }
      } catch (e) { }
    }

    // 4. 持久化缓存
    if (startParam) {
      try {
        sessionStorage.setItem(START_PARAM_SESSION_KEY, startParam);
        (window as any).__SP_START_PARAM__ = startParam;
        console.log(`[Init Check] 🎯 捕获并缓存 startParam: "${startParam}"`);
      } catch (e) { }
    } else {
      try {
        const cached = sessionStorage.getItem(START_PARAM_SESSION_KEY);
        if (cached && cached.trim()) {
          startParam = cached.trim();
          (window as any).__SP_START_PARAM__ = startParam;
        }
      } catch (e) { }
    }
  }

  return startParam;
}

/**
 * 💡 辅助函数：多源提取 Telegram 初始化凭证，并完成 Session 缓存注入
 * ⚠️ 注意：此处严格保持原始传输形态（Raw），排除多重编码破坏 HMAC 签名
 */
function captureAndPersistInitData(): string {
  let rawInitData = '';

  if (typeof window !== 'undefined') {
    // 1. 从 Telegram 客户端原生 WebApp 提取 (权威原始 Raw 串)
    const nativeInitData = (window as any).Telegram?.WebApp?.initData;
    if (nativeInitData && typeof nativeInitData === 'string' && nativeInitData.trim()) {
      rawInitData = sanitizeRawInitData(nativeInitData);
      console.log('[Init Auth Check] 🟢 来源 1: Telegram.WebApp.initData 捕获成功');
    }

    // 2. 从 SDK retrieveLaunchParams 提取 Raw 串
    if (!rawInitData) {
      try {
        const launchParams = retrieveLaunchParams();
        if (launchParams.initDataRaw) {
          const rawStr = typeof launchParams.initDataRaw === 'string'
            ? launchParams.initDataRaw
            : String(launchParams.initDataRaw);

          if (rawStr && rawStr.trim() && rawStr !== '[object Object]') {
            rawInitData = sanitizeRawInitData(rawStr);
            console.log('[Init Auth Check] 🟢 来源 2: retrieveLaunchParams().initDataRaw 捕获成功');
          }
        }
      } catch (e) { }
    }

    // 3. 从 URL Query (?tgWebAppData=...) 解析原始凭证
    if (!rawInitData) {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const searchData = searchParams.get('tgWebAppData');
        if (searchData && searchData.trim()) {
          rawInitData = sanitizeRawInitData(searchData);
          console.log('[Init Auth Check] 🟢 来源 3: URL Search Query 捕获成功');
        }
      } catch (e) {
        console.warn('[Init Auth Check] ⚠️ 来源 3 URL Search 解析异常:', e);
      }
    }

    // 4. 从 URL Hash (#tgWebAppData=...) 解析 (Vue Router Hash 模式常用)
    if (!rawInitData) {
      try {
        const rawHash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(rawHash);
        const hashData = hashParams.get('tgWebAppData');
        if (hashData && hashData.trim()) {
          rawInitData = sanitizeRawInitData(hashData);
          console.log('[Init Auth Check] 🟢 来源 4: URL Hash Parameter 捕获成功');
        }
      } catch (e) {
        console.warn('[Init Auth Check] ⚠️ 来源 4 URL Hash 解析异常:', e);
      }
    }

    // 5. 从正则直接匹配当前 URL 原始串 (降级方案，应对畸形 URL)
    if (!rawInitData) {
      try {
        const currentUrl = window.location.href;
        const match = currentUrl.match(/tgWebAppData=([^&|#]+)/);
        if (match && match[1]) {
          rawInitData = sanitizeRawInitData(match[1]);
          console.log('[Init Auth Check] 🟢 来源 5: URL 正则解构强提取 捕获成功');
        }
      } catch (e) {
        console.warn('[Init Auth Check] ⚠️ 来源 5 正则提取异常:', e);
      }
    }

    // 6. 成功提取后刷新 SessionStorage 缓存；若均无则提取上次 Session 缓存兜底
    if (rawInitData) {
      try {
        sessionStorage.setItem(INIT_DATA_SESSION_KEY, rawInitData);
        // 挂载全局对象供 Api 拦截器与 Vue 组件随时访问
        (window as any).__SP_INIT_DATA__ = rawInitData;
        console.log('[Init Auth Check] 💾 原始 initData 已成功挂载至 window.__SP_INIT_DATA__ 与 SessionStorage');
      } catch (e) { }
    } else {
      try {
        const cached = sessionStorage.getItem(INIT_DATA_SESSION_KEY);
        if (cached && cached.trim()) {
          rawInitData = sanitizeRawInitData(cached);
          (window as any).__SP_INIT_DATA__ = rawInitData;
          console.log('[Init Auth Check] 🟡 来源 6: SessionStorage 缓存恢复成功');
        }
      } catch (e) { }
    }
  }

  return rawInitData;
}

/**
 * Initializes the application and configures its dependencies.
 */
export async function init(options: {
  debug: boolean;
  eruda: boolean;
  mockForMacOS: boolean;
}): Promise<void> {
  // 单例防御：如果已经开始初始化，直接返回现有 Promise
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      console.log('[Init Debug] 开始执行 TMA SDK 初始化...');

      // 1. 设置调试模式
      setDebug(options.debug);

      // 2. 提前捕获并安全持久化原始 Raw initData 与 startParam，防止路由跳转后凭证与参数丢失
      const capturedInitData = captureAndPersistInitData();
      const capturedStartParam = captureAndPersistStartParam();

      // 3. 💡 mockTelegramEnv (如果在 macOS 且开启了 mockForMacOS 才触发)
      if (options.mockForMacOS) {
        console.log('[Init Debug] 开启 macOS Mock 环境支持');
        let firstThemeSent = false;
        mockTelegramEnv({
          onEvent(event, next) {
            if (event.name === 'web_app_request_theme') {
              let tp: any = {};
              if (firstThemeSent) {
                tp = themeParams.state();
              } else {
                firstThemeSent = true;
                try {
                  tp = retrieveLaunchParams().tgWebAppThemeParams;
                } catch (e) {
                  tp = {};
                }
              }
              return emitEvent('theme_changed', { theme_params: tp });
            }

            if (event.name === 'web_app_request_safe_area') {
              return emitEvent('safe_area_changed', { left: 0, top: 0, right: 0, bottom: 0 });
            }

            next();
          },
        });
      }

      // 4. 正式初始化 SDK
      initSDK();
      console.log('[Init Debug] initSDK() 调用完成');

      // 原生 WebApp 桥接 Ready 调用
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
        try {
          (window as any).Telegram.WebApp.ready();
          (window as any).Telegram.WebApp.expand();
          console.log('[Init Debug] 原生 Telegram.WebApp.ready() & expand() 已唤起');
        } catch (e) {
          console.warn('[Init Debug] 原生 Telegram.WebAppReady 触发异常:', e);
        }
      }

      // 5. 恢复 SDK 内置 initData 响应式状态
      try {
        if (typeof initData?.restore === 'function') {
          initData.restore();
          console.log('[Init Debug] initData.restore() 执行成功');
        }
      } catch (e) {
        console.warn('[Init Debug] initData.restore() 触发警告/不可用:', e);
      }

      // 6. 加载 Eruda 调试面板（如果开启）
      if (options.eruda) {
        console.log('[Init Debug] 正在加载 Eruda 控制台...');
        import('eruda').then(({ default: eruda }) => {
          eruda.init();
          eruda.position({ x: window.innerWidth - 50, y: 0 });
        });
      }

      // 7. 挂载返回按钮 (BackButton)
      if (backButton.mount.isAvailable()) {
        try {
          backButton.mount();
          console.log('[Init Debug] BackButton 已成功挂载');
        } catch (e) {
          console.warn('[Init Debug] BackButton mount warning:', e);
        }
      }

      // 8. 挂载 MiniApp 与主题变量绑定
      if (miniApp.mount.isAvailable()) {
        try {
          if (themeParams.mount.isAvailable()) {
            themeParams.mount();
            themeParams.bindCssVars();
          }
          miniApp.mount();
          console.log('[Init Debug] MiniApp 及 ThemeParams 已挂载');
        } catch (e) {
          console.warn('[Init Debug] MiniApp mount warning:', e);
        }
      }

      // 9. 挂载 Viewport 并自动全屏展开
      if (viewport.mount.isAvailable()) {
        try {
          await viewport.mount();
          viewport.bindCssVars();

          // 将 Mini App 展开至全屏，保障钱包连接与支付体验
          if (viewport.expand.isAvailable()) {
            viewport.expand();
          }
          console.log('[Init Debug] Viewport 已挂载并完成全屏展开');
        } catch (e) {
          console.error('[Init Debug] Viewport mount failed:', e);
        }
      }

      // 10. 打印最终提取到的权威 LaunchParams 与当前 User ID
      try {
        const launchParams = retrieveLaunchParams();
        const finalRawData =
          capturedInitData ||
          (window as any).__SP_INIT_DATA__ ||
          launchParams.initDataRaw ||
          (window as any).Telegram?.WebApp?.initData ||
          '';

        const parsedUser = parseUserFromInitData(finalRawData);

        if (finalRawData) {
          console.log(
            `%c[Init Debug] 🟢 SDK 初始化校验成功 | TG User ID: ${parsedUser?.id || '未知'} | initData 长度: ${finalRawData.length} | startParam: "${capturedStartParam}"`,
            'background: #111; color: #00ff66; font-weight: bold; font-size: 13px; padding: 4px;'
          );
        } else {
          console.log(
            `%c[Init Debug] 🔴 警告: 未能提取到任何有效 initData，后续后端请求可能会被阻断！`,
            'background: #330000; color: #ff3333; font-weight: bold; font-size: 13px; padding: 4px;'
          );
        }

        console.log('[Init Debug] 最终检索出的 LaunchParams:', {
          startParam: launchParams.startParam || capturedStartParam,
          platform: launchParams.platform,
          version: launchParams.version,
          hasInitData: !!finalRawData,
          initDataLength: finalRawData.length,
        });
      } catch (e) {
        console.warn('[Init Debug] retrieveLaunchParams 无法获取启动参数:', e);
      }
    } finally {
      // 💡 确保无论成功还是异常，都解开全局初始化 Promise 锁，通知 router/index.ts 与组件可以安全获取 user 数据
      if (typeof resolveInitReady === 'function') {
        resolveInitReady();
      }
    }
  })();

  return initPromise;
}
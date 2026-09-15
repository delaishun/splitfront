<!-- src/pages/BindPage.vue -->
<template>
  <div class="bind-container">
    <div class="bind-card">
      <div class="icon-section">
        <span class="icon">🔗</span>
      </div>

      <h2>Bind TON Receiving Wallet</h2>
      <p class="desc">
        Connect your TON wallet to complete identity binding. Once bound, the Bot will automatically settle your share and bill payments to your account.
      </p>

      <!-- Loading state -->
      <div v-if="loading" class="status-text">
        Loading...
      </div>

      <!-- Bound state (confirmed by backend) -->
      <div v-else-if="isBoundFromBackend" class="action-block">
        <div class="address-box">
          <span class="label">Bound Address:</span>
          <span class="address">{{ formatAddress(boundWalletAddress) }}</span>
        </div>
        <button class="btn btn-disabled" disabled>
          ✅ Wallet Bound
        </button>
        <p class="hint-text">To change your wallet, please contact the administrator to unbind first.</p>
      </div>

      <!-- Unbound state -->
      <div v-else>
        <!-- Wallet not connected -->
        <div v-if="!isConnected" class="action-block">
          <button @click="triggerWalletConnect" class="btn btn-primary">
            Connect TON Wallet
          </button>
        </div>

        <!-- Wallet connected but not yet bound to backend -->
        <div v-else class="status-block">
          <div class="address-box">
            <span class="label">Connected Wallet:</span>
            <span class="address">{{ formatAddress(normalizedWalletAddress) }}</span>
          </div>

          <button
            @click="handleBindManual"
            :disabled="binding || isBinding || isSuccess"
            class="btn btn-success"
          >
            {{ (binding || isBinding) ? "Syncing binding..." : (isSuccess ? "✅ Bound Successfully" : "Confirm Binding This Address") }}
          </button>
        </div>
      </div>

      <div v-if="errorMsg" class="error-text">
        ❌ {{ errorMsg }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useTelegram } from '../composables/useTelegram';
import { useTonConnect } from '../composables/useTonConnect';
import { api, getTelegramInitData, getBindStatus } from '../services/api';
import { blurAddress, toUserFriendlyAddress, toRawAddress } from '../helperts/address';

const { triggerHaptic, triggerNotificationHaptic } = useTelegram();
const { isConnected, isBinding, isBound, walletAddress, initTonConnect, syncWalletAddressToBackend } = useTonConnect();

const binding = ref(false);
const isSuccess = ref(false);
const errorMsg = ref('');
const loading = ref(true);
const isBoundFromBackend = ref(false);
const boundWalletAddress = ref<string | null>(null);

/**
 * 💡 计算属性：对当前的 walletAddress 强行做一次 Non-bounceable UQ... 标准化转化
 */
const normalizedWalletAddress = computed(() => {
  if (!walletAddress.value) return '';
  return toUserFriendlyAddress(walletAddress.value, 'BindPage-Computed') || walletAddress.value;
});

/**
 * 💡 计算属性：提取 Raw 格式地址 (如 0:...)
 */
const rawWalletAddress = computed(() => {
  if (!walletAddress.value) return '';
  return toRawAddress(walletAddress.value) || '';
});

/**
 * 格式化地址用于展示（支持 null）
 */
const formatAddress = (addr: string | null): string => {
  if (!addr) return '';
  return blurAddress(addr, 6);
};

/**
 * 查询后端绑定状态
 */
const fetchBindStatus = async () => {
  try {
    const status = await getBindStatus();
    isBoundFromBackend.value = status.isBound || false;
    boundWalletAddress.value = status.walletAddress || null;
  } catch (err) {
    console.error('[BindPage] 获取绑定状态失败:', err);
    // 默认视为未绑定，允许用户操作
    isBoundFromBackend.value = false;
    boundWalletAddress.value = null;
  } finally {
    loading.value = false;
  }
};

const triggerWalletConnect = () => {
  console.log('[BindPage Debug] 👆 用户点击【连接 TON 钱包】按钮');
  if (typeof triggerHaptic === 'function') triggerHaptic('light');
  initTonConnect();

  const shadowRoot = document.getElementById('ton-connect-button-root')?.shadowRoot ||
                     document.querySelector('#tc-widget-root')?.shadowRoot ||
                     document.querySelector('tc-root')?.shadowRoot;
  const realBtn = shadowRoot?.querySelector('button');
  if (realBtn) {
    console.log('[BindPage Debug] 🎯 找到内部 TonConnect 影子 DOM 按钮，模拟触发点击');
    (realBtn as HTMLElement).click();
  } else {
    console.warn('[BindPage Debug] ⚠️ 未找到 TonConnect 影子 DOM 按钮，尝试主页面全量查找 fallback');
    const fallbackBtn = document.querySelector('button[class*="ton-connect"]') as HTMLElement;
    if (fallbackBtn) fallbackBtn.click();
  }
};

/**
 * 手动点击触发绑定的包装函数
 */
const handleBindManual = () => {
  console.log('[BindPage Debug] 👆 用户手动点击【确认绑定此地址】按钮');
  handleBind();
};

const handleBind = async () => {
  const targetAddress = normalizedWalletAddress.value;
  const targetRawAddress = rawWalletAddress.value;

  if (!targetAddress) {
    console.warn('[BindPage Debug] ⚠️ 尝试绑定，但 walletAddress 为空');
    errorMsg.value = 'No connected wallet address detected';
    return;
  }

  if (binding.value || isBinding.value) {
    console.log('[BindPage Debug] ⏳ 绑定流程正在运行，拦截重复点击');
    return;
  }

  console.log('[BindPage Debug] 🚀 开始提交绑定流程', {
    rawInputAddress: walletAddress.value,
    normalizedAddress: targetAddress,
    rawAddress: targetRawAddress,
  });

  binding.value = true;
  errorMsg.value = '';
  if (typeof triggerHaptic === 'function') triggerHaptic('medium');

  try {
    const bindSuccess = await syncWalletAddressToBackend(targetAddress, targetRawAddress);

    if (bindSuccess || isBound.value) {
      console.log('[BindPage Debug] 🎉 钱包同步与绑定成功！准备刷新用户状态');

      // 刷新绑定状态
      await fetchBindStatus();

      isSuccess.value = true;
      if (typeof triggerNotificationHaptic === 'function') triggerNotificationHaptic('success');

      setTimeout(() => {
        const tgWebApp = (window as any).Telegram?.WebApp;
        if (tgWebApp && typeof tgWebApp.close === 'function') {
          console.log('[BindPage Debug] 🚪 绑定流程完成，自动关闭 WebApp');
          tgWebApp.close();
        }
      }, 1500);
    } else {
      const errMsg = 'Binding failed. Please try again later.';
      console.error('[BindPage Debug] ❌ 绑定失败');
      errorMsg.value = errMsg;
      if (typeof triggerNotificationHaptic === 'function') triggerNotificationHaptic('error');
    }
  } catch (err: any) {
    console.error('[BindPage Debug] ❌ 绑定钱包捕获到运行时异常:', err);
    errorMsg.value = err?.response?.data?.message || err?.message || 'Network error. Please try again later.';
    if (typeof triggerNotificationHaptic === 'function') triggerNotificationHaptic('error');
  } finally {
    binding.value = false;
  }
};

// 监听钱包连接成功事件：首次连接成功后触发一次自动绑定
watch(
  [() => isConnected.value, () => walletAddress.value],
  async ([connected, addr], [oldConnected]) => {
    console.log(`[BindPage Debug] 🔄 钱包连接状态监听 -> isConnected: ${connected}, normalizedAddress: ${normalizedWalletAddress.value}`);

    // 只有当状态从 false 变为 true 且尚未绑定时才自动触发，防止挂载时二次调用
    if (!oldConnected && connected && addr && !isSuccess.value && !binding.value && !isBound.value && !isBoundFromBackend.value) {
      console.log('[BindPage Debug] ⚡ 检测到钱包建立新连接，自动触发一次同步绑定');
      await handleBind();
    }
  }
);

onMounted(async () => {
  console.log('[BindPage Debug] 🚀 BindPage 挂载完成');
  const tgWebApp = (window as any).Telegram?.WebApp;
  if (tgWebApp) {
    tgWebApp.ready();
    tgWebApp.expand();
  }

  // 加载绑定状态
  await fetchBindStatus();

  // 如果已绑定，并且钱包已连接但地址不一致，可考虑提示，但暂不处理
});
</script>

<style scoped>
.bind-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--tg-theme-text-color, #222222);
  background: var(--tg-theme-bg-color, #ffffff);
  min-height: 100vh;
  box-sizing: border-box;
}
.bind-card {
  width: 100%;
  max-width: 360px;
  background: var(--tg-theme-secondary-bg-color, #f4f4f7);
  border-radius: 24px;
  padding: 32px 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  text-align: center;
  box-sizing: border-box;
}
.icon-section {
  font-size: 48px;
  margin-bottom: 12px;
}
h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 700;
}
.desc {
  font-size: 14px;
  color: var(--tg-theme-hint-color, #8e8e93);
  line-height: 1.5;
  margin-bottom: 24px;
}
.address-box {
  background: var(--tg-theme-bg-color, #ffffff);
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.address {
  font-family: monospace;
  font-weight: bold;
  color: var(--tg-theme-link-color, #248bcf);
}
.btn {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  border: none;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-primary {
  background: var(--tg-theme-button-color, #248bcf);
  color: var(--tg-theme-button-text-color, #ffffff);
}
.btn-success {
  background: #18a058;
  color: #ffffff;
}
.btn-disabled {
  background: #e0e0e6;
  color: #a1a1a9;
  cursor: not-allowed;
  box-shadow: none;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error-text {
  margin-top: 16px;
  color: #e63946;
  font-size: 13px;
  word-break: break-all;
}
.status-text {
  color: var(--tg-theme-hint-color, #8e8e93);
  font-size: 14px;
  padding: 12px 0;
}
.hint-text {
  font-size: 12px;
  color: var(--tg-theme-hint-color, #8e8e93);
  margin-top: 8px;
}
</style>
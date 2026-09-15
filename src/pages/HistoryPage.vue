<!-- splitapp/src/pages/HistoryPage.vue -->
<template>
  <div class="history-page">
    <!-- Loading state -->
    <div v-if="loading" class="loading-box">
      <div class="spinner"></div>
      <p>Loading bill statistics...</p>
    </div>

    <!-- Error message -->
    <div v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <button @click="fetchBillStats()" class="retry-btn">Retry</button>
    </div>

    <!-- No bill ID or bill not found -->
    <div v-else-if="!billDetail" class="empty-box">
      <div class="empty-icon">📂</div>
      <p>No bill statistics found</p>
      <button @click="goHome" class="home-btn">Back to Home</button>
    </div>

    <div v-else class="stats-container">
      <!-- 1. Top bill overview card -->
      <div class="overview-card">
        <div class="card-header">
          <div class="bill-title">{{ getBillTitle() }}</div>
          <span :class="['status-badge', `status-${displayStatus.toLowerCase()}`]">
            {{ formatStatus(displayStatus) }}
          </span>
        </div>

        <div v-if="billDetail.comment" class="bill-comment">
          Memo: #{{ billDetail.comment }}
        </div>

        <div class="bill-time">
          Created: {{ formatDate(billDetail.createdAt || billDetail.created_at) }}
        </div>

        <!-- Progress bar: only show collected amount -->
        <div class="progress-section">
          <div class="progress-labels">
            <span>Collected</span>
            <span class="progress-num">
              <strong>{{ formatAmount(collectedAmount) }} TON</strong>
            </span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }"></div>
          </div>
        </div>

        <!-- Summary: only show paid members count, centered -->
        <div class="stats-grid single">
          <div class="grid-item centered">
            <span class="grid-label">Paid Members</span>
            <span class="grid-value">{{ paidMembersCount }}</span>
          </div>
        </div>
      </div>

      <!-- 2. Payment details list -->
      <div class="payments-section">
        <div class="section-title">
          <span>Payment Details</span>
          <span class="count-tag">{{ payments.length }} transactions</span>
        </div>

        <div v-if="payments.length === 0" class="empty-payments">
          <p>⏳ No payments yet</p>
        </div>

        <div v-else class="payment-list">
          <div v-for="(item, index) in payments" :key="item.txHash || item.id || index" class="payment-item">
            <div class="payment-main">
              <!-- Payer identity: prefer Telegram username, fallback to shortened wallet address -->
              <div class="payer-name">
                {{ getPayerDisplayName(item) }}
              </div>
              <div class="payment-time">
                {{ formatDate(item.paidAt || item.paid_at || item.createdAt || item.created_at || item.updated_at) }}
              </div>
              <!-- On-chain hash quick link -->
              <div
                v-if="getTxHash(item)"
                class="tx-hash-link"
                @click.stop="openExplorer(getTxHash(item))"
              >
                🔗 Tx Proof {{ shortenHash(getTxHash(item)) }}
              </div>
            </div>

            <div class="payment-side">
              <!-- Prefer amountReceived field -->
              <div class="pay-amount">+ {{ formatAmount(item.amountReceived || item.amount || item.amount_paid || item.amountPaid || billDetail.amount) }} TON</div>
              <span class="pay-status">Paid</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../services/api';
import { useTelegram } from '../composables/useTelegram';
import { useBackButton } from '../composables/useBackButton';

const route = useRoute();
const router = useRouter();
const { initRawData, triggerHaptic } = useTelegram();

// 注册 Telegram 原生 Header 左上角返回按键，点击后直接返回首页
useBackButton();

const loading = ref(false);
const error = ref<string | null>(null);

// 核心数据模型
const currentBillId = ref<string>('');
const billDetail = ref<any>(null);
const summary = ref<any>(null);   // ✅ 后端返回的汇总统计数据
const payments = ref<any[]>([]);

// 轮询定时器引用
let pollTimer: ReturnType<typeof setInterval> | null = null;

// 格式化基础金额值（转换为以 TON 为单位的数字）
const parseTonNumber = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 0;
  return num > 10000000 ? num / 1_000_000_000 : num;
};

/**
 * 总金额计算
 * ✅ 优先使用后端返回的 summary.totalAmount（由后端正确计算出 单人金额 × 已付人数）
 * 若 summary 不存在，则降级使用单人金额 × paidParticipants / 成员列表 / 单人金额。
 * 注意：当前 UI 已不再展示总金额，但保留此计算属性供进度百分比使用。
 */
const totalAmount = computed(() => {
  // 1. 优先：后端 summary.totalAmount
  if (summary.value && summary.value.totalAmount !== undefined && summary.value.totalAmount !== null) {
    const v = parseTonNumber(summary.value.totalAmount);
    if (v > 0) return v;
  }

  if (!billDetail.value) return 0;

  const perPerson = billDetail.value.amountPerPerson ?? billDetail.value.amount_per_person ?? billDetail.value.amount ?? 0;
  const perPersonNum = parseTonNumber(perPerson);

  // 2. 使用后端返回的 paidParticipants（已付款人数）
  const paidParticipants = billDetail.value.paidParticipants ?? billDetail.value.paid_participants ?? 0;
  if (paidParticipants > 0) {
    return perPersonNum * paidParticipants;
  }

  // 3. 降级：使用成员列表
  const members = billDetail.value.members || billDetail.value.bill_members || billDetail.value.paidMembers || billDetail.value.paid_members || [];
  const memberCount = Array.isArray(members) ? members.length : 0;
  if (memberCount > 0) {
    return perPersonNum * memberCount;
  }

  // 4. 最后降级：直接返回单人金额（或 totalAmount 字段）
  const rawTotal = billDetail.value.totalAmount ?? billDetail.value.total_amount;
  if (rawTotal !== undefined && rawTotal !== null) {
    const totalNum = parseTonNumber(rawTotal);
    if (totalNum > 0) return totalNum;
  }
  return perPersonNum;
});

/**
 * 已收金额
 * ✅ 优先使用后端返回的 summary.receivedAmount（链上实际到账金额之和）
 * 若 summary 不存在，则对 payments 数组求和；
 * 若 payments 也为空，则回退为 totalAmount。
 */
const collectedAmount = computed(() => {
  // 1. 优先：后端 summary.receivedAmount
  if (summary.value && summary.value.receivedAmount !== undefined && summary.value.receivedAmount !== null) {
    const v = parseTonNumber(summary.value.receivedAmount);
    if (v > 0) return v;
  }

  // 2. 降级：对付款明细求和
  if (payments.value.length > 0) {
    return payments.value.reduce((sum, p) => {
      const amt = p.amountReceived ?? p.amount_received ?? 0;
      return sum + parseTonNumber(amt);
    }, 0);
  }

  // 3. 最后降级：返回 totalAmount
  return totalAmount.value;
});

/**
 * 已付人数
 * ✅ 优先使用后端返回的 summary.paidParticipantsCount
 */
const paidMembersCount = computed(() => {
  // 1. 优先：后端 summary.paidParticipantsCount
  if (summary.value && summary.value.paidParticipantsCount !== undefined && summary.value.paidParticipantsCount !== null) {
    return Number(summary.value.paidParticipantsCount);
  }

  // 2. 降级：付款明细列表长度
  if (payments.value.length > 0) {
    return payments.value.length;
  }

  if (!billDetail.value) return 0;

  // 3. 使用 paidParticipants
  const participants = billDetail.value.paidParticipants ?? billDetail.value.paid_participants ?? 0;
  if (participants > 0) return participants;

  // 4. 使用其他字段
  const countFromApi = billDetail.value.paidMembersCount ?? billDetail.value.paid_members_count ?? billDetail.value.memberCount ?? billDetail.value.member_count ?? billDetail.value.totalPaidMembers;
  if (typeof countFromApi === 'number' && !isNaN(countFromApi) && countFromApi > 0) {
    return countFromApi;
  }

  // 5. 最后判断当前用户是否已付
  const isUserPaid = billDetail.value.hasPaid || billDetail.value.has_paid || (billDetail.value.myStatus || '').toUpperCase() === 'PAID' || (billDetail.value.status || '').toUpperCase() === 'PAID' || (billDetail.value.status || '').toUpperCase() === 'SUCCESS';
  return isUserPaid ? 1 : 0;
});

/**
 * 进度百分比（用于进度条宽度）
 * ✅ 优先使用后端返回的 summary.progressPercentage
 */
const progressPercent = computed(() => {
  if (summary.value && summary.value.progressPercentage !== undefined && summary.value.progressPercentage !== null) {
    return Math.min(Math.max(Number(summary.value.progressPercentage), 0), 100);
  }
  if (!totalAmount.value || totalAmount.value <= 0) return 0;
  const pct = (collectedAmount.value / totalAmount.value) * 100;
  return Math.min(Math.max(pct, 0), 100);
});

// 计算账单最终状态展示
const displayStatus = computed(() => {
  if (!billDetail.value) return 'pending';

  const isUserPaid = billDetail.value.hasPaid || billDetail.value.has_paid || (billDetail.value.myStatus || '').toUpperCase() === 'PAID';
  const rawStatus = (billDetail.value.status || '').toLowerCase();

  if (rawStatus === 'paid' || rawStatus === 'success' || rawStatus === 'completed' || isUserPaid) {
    return 'paid';
  }
  return rawStatus || 'pending';
});

// 提取有效的 tgWebAppData Token
const getValidInitData = async (): Promise<string> => {
  let initData = (window as any).Telegram?.WebApp?.initData || initRawData.value || '';
  let retryCount = 0;
  
  while (!initData && retryCount < 10) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    initData = (window as any).Telegram?.WebApp?.initData || initRawData.value || '';
    retryCount++;
  }
  return initData;
};

// 剥离可能存在的路由前缀 (如 history_xxx -> xxx)
const sanitizeBillId = (rawId: string): string => {
  if (!rawId) return '';
  let cleaned = rawId.trim();
  if (cleaned.includes('_')) {
    cleaned = cleaned.slice(cleaned.indexOf('_') + 1).trim();
  }
  return (cleaned !== 'history' && cleaned !== 'bind' && cleaned !== 'stats') ? cleaned : '';
};

// 获取账单 ID
const resolveBillId = (): string => {
  if (route.params.billId && typeof route.params.billId === 'string') {
    const parsed = sanitizeBillId(route.params.billId);
    if (parsed) return parsed;
  }
  if (route.query.billId && typeof route.query.billId === 'string') {
    const parsed = sanitizeBillId(route.query.billId);
    if (parsed) return parsed;
  }
  if (route.query.bill_id && typeof route.query.bill_id === 'string') {
    const parsed = sanitizeBillId(route.query.bill_id);
    if (parsed) return parsed;
  }
  const cached = localStorage.getItem('active_bill_id');
  return cached ? sanitizeBillId(cached) : '';
};

// 清理轮询定时器
const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

// 启动自动轮询，每 3 秒刷新一次账单详情
const startPolling = (billId: string) => {
  stopPolling();
  pollTimer = setInterval(async () => {
    await fetchBillStats(true);
    
    const status = (billDetail.value?.status || '').toLowerCase();
    if (['paid', 'success', 'completed', 'expired', 'failed'].includes(status)) {
      console.log(`[HistoryPage Debug] 🏁 账单状态已变更至终止态 [${status}]，停止轮询。`);
      stopPolling();
    }
  }, 3000);
};

// 拉取单笔账单的统计及明细数据
const fetchBillStats = async (isSilent = false) => {
  const billId = resolveBillId();
  currentBillId.value = billId;

  if (!billId) {
    console.warn('[HistoryPage Debug] ⚠️ 未提供 billId，无法查询明细');
    billDetail.value = null;
    summary.value = null;
    stopPolling();
    return;
  }

  if (!isSilent) {
    console.log(`[HistoryPage Debug] 📡 开始拉取账单支付明细，Target Bill ID: [${billId}]...`);
    loading.value = true;
  }
  error.value = null;

  try {
    const initData = await getValidInitData();
    // 调用新的 getBillPayments 接口（需在 api.ts 中实现）
    const res = await api.getBillPayments(billId, initData);

    console.log('[HistoryPage Debug] 📦 账单支付明细 API 返回原数据:', res);

    if (res && res.success) {
      const data = res.data;
      // 账单信息从 data.bill 获取
      billDetail.value = data.bill || data;
      // ✅ 汇总统计数据
      summary.value = data.summary || null;
      // 付款明细从 data.payments 或 data.paidList 获取
      payments.value = data.payments || data.paidList || [];
      console.log(
        `[HistoryPage Debug] ✅ 成功获取账单支付明细 | 已付笔数: ${payments.value.length} | summary:`,
        summary.value
      );
    } else {
      const errMsg = res?.message || 'Failed to fetch bill details';
      console.error('[HistoryPage Debug] ❌ 接口返回失败:', errMsg);
      if (!isSilent) error.value = errMsg;
    }
  } catch (err: any) {
    console.error('[HistoryPage Debug] ❌ 拉取账单明细捕获到运行时异常:', err);
    if (!isSilent) error.value = err?.message || 'Network error. Please try again later.';
  } finally {
    if (!isSilent) loading.value = false;
  }
};

const getBillTitle = (): string => {
  if (!billDetail.value) return 'Untitled Bill';
  return billDetail.value.description || billDetail.value.title || billDetail.value.comment || 'Untitled Bill';
};

/**
 * 获取付款人显示名称
 * 优先显示“用户名 (ID)”，如果无用户名则仅显示 ID，若无 ID 则使用地址缩写
 */
const getPayerDisplayName = (item: any): string => {
  const tgId = item.payerTgId || item.payer_tg_id || item.userTgId || item.user_tg_id || null;
  const username = item.payerUsername || item.payer_username || item.username || null;

  // 优先组合显示用户名+ID
  if (username && tgId) {
    return `${username} (${tgId})`;
  }
  if (tgId) {
    return `${tgId}`;
  }
  if (username) {
    return username;
  }
  // 降级使用钱包地址
  const addr = item.payerAddress || item.payer_address || item.userWalletAddress || item.user_wallet_address || item.address || '';
  if (addr) {
    return shortenAddress(addr);
  }
  return 'Anonymous';
};

const getTxHash = (item: any): string => {
  return item.txHash || item.tx_hash || item.boc || item.hash || '';
};

const openExplorer = (txHash: string) => {
  if (!txHash) return;
  if (triggerHaptic) triggerHaptic('light');
  const url = `https://tonviewer.com/transaction/${txHash}`;
  console.log(`[HistoryPage Debug] 🌐 唤起 TON 浏览器查看 Hash: ${url}`);

  const tgWebApp = (window as any).Telegram?.WebApp;
  if (tgWebApp && typeof tgWebApp.openLink === 'function') {
    tgWebApp.openLink(url);
  } else {
    window.open(url, '_blank');
  }
};

const goHome = () => {
  if (triggerHaptic) triggerHaptic('light');
  router.push('/');
};

const shortenAddress = (addr: string) => {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
};

const shortenHash = (hash: string) => {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'Unknown time';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
};

const formatAmount = (val: string | number) => {
  const num = parseTonNumber(val);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
};

const formatStatus = (status?: string) => {
  if (!status) return 'In Progress';
  const statusLower = status.toLowerCase();
  const statusMap: Record<string, string> = {
    pending: 'In Progress',
    active: 'In Progress',
    confirming: 'Confirming',
    paid: 'Settled',
    success: 'Settled',
    completed: 'Settled',
    partial: 'Partially Collected',
    expired: 'Expired',
    failed: 'Failed'
  };
  return statusMap[statusLower] || status;
};

// 监听路由参数变化，支持在同一页面内切换显示不同账单
watch(
  () => [route.params.billId, route.query.billId],
  async () => {
    await fetchBillStats();
    const billId = resolveBillId();
    if (billId) {
      startPolling(billId);
    }
  }
);

onMounted(async () => {
  console.log('[HistoryPage Debug] 🚀 HistoryPage 账单统计页挂载，开始初始化...');
  await fetchBillStats();
  const billId = resolveBillId();
  if (billId) {
    startPolling(billId);
  }
});

onUnmounted(() => {
  console.log('[HistoryPage Debug] 🧹 页面卸载，清理自动轮询定时器');
  stopPolling();
});
</script>

<style scoped>
/* 样式完全与原始文件一致，此处省略以保持简洁 */
.history-page {
  padding: 16px;
  min-height: 100vh;
  background-color: var(--tg-theme-bg-color, #f5f5f5);
  color: var(--tg-theme-text-color, #222222);
  box-sizing: border-box;
}

.stats-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 概览卡片 */
.overview-card {
  background-color: var(--tg-theme-bg-color, #ffffff);
  border-radius: 14px;
  padding: 16px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 6px;
}

.bill-title {
  font-size: 18px;
  font-weight: 700;
  word-break: break-all;
}

.bill-comment {
  font-size: 13px;
  color: var(--tg-theme-hint-color, #666);
  margin-bottom: 4px;
}

.bill-time {
  font-size: 12px;
  color: var(--tg-theme-hint-color, #8e8e93);
  margin-bottom: 16px;
}

/* 进度条样式 */
.progress-section {
  margin-bottom: 16px;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--tg-theme-hint-color, #666);
  margin-bottom: 6px;
}

.progress-num {
  color: var(--tg-theme-text-color, #222);
}

.progress-bar-bg {
  height: 8px;
  background-color: var(--tg-theme-secondary-bg-color, #e9e9e9);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #34c759 0%, #30b14d 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* 统计数据网格 */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  background-color: var(--tg-theme-secondary-bg-color, #f8f9fa);
  padding: 12px;
  border-radius: 10px;
}

/* 单列布局，用于只展示“已付人数” */
.stats-grid.single {
  grid-template-columns: 1fr;
}

.grid-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 居中显示 */
.grid-item.centered {
  align-items: center;
  text-align: center;
}

.grid-label {
  font-size: 12px;
  color: var(--tg-theme-hint-color, #8e8e93);
}

.grid-value {
  font-size: 15px;
  font-weight: 600;
}

.text-warn {
  color: #ff9500;
}

/* 付款明细列表样式 */
.payments-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
}

.count-tag {
  font-size: 12px;
  font-weight: normal;
  color: var(--tg-theme-hint-color, #8e8e93);
}

.empty-payments {
  text-align: center;
  padding: 30px 10px;
  background-color: var(--tg-theme-bg-color, #ffffff);
  border-radius: 12px;
  color: var(--tg-theme-hint-color, #8e8e93);
  font-size: 14px;
}

.payment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.payment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--tg-theme-bg-color, #ffffff);
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.payment-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.payer-name {
  font-size: 14px;
  font-weight: 600;
}

.payment-time {
  font-size: 12px;
  color: var(--tg-theme-hint-color, #8e8e93);
}

.tx-hash-link {
  font-size: 11px;
  color: var(--tg-theme-link-color, #2481cc);
  margin-top: 4px;
  cursor: pointer;
}

.payment-side {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.pay-amount {
  font-size: 15px;
  font-weight: 700;
  color: #34c759;
}

.pay-status {
  font-size: 11px;
  color: var(--tg-theme-hint-color, #8e8e93);
}

/* 状态徽章 */
.status-badge {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 500;
  white-space: nowrap;
}

.status-pending,
.status-active {
  background-color: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.status-confirming {
  background-color: rgba(36, 129, 204, 0.12);
  color: #2481cc;
}

.status-paid,
.status-success,
.status-completed {
  background-color: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.status-failed,
.status-expired {
  background-color: rgba(142, 142, 147, 0.12);
  color: #8e8e93;
}

/* 框架基础状态控件 */
.loading-box,
.error-box,
.empty-box {
  text-align: center;
  padding: 40px 20px;
  color: var(--tg-theme-hint-color, #888888);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.retry-btn,
.home-btn {
  margin-top: 14px;
  padding: 8px 22px;
  background-color: var(--tg-theme-button-color, #2481cc);
  color: var(--tg-theme-button-text-color, #ffffff);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: var(--tg-theme-button-color, #2481cc);
  animation: spin 1s ease-in-out infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
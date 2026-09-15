<!-- splitapp/src/pages/IndexPage.vue -->
<template>
  <div class="bill-container">
    <div v-if="loading || !tgInitReady" class="loading-box">
      <div class="spinner"></div>
      <p>Loading bill information...</p>
    </div>

    <div v-else-if="error" class="error-box">
      <p>❌ {{ error }}</p>
    </div>

    <div v-else-if="bill" class="bill-card">
      <!-- 📊 Top banner in stats view -->
      <div v-if="isStatsMode" class="stats-banner">
        📊 Viewing bill payment statistics and member split details
      </div>

      <!-- Pass correct hasPaid and myStatus props -->
      <PaymentStatus
        :status="displayCardStatus"
        :hasPaid="bill.hasPaid || false"
        :myStatus="bill.myStatus || ''"
        :comment="bill.comment || ''"
      />

      <div class="amount-section">
        <span class="amount-value">{{ displayTonAmount }}</span>
        <span class="amount-unit">TON</span>
      </div>

      <!-- 📊 Overall settlement progress bar in stats mode -->
      <div v-if="isStatsMode && totalMembersCount > 0" class="stats-summary-card">
        <div class="stats-summary-header">
          <span>Settlement Progress</span>
          <span class="stats-percentage">{{ paidMembersCount }} / {{ totalMembersCount }} paid ({{ statsCompletionRate }}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" :style="{ width: statsCompletionRate + '%' }"></div>
        </div>
      </div>

      <div class="info-list">
        <!-- Bill description -->
        <div v-if="bill.description" class="info-item vertical">
          <span class="label">Description</span>
          <span class="value desc-text" :title="bill.description">
            {{ bill.description }}
          </span>
        </div>

        <!-- Creator info: username (ID) or just ID -->
        <div class="info-item">
          <span class="label">Creator</span>
          <span class="value">{{ getCreatorDisplay() }}</span>
        </div>

        <div class="info-item">
          <span class="label">Seller / Receiving Address</span>
          <span
            class="value address"
            :title="normalizedPayeeAddress || 'Waiting for wallet connect or contract fallback...'"
          >
            {{ getDisplayAddress() }}
          </span>
        </div>

        <div class="info-item">
          <span class="label">Memo</span>
          <span class="value comment">{{ bill.comment || bill.id || 'N/A' }}</span>
        </div>

        <!-- Group owner Telegram ID -->
        <div v-if="getGroupOwnerTgId()" class="info-item">
          <span class="label">Group</span>
          <span class="value tg-id">
            TG: {{ getGroupOwnerTgId() }}
          </span>
        </div>

        <!-- Member split details (if any) -->
        <div v-if="getBillMembers().length > 0" class="members-section" :class="{ 'highlight-members': isStatsMode }">
          <div class="members-title">
            <span>Member Split Details ({{ getBillMembers().length }} members)</span>
            <span v-if="isStatsMode" class="stats-tag">Stats Mode</span>
          </div>
          <div class="member-list">
            <div 
              v-for="member in getBillMembers()" 
              :key="member.id || member.userTgId || member.user_tg_id || member.user_wallet_address || member.userWalletAddress" 
              class="member-item"
            >
              <!-- Safe display for anonymous users without TG ID -->
              <span class="member-id">
                {{ formatMemberIdentity(member) }}
              </span>
              <span class="member-status" :class="(member.status || '').toLowerCase()">
                {{ member.amountDue || member.amount_due || '0' }} TON [{{ (member.status || '').toUpperCase() === 'PAID' ? 'Paid' : 'Unpaid' }}]
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Mode switch buttons removed -->

      <div class="action-section">
        <!-- Branch 1: Current user has paid -->
        <div v-if="isCurrentUserPaid" class="success-text">
          🎉 Thank you for your payment. On-chain settlement complete!
        </div>

        <!-- Branch 2: Permission intercept (creator or already paid) -->
        <div v-else-if="userPayPermission.disabled" class="disabled-action-block">
          <button class="btn btn-disabled" disabled>
            {{ userPayPermission.buttonText }}
          </button>
          <p class="permission-tip">💡 {{ userPayPermission.reasonText }}</p>
        </div>

        <!-- 3. Bill expired -->
        <div v-else-if="billStatus === 'expired'" class="disabled-action-block">
          <button class="btn btn-disabled" disabled>
            Bill Expired
          </button>
          <p class="permission-tip">⌛ This bill was archived due to timeout. Please ask the creator to create a new one.</p>
        </div>

        <!-- 4. Contract disabled -->
        <div v-else-if="!isContractActive" class="disabled-action-block">
          <button class="btn btn-disabled" disabled>
            ⚠️ Contract Temporarily Disabled
          </button>
          <p class="permission-tip">💡 System maintenance in progress. Payments are temporarily unavailable. Please try again later.</p>
        </div>

        <!-- 5. Payment button: user unpaid, bill not full/expired -->
        <div v-else-if="isUserConnected && isPayAllowed" class="pay-action-block">
          <button
            @click="handlePay"
            :disabled="paying || billStatus === 'confirming' || isConnecting"
            class="btn btn-pay"
          >
            {{ isConnecting ? 'Connecting wallet...' : (paying ? "Please confirm in wallet..." : (billStatus === 'confirming' ? 'Confirming on-chain...' : 'Confirm Payment')) }}
          </button>
          <p class="gas-tip">💡 An extra ~0.03 TON for on-chain gas is required when confirming. Any leftover gas will be automatically refunded to your wallet by the PaymentSplitter contract.</p>
        </div>

        <!-- 6. User not connected: guide to connect wallet -->
        <div v-else-if="!isUserConnected && isPayAllowed" class="connect-action-block">
          <p class="connect-hint">Connect your wallet to make a decentralized split payment</p>
          <button @click="triggerWalletConnect" class="btn btn-connect">
            Connect TON Wallet
          </button>
        </div>

        <!-- 7. On-chain confirmation pending -->
        <div v-else-if="billStatus === 'confirming'" class="confirming-text">
          ⏳ PaymentSplitter contract transaction submitted. Waiting for on-chain confirmation...
        </div>

        <!-- 8. Bounced / failed -->
        <div v-else-if="billStatus === 'failed' || billStatus === 'bounced'" class="error-text">
          ⚠️ Transaction was bounced on-chain. Please check your balance or contact support and try again.
        </div>

        <!-- 9. Bill fully settled -->
        <div v-else-if="isBillFullyClosed" class="success-text">
          🎉 Bill settled!
        </div>
      </div>
    </div>

    <div v-else class="empty-box">
      <p>⚠️ No valid bill information detected</p>
      <small>Please reopen via a link generated by the Telegram Bot.</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Address } from '@ton/core';
import { useTelegram } from '../composables/useTelegram';
import { useTonConnect } from '../composables/useTonConnect';
import { api, toRawAddress, type BillDetails } from '../services/api';
import { blurAddress, toUserFriendlyAddress } from '../helperts/address';

import PaymentStatus from '../components/PaymentStatus.vue';

// 平台默认钱包地址（兜底用于未绑定钱包的群主/平台）
const DEFAULT_PLATFORM_ADDRESS =
  import.meta.env.VITE_PLATFORM_FEE_ADDRESS ||
  'UQCl3eqtDAZweRgigJ4YWkBNuC_h4kQhac1lXQAwbqFJoIs6';

// ✅ 零地址常量：用于群主未绑定钱包时传递给合约，合约将据此合并费用
const ZERO_ADDRESS = '0:0000000000000000000000000000000000000000000000000000000000000000';

const route = useRoute();
const router = useRouter();
const { startParam, initRawData, tgUserId, triggerHaptic, triggerNotificationHaptic, initPromise } = useTelegram();

// ✅ 从 useTonConnect 解构，新增 connectWallet
const { 
  isConnected, 
  walletAddress, 
  sendPayment, 
  initTonConnect,
  connectWallet,          // ✅ 新增
  isContractActive,
  isCheckingContract,
  checkContractActive
} = useTonConnect();

const bill = ref<(BillDetails & { 
  creator_id?: string | number | null;
  creatorId?: string | number | null;
  creatorUsername?: string | null;
  boundWalletAddress?: string | null;
  userWalletAddress?: string | null; 
  user_wallet_address?: string | null;
  payerAddress?: string | null; 
  group_owner_tg_id?: string | number | null;
  group_owner_address?: string | null;
  bill_members?: any[];
  paid_members?: any[];
  paidMembers?: any[];
  groupRate?: number | string | null;
  group_rate?: number | string | null;
  groupOwnerAddress?: string | null;
  hasPaid?: boolean;
  has_paid?: boolean;
  myStatus?: string;
  totalPaidMembers?: number;
  paidMembersCount?: number;
  paid_members_count?: number;
  memberCount?: number;
  member_count?: number;
  total_paid_amount?: number | string;
}) | null>(null);

const loading = ref(true);
const tgInitReady = ref(false);
const paying = ref(false);
const error = ref<string | null>(null);
const isConnecting = ref(false);

// 全局账单状态
const billStatus = ref<'pending' | 'confirming' | 'partial' | 'paid' | 'expired' | 'success' | 'failed' | 'bounced'>('pending');

// 标记正在同步钱包地址至后端数据库
const isSyncingWallet = ref(false);

/**
 * 读取路由参数与 startapp 判断当前是否属于统计模式 view=stats 或 startapp=stats_
 */
const isStatsMode = computed(() => {
  if (route.query.view === 'stats') return true;
  const rawStart = (route.query.startapp || route.query.tgWebAppStartParam || startParam.value) as string;
  return typeof rawStart === 'string' && rawStart.startsWith('stats_');
});

/**
 * 安全获取当前 Telegram 用户的 User ID
 */
const currentTgId = computed<string>(() => {
  if (tgUserId.value) {
    return String(tgUserId.value);
  }
  const nativeUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  if (nativeUser?.id) {
    return String(nativeUser.id);
  }
  return '';
});

/**
 * 安全获取群组成员分摊明细列表
 */
const getBillMembers = (): any[] => {
  if (!bill.value) return [];
  const list = bill.value.members || bill.value.bill_members || bill.value.paidMembers || bill.value.paid_members;
  return Array.isArray(list) ? list : [];
};

/**
 * 精确定位与校验“当前访问用户”在账单中的成员记录
 */
const currentUserMemberRecord = computed(() => {
  if (!bill.value) return null;
  const members = getBillMembers();
  if (members.length === 0) return null;

  const myTgId = currentTgId.value;
  const myWallet = walletAddress.value 
    ? toUserFriendlyAddress(walletAddress.value, 'IndexPage-CurrentUser') 
    : '';

  return members.find((m: any) => {
    const memberTgId = String(m.userTgId || m.user_tg_id || '');
    const memberWallet = toUserFriendlyAddress(
      m.userWalletAddress || m.user_wallet_address || m.wallet_address || m.payer_address || '',
      'IndexPage-MemberMatch'
    );

    const isTgMatched = !!(myTgId && memberTgId === myTgId);
    const isWalletMatched = !!(myWallet && memberWallet && myWallet === memberWallet);

    return isTgMatched || isWalletMatched;
  });
});

/**
 * 核心点 1：精确定位【当前用户】个人是否完成了支付
 */
const isCurrentUserPaid = computed(() => {
  if (!bill.value) return false;

  if (currentUserMemberRecord.value) {
    const status = String(currentUserMemberRecord.value.status || '').toUpperCase();
    return status === 'PAID' || status === 'COMPLETED';
  }

  const myStatus = String(bill.value.myStatus || '').toUpperCase();
  if (myStatus === 'PAID' || myStatus === 'COMPLETED') {
    return true;
  }

  return bill.value.hasPaid === true || bill.value.has_paid === true;
});

/**
 * 核心点 2：判断账单是否真正的全额满额/已完全清算
 */
const isBillFullyClosed = computed(() => {
  if (!bill.value) return false;
  
  const perPerson = Number(bill.value.amountPerPerson ?? bill.value.amount_per_person ?? bill.value.amount ?? 0);
  const members = getBillMembers();
  let totalAmount = perPerson;
  if (members.length > 0) {
    totalAmount = perPerson * members.length;
  } else {
    totalAmount = Number(bill.value.amount ?? 0);
  }
  
  const paidAmount = Number(bill.value.total_paid_amount ?? 0);

  if (totalAmount > 0 && paidAmount >= totalAmount) {
    return true;
  }

  return billStatus.value === 'paid' || billStatus.value === 'success';
});

/**
 * 核心点 3：解耦后的核心支付允许条件
 */
const isPayAllowed = computed(() => {
  if (!bill.value || isCurrentUserPaid.value || billStatus.value === 'expired') {
    return false;
  }
  if (billStatus.value === 'failed' || billStatus.value === 'bounced') {
    return false;
  }
  if (!isContractActive.value) {
    return false;
  }
  return true;
});

/**
 * 传递给顶部卡片的展示状态
 */
const displayCardStatus = computed(() => {
  const creatorId = String(bill.value?.creatorId || bill.value?.creator_id || '');
  const myTgId = currentTgId.value;
  if (myTgId && creatorId && myTgId === creatorId && !isCurrentUserPaid.value) {
    return 'waiting_others';
  }

  if (isCurrentUserPaid.value) return 'paid';
  if (billStatus.value === 'confirming') return 'confirming';
  if (billStatus.value === 'expired') return 'expired';
  if (billStatus.value === 'failed' || billStatus.value === 'bounced') return 'failed';
  if (paidMembersCount.value > 0) return 'partial';
  return 'pending';
});

/**
 * 计算已支付成员数量
 */
const paidMembersCount = computed(() => {
  if (!bill.value) return 0;
  
  const members = getBillMembers();
  if (members.length > 0) {
    const paidInMembers = members.filter((m: any) => (m.status || '').toUpperCase() === 'PAID').length;
    if (paidInMembers > 0) return paidInMembers;
  }

  const countFromApi = 
    bill.value.paidMembersCount ?? 
    bill.value.paid_members_count ?? 
    bill.value.totalPaidMembers ?? 
    bill.value.memberCount ?? 
    bill.value.member_count;

  if (typeof countFromApi === 'number' && !isNaN(countFromApi) && countFromApi > 0) {
    return countFromApi;
  }

  return isCurrentUserPaid.value ? 1 : 0;
});

/**
 * 计算总成员数量
 */
const totalMembersCount = computed(() => {
  const members = getBillMembers();
  if (members.length > 0) return members.length;
  
  const rawTotal = bill.value?.memberCount ?? bill.value?.member_count;
  if (typeof rawTotal === 'number' && rawTotal > 0) return rawTotal;

  return paidMembersCount.value;
});

/**
 * 计算分摊完成百分比 (用于统计视图)
 */
const statsCompletionRate = computed(() => {
  const total = totalMembersCount.value;
  if (total <= 0) return '0';
  const rate = (paidMembersCount.value / total) * 100;
  return Math.min(100, Math.max(0, rate)).toFixed(0);
});

/**
 * 安全获取关联群主 Telegram ID
 */
const getGroupOwnerTgId = (): string => {
  if (!bill.value) return '';
  const tgId = bill.value.groupOwnerTgId || bill.value.group_owner_tg_id;
  return tgId ? String(tgId) : '';
};

/**
 * 获取发起人显示名称（用户名 + ID 或仅 ID）
 */
const getCreatorDisplay = (): string => {
  if (!bill.value) return 'Unknown';
  const creatorId = bill.value.creatorId || bill.value.creator_id;
  const username = bill.value.creatorUsername;
  if (creatorId) {
    if (username) {
      return `${username} (${creatorId})`;
    }
    return String(creatorId);
  }
  return 'Unknown creator';
};

/**
 * 格式化分摊成员标识
 */
const formatMemberIdentity = (member: any): string => {
  const tgId = member.userTgId || member.user_tg_id;
  if (tgId) {
    return `TG: ${tgId}`;
  }
  const rawAddr = member.userWalletAddress || member.user_wallet_address || member.wallet_address || member.payer_address;
  if (rawAddr) {
    const normalized = toUserFriendlyAddress(rawAddr, 'IndexPage-Member') || rawAddr;
    return `${blurAddress(normalized, 4)} (Anonymous)`;
  }
  return 'Anonymous';
};

/**
 * 辅助函数：标准化账单状态
 */
function normalizeBillStatus(rawStatus: string): 'pending' | 'confirming' | 'partial' | 'paid' | 'expired' | 'success' | 'failed' | 'bounced' {
  if (!rawStatus) return 'pending';
  const lower = rawStatus.toLowerCase().trim();

  if (lower === 'active' || lower === 'pending' || lower === 'unpaid') {
    return 'pending';
  }
  if (lower === 'paid' || lower === 'success' || lower === 'completed') {
    return 'paid';
  }
  if (lower === 'closed') {
    return 'paid';
  }
  if (lower === 'partial') {
    return 'partial';
  }
  if (lower === 'confirming') return 'confirming';
  if (lower === 'failed' || lower === 'error') return 'failed';
  if (lower === 'bounced') return 'bounced';
  if (lower === 'expired' || lower === 'timeout' || lower === 'archived') return 'expired';

  return 'pending';
}

/**
 * 核心拦截规则计算：精准拦截发起人与已付用户
 */
const userPayPermission = computed(() => {
  if (!tgInitReady.value || !bill.value) {
    return { disabled: false, buttonText: '', reasonText: '' };
  }

  const myTgId = currentTgId.value;
  const myWallet = walletAddress.value 
    ? toUserFriendlyAddress(walletAddress.value, 'IndexPage-PermCheck') 
    : '';

  const creatorId = String(bill.value.creatorId || bill.value.creator_id || '');
  const payeeAddr = normalizedPayeeAddress.value;

  // 1. Creator intercept
  const isCreator = (myTgId && myTgId === creatorId) || (myWallet && payeeAddr && myWallet === payeeAddr);
  if (isCreator) {
    return {
      disabled: true,
      buttonText: 'Creator Cannot Pay',
      reasonText: 'You are the creator of this bill and do not need to pay.',
    };
  }

  // 2. User already paid
  if (isCurrentUserPaid.value) {
    return {
      disabled: true,
      buttonText: 'Already Paid',
      reasonText: 'You have already paid. Please do not pay again.',
    };
  }

  return { disabled: false, buttonText: '', reasonText: '' };
});

/**
 * 计算属性：归一化卖家的收款地址
 */
const normalizedPayeeAddress = computed(() => {
  const rawPayee = bill.value?.payeeAddress || (bill.value as any)?.payee_address || walletAddress.value || '';
  if (!rawPayee) return '';
  return toUserFriendlyAddress(rawPayee, 'IndexPage-PayeeAddress') || rawPayee;
});

/**
 * 计算属性：展示合约固定的群主服务费率 (已不再用于显示，保留供其他可能用途)
 */
const displayGroupRate = computed(() => {
  if (!bill.value) return '1.0';
  const rate = bill.value.groupRate || (bill.value as any)?.group_rate;
  if (rate !== undefined && rate !== null) {
    const rateNum = Number(rate);
    return isNaN(rateNum) ? '1.0' : (rateNum * 100).toFixed(1);
  }
  return '1.0';
});

/**
 * 检查钱包连接/绑定状态
 */
const isUserConnected = computed(() => {
  const sdkConnected = isConnected.value || !!walletAddress.value;

  const dbBoundAddr = 
    bill.value?.boundWalletAddress || 
    bill.value?.userWalletAddress || 
    bill.value?.user_wallet_address || 
    bill.value?.walletAddress || 
    bill.value?.payerAddress || null;
  
  const dbAddrNormalized = toUserFriendlyAddress(dbBoundAddr || '', 'IndexPage-DBBoundAddr');

  return sdkConnected || Boolean(dbAddrNormalized);
});

/**
 * 显示金额：优先使用 amountPerPerson / amount_per_person，降级至 amount 或 originalAmount
 */
const displayTonAmount = computed(() => {
  if (!bill.value) return '0.00';
  
  const perPerson = bill.value.amountPerPerson ?? bill.value.amount_per_person ?? bill.value.amount ?? bill.value.originalAmount ?? 0;
  const num = typeof perPerson === 'string' ? parseFloat(perPerson) : perPerson;
  if (isNaN(num)) return '0.00';
  return num.toFixed(2);
});

let pollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 清理并过滤带有 stats_ 前缀的 Bill ID
 */
const sanitizeBillId = (val: string): string => {
  if (!val) return '';
  let cleaned = val.trim();
  
  if (cleaned.startsWith('stats_')) {
    cleaned = cleaned.replace(/^stats_/, '').trim();
  } else {
    const underscoreIdx = cleaned.indexOf('_');
    if (underscoreIdx !== -1) {
      cleaned = cleaned.substring(underscoreIdx + 1).trim();
    }
  }
  
  return (cleaned !== 'bind' && cleaned !== 'history' && cleaned !== 'stats') ? cleaned : '';
};

/**
 * 严格的 Bill ID 提取策略
 */
const getBillId = (): string => {
  const routeParam = route.params.billId as string;
  if (routeParam) {
    const cleaned = sanitizeBillId(routeParam);
    if (cleaned) return cleaned;
  }

  const hash = window.location.hash;
  const match = hash.match(/\/split\/([^\/?#]+)/);
  if (match && match[1]) {
    const cleaned = sanitizeBillId(match[1]);
    if (cleaned) return cleaned;
  }

  const queryParam = (route.query.billId || route.query.startapp || route.query.tgWebAppStartParam) as string;
  if (queryParam) {
    const cleaned = sanitizeBillId(queryParam);
    if (cleaned) return cleaned;
  }

  const tgWebApp = (window as any).Telegram?.WebApp;
  const sdkStartParam = tgWebApp?.initDataUnsafe?.start_param;
  if (sdkStartParam) {
    const cleaned = sanitizeBillId(sdkStartParam);
    if (cleaned) return cleaned;
  }

  if (startParam.value) {
    const cleaned = sanitizeBillId(startParam.value);
    if (cleaned) return cleaned;
  }

  return '';
};

/**
 * 提取有效的 Telegram initData 身份凭证
 */
const getValidInitData = async (): Promise<string> => {
  let initData = 
    (window as any).Telegram?.WebApp?.initData || 
    initRawData.value || 
    sessionStorage.getItem('__TG_RAW_INIT_DATA__') || 
    '';
  let retryCount = 0;
  
  while (!initData && retryCount < 10) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    initData = 
      (window as any).Telegram?.WebApp?.initData || 
      initRawData.value || 
      sessionStorage.getItem('__TG_RAW_INIT_DATA__') || 
      '';
    retryCount++;
  }

  return initData;
};

/**
 * 同步钱包地址至后端
 */
const syncWalletAddressToBackend = async (rawAddr: string) => {
  if (!rawAddr || isSyncingWallet.value) return;

  const normalized = toUserFriendlyAddress(rawAddr, 'IndexPage-SyncBackend');
  const rawFormatted = toRawAddress(rawAddr) || rawAddr;

  if (!normalized) return;

  try {
    isSyncingWallet.value = true;
    const initData = await getValidInitData();
    await api.bindWallet({
      walletAddress: normalized,
      walletAddressRaw: rawFormatted,
      initData,
    });

    if (bill.value) {
      bill.value.boundWalletAddress = normalized;
      bill.value.userWalletAddress = normalized;
      bill.value.walletAddress = normalized;
    }
  } catch (err) {
    console.error('[IndexPage Wallet Sync] ❌ 钱包地址写入后端失败:', err);
  } finally {
    isSyncingWallet.value = false;
  }
};

/**
 * 核心加载与响应式监听逻辑
 */
const fetchBillData = async () => {
  loading.value = true;
  error.value = null;

  try {
    const initData = await getValidInitData();

    const rawStartParam = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param || startParam.value;
    if (rawStartParam === 'bind') {
      router.replace({ name: 'bind' });
      return;
    }

    const billId = getBillId();
    if (!billId) {
      error.value = 'No valid bill information detected. Please reopen via a Telegram Bot link.';
      return;
    }

    const res = await api.getBillDetails(billId, initData);
    const data: any = res?.data ? res.data : res;

    if (res.success && data) {
      bill.value = data;

      if (data.status) {
        billStatus.value = normalizeBillStatus(data.status);
      }

      if (billStatus.value !== 'expired') {
        startPolling(bill.value!.id);
      }

      if (walletAddress.value) {
        syncWalletAddressToBackend(walletAddress.value);
      }
    } else {
      error.value = (res as any).message || 'Failed to fetch bill';
    }
  } catch (err: any) {
    error.value = 'Failed to load bill. Please check your network or reopen from Telegram.';
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  if ((window as any).Telegram?.WebApp) {
    (window as any).Telegram.WebApp.ready();
    (window as any).Telegram.WebApp.expand();
  }

  if (initPromise) {
    try {
      await initPromise;
    } catch (e) {
      console.warn('[IndexPage Init] ⚠️ Telegram SDK 初始化等待告警:', e);
    }
  }
  
  tgInitReady.value = true;
  await fetchBillData();

  await checkContractActive();

  // ============================================================
  // ✅ 处理返回按钮：点击时关闭 Mini App
  // ============================================================
  const tg = (window as any).Telegram?.WebApp;
  if (tg) {
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
      if (typeof triggerHaptic === 'function') triggerHaptic('light');
      tg.close();
    });
  }
});

watch(
  () => route.params.billId,
  (newBillId, oldBillId) => {
    if (newBillId && newBillId !== oldBillId) {
      stopPolling();
      fetchBillData();
    }
  }
);

watch(walletAddress, (newAddr) => {
  if (newAddr) {
    syncWalletAddressToBackend(newAddr);
  }
}, { immediate: true });

watch([walletAddress, bill], async ([newAddr, currentBill]) => {
  if (newAddr && currentBill) {
    const currentPayee = currentBill.payeeAddress || (currentBill as any).payee_address;
    if (!currentPayee) {
      try {
        const formattedPayee = toUserFriendlyAddress(newAddr, 'IndexPage-AutoFillPayee') || newAddr;
        const initData = await getValidInitData();
        await api.notifyPayment(currentBill.id, { payeeAddress: formattedPayee, payerAddress: formattedPayee }, initData);
        currentBill.payeeAddress = formattedPayee;
      } catch (e) {
        console.error('[IndexPage Debug] ❌ 自动回填卖家地址异常:', e);
      }
    }
  }
}, { immediate: true });

// 钱包连接触发器
const triggerWalletConnect = () => {
  if (typeof triggerHaptic === 'function') triggerHaptic('light');
  connectWallet();
};

const getDisplayAddress = (): string => {
  const targetAddr = normalizedPayeeAddress.value;
  if (targetAddr) {
    return blurAddress(targetAddr, 6);
  }
  return 'Seller has not bound a receiving wallet';
};

const toNanoTonString = (val: string | number): string => {
  if (val === undefined || val === null) return '0';
  const str = String(val).trim();
  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) return '0';

  if (!str.includes('.') && num >= 1e7) {
    return Math.floor(num).toString();
  }

  const parts = str.split('.');
  const integerPart = parts[0] || '0';
  let decimalPart = parts[1] || '';

  if (decimalPart.length > 9) {
    decimalPart = decimalPart.substring(0, 9);
  } else {
    decimalPart = decimalPart.padEnd(9, '0');
  }

  return (BigInt(integerPart) * BigInt(1e9) + BigInt(decimalPart)).toString();
};

const handlePay = async () => {
  // 防止重复点击
  if (paying.value || isConnecting.value) {
    return;
  }

  await checkContractActive();
  if (!isContractActive.value) {
    alert('⚠️ The contract is temporarily disabled. Please try again later.');
    return;
  }

  if (!bill.value) return;

  if (billStatus.value === 'expired') {
    alert('⚠️ This bill has expired. Please ask the creator to create a new one before paying.');
    return;
  }

  if (userPayPermission.value.disabled) {
    alert(userPayPermission.value.reasonText);
    return;
  }

  // ============================================================
  // 核心修复：如果钱包未连接，触发连接并等待完成
  // ============================================================
  if (!isConnected.value && !walletAddress.value) {
    isConnecting.value = true;
    if (typeof triggerHaptic === 'function') triggerHaptic('light');
    
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.showPopup) {
      tg.showPopup({
        title: '🔗 Connect Wallet',
        message: 'Please connect your TON wallet in the popup.\nAfter connecting, tap "Confirm Payment" again.',
        buttons: [{ type: 'ok', text: 'Got it' }]
      });
    }
    
    try {
      await connectWallet();
      await new Promise(resolve => setTimeout(resolve, 800));
      
      if (!isConnected.value && !walletAddress.value) {
        alert('❌ Wallet connection failed or was cancelled. Please try again.');
        isConnecting.value = false;
        return;
      }
    } catch (err) {
      alert('❌ Wallet connection failed. Please try again.');
      isConnecting.value = false;
      return;
    } finally {
      isConnecting.value = false;
    }
  }

  // 再次检查连接状态（保险）
  if (!isConnected.value && !walletAddress.value) {
    alert('❌ Please connect your wallet before paying.');
    return;
  }

  // 如果已连接但未同步钱包到后端，则同步
  if (walletAddress.value && !bill.value.boundWalletAddress) {
    await syncWalletAddressToBackend(walletAddress.value);
  }

  const rawSellerAddress = bill.value.payeeAddress || (bill.value as any).payee_address || '';
  if (!rawSellerAddress) {
    alert('⚠️ The seller has not bound a receiving wallet yet. Please ask the seller to complete wallet binding before paying.');
    return;
  }

  const rawGroupOwnerAddress = 
    bill.value.groupOwnerAddress || 
    bill.value.group_owner_address || 
    (bill.value as any).groupOwner;

  const validGroupOwnerTarget = (rawGroupOwnerAddress && rawGroupOwnerAddress.trim() !== '') 
    ? rawGroupOwnerAddress 
    : ZERO_ADDRESS;

  let validSellerAddress: string | null = null;
  let validGroupOwnerAddress: string | null = null;

  try {
    validSellerAddress = toUserFriendlyAddress(rawSellerAddress, 'Pay-Seller');
    if (!validSellerAddress) {
      validSellerAddress = Address.parse(rawSellerAddress.trim()).toString({ bounceable: false });
    }
  } catch (e) {
    alert('Invalid seller receiving wallet address. Unable to initiate payment!');
    return;
  }

  try {
    validGroupOwnerAddress = toUserFriendlyAddress(validGroupOwnerTarget, 'Pay-Owner');
    if (!validGroupOwnerAddress) {
      validGroupOwnerAddress = Address.parse(validGroupOwnerTarget.trim()).toString({ bounceable: false });
    }
  } catch (e) {
    alert('Invalid group owner rebate wallet address. Unable to initiate payment!');
    return;
  }

  const payVal = bill.value.amountPerPerson ?? bill.value.amount_per_person ?? bill.value.amount ?? '0';
  const baseBillAmountNano = toNanoTonString(payVal);
  
  const commentText = String(bill.value.comment || bill.value.id || '').trim();

  paying.value = true;
  if (typeof triggerHaptic === 'function') triggerHaptic('medium');

  try {
    const result = await sendPayment(
      validSellerAddress,
      validGroupOwnerAddress,
      baseBillAmountNano,
      commentText
    );

    if (result.success && result.boc) {
      try {
        const initData = await getValidInitData();
        const payerAddr = walletAddress.value ? toUserFriendlyAddress(walletAddress.value, 'Pay-Notify') : undefined;
        
        await api.notifyPayment(
          bill.value.id,
          { 
            boc: result.boc, 
            payeeAddress: validSellerAddress,
            payerAddress: payerAddr
          },
          initData
        );
      } catch (notifyErr) {
        console.warn('[IndexPage Debug] ⚠️ notifyPayment 上报提醒:', notifyErr);
      }

      billStatus.value = 'confirming';
      startPolling(bill.value.id);
    } else {
      if (typeof triggerNotificationHaptic === 'function') triggerNotificationHaptic('warning');
      alert(`Payment not completed: ${result.error || 'User cancelled signature'}`);
    }
  } catch (err: any) {
    alert(`Payment error: ${err.message || err}`);
  } finally {
    paying.value = false;
  }
};

/**
 * 轮询账单状态
 */
const startPolling = (billId: string | number) => {
  if (pollingTimer) return;

  let attempts = 0;
  const maxAttempts = 100;

  pollingTimer = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      stopPolling();
      return;
    }

    try {
      const initData = await getValidInitData();
      const res = await api.getBillDetails(billId, initData);
      const latestData: any = res?.data ? res.data : res;

      if (latestData) {
        if (bill.value) {
          const currentMembers = getBillMembers();
          const incomingMembers = latestData.members || latestData.bill_members || latestData.paidMembers || latestData.paid_members;

          Object.assign(bill.value, latestData);

          if ((!incomingMembers || incomingMembers.length === 0) && currentMembers.length > 0) {
            bill.value.members = currentMembers;
          }
        }

        if (isCurrentUserPaid.value && billStatus.value === 'confirming') {
          billStatus.value = 'paid';
          if (typeof triggerNotificationHaptic === 'function') triggerNotificationHaptic('success');
        }

        if (latestData.status) {
          const parsedStatus = normalizeBillStatus(latestData.status);

          if (parsedStatus === 'failed' || parsedStatus === 'bounced') {
            billStatus.value = 'failed';
            if (typeof triggerNotificationHaptic === 'function') triggerNotificationHaptic('error');
            stopPolling();
          } else if (parsedStatus === 'expired') {
            billStatus.value = 'expired';
            stopPolling();
          }
        }
      }
    } catch (err) {
      console.error('[IndexPage Debug] ❌ 轮询请求抖动:', err);
    }
  }, 3000);
};

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
};

onBeforeUnmount(() => {
  stopPolling();
});

/**
 * 清理 Telegram BackButton 事件
 */
onUnmounted(() => {
  const tg = (window as any).Telegram?.WebApp;
  if (tg) {
    tg.BackButton.offClick();
    tg.BackButton.hide();
  }
});
</script>

<style scoped>
/* 样式保持不变 */
.bill-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--tg-theme-text-color, #222222);
  background: var(--tg-theme-bg-color, #ffffff);
  min-height: 100vh;
  box-sizing: border-box;
}

.bill-card {
  width: 100%;
  max-width: 360px;
  background: var(--tg-theme-secondary-bg-color, #f4f4f7);
  border-radius: 24px;
  padding: 24px 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  text-align: center;
  box-sizing: border-box;
  margin-top: 10px;
}

.stats-banner {
  background: rgba(36, 139, 207, 0.12);
  color: var(--tg-theme-button-color, #248bcf);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 12px;
  margin-bottom: 12px;
  border: 1px dashed rgba(36, 139, 207, 0.3);
}

.stats-summary-card {
  background: var(--tg-theme-bg-color, #ffffff);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 16px;
  text-align: left;
  border: 1px solid rgba(0, 0, 0, 0.04);
}
.stats-summary-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--tg-theme-hint-color, #8e8e93);
  margin-bottom: 8px;
}
.stats-percentage {
  font-weight: 700;
  color: var(--tg-theme-button-color, #248bcf);
}
.progress-bar-bg {
  width: 100%;
  height: 8px;
  background: var(--tg-theme-secondary-bg-color, #e0e0e6);
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--tg-theme-button-color, #248bcf);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.amount-section {
  margin: 16px 0 24px 0;
}
.amount-value {
  font-size: 46px;
  font-weight: 800;
  letter-spacing: -1px;
}
.amount-unit {
  font-size: 20px;
  font-weight: 600;
  margin-left: 6px;
  color: var(--tg-theme-hint-color, #8e8e93);
}
.info-list {
  text-align: left;
  background: var(--tg-theme-bg-color, #ffffff);
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 16px;
  border: 1px solid rgba(0, 0, 0, 0.03);
}
.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  font-size: 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.info-item.vertical {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.info-item:last-child {
  border-bottom: none;
}
.label {
  color: var(--tg-theme-hint-color, #8e8e93);
}
.value {
  font-weight: 500;
}
.desc-text {
  font-size: 13px;
  color: var(--tg-theme-text-color, #333333);
  line-height: 1.4;
  word-break: break-word;
  background: var(--tg-theme-secondary-bg-color, #f8f9fa);
  padding: 8px 10px;
  border-radius: 8px;
  width: 100%;
  box-sizing: border-box;
}
.address {
  font-family: monospace;
  color: var(--tg-theme-link-color, #248bcf);
}
.comment {
  font-family: monospace;
  background: var(--tg-theme-secondary-bg-color, #f4f4f7);
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: bold;
}
.tg-id {
  font-family: monospace;
  color: #666;
}

.members-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed rgba(0, 0, 0, 0.1);
}
.members-section.highlight-members {
  border-top-style: solid;
  border-top-color: var(--tg-theme-button-color, #248bcf);
}
.members-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--tg-theme-hint-color, #8e8e93);
  margin-bottom: 6px;
}
.stats-tag {
  background: var(--tg-theme-button-color, #248bcf);
  color: #ffffff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
}
.member-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.member-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  background: var(--tg-theme-secondary-bg-color, #f8f9fa);
  padding: 6px 8px;
  border-radius: 6px;
}
.member-id {
  font-family: monospace;
}
.member-status {
  font-weight: 600;
}
.member-status.paid {
  color: #18a058;
}
.member-status.unpaid,
.member-status.pending {
  color: #d03050;
}

.mode-switch-bar {
  margin-bottom: 16px;
}
.btn-switch-mode {
  background: transparent;
  border: none;
  color: var(--tg-theme-link-color, #248bcf);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.disabled-action-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn-disabled {
  width: 100%;
  padding: 16px;
  border-radius: 14px;
  border: none;
  font-size: 15px;
  font-weight: 700;
  background: #e0e0e6;
  color: #a1a1a9;
  cursor: not-allowed;
}
.permission-tip {
  font-size: 13px;
  color: var(--tg-theme-hint-color, #8e8e93);
  margin: 0;
  text-align: center;
}

.pay-action-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gas-tip {
  font-size: 12px;
  color: var(--tg-theme-hint-color, #8e8e93);
  margin: 0;
  line-height: 1.35;
  text-align: left;
}
.btn-pay {
  width: 100%;
  padding: 16px;
  border-radius: 14px;
  border: none;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  background: var(--tg-theme-button-color, #248bcf);
  color: var(--tg-theme-button-text-color, #ffffff);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: opacity 0.2s;
}
.btn-pay:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.confirming-text {
  color: var(--tg-theme-link-color, #248bcf);
  font-weight: 600;
  font-size: 14px;
  padding: 12px 0;
}
.success-text {
  color: #18a058;
  font-weight: 700;
  font-size: 16px;
  padding: 12px 0;
}
.error-text {
  color: #d03050;
  font-weight: 600;
  font-size: 14px;
  padding: 12px 0;
}
.loading-box,
.empty-box,
.error-box {
  text-align: center;
  padding: 40px 20px;
  color: var(--tg-theme-hint-color, #8e8e93);
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(0, 0, 0, 0.06);
  border-top-color: var(--tg-theme-button-color, #248bcf);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 20px auto;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.connect-action-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.connect-hint {
  font-size: 13px;
  color: var(--tg-theme-hint-color, #8e8e93);
  margin: 0;
}
.btn-connect {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--tg-theme-button-color, #248bcf);
  background: transparent;
  color: var(--tg-theme-button-color, #248bcf);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-connect:active {
  background: rgba(36, 139, 207, 0.08);
}
</style>
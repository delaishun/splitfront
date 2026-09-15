// splitapp/src/services/api.ts
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { Address } from '@ton/core';
import { initData as tmaInitData, retrieveLaunchParams } from '@tma.js/sdk-vue';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://spappb.solpethouse.top';

console.log('[API Init] 🚀 初始化 Axios 实例，BASE_URL:', API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const INIT_DATA_CACHE_KEY = 'sp_tg_init_data_cache';

export const safeFullyDecode = (str: string): string => {
  if (!str) return '';
  let current = str;
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
};

export const normalizeAddress = (rawAddress?: string | null): string | null => {
  if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
    return null;
  }
  try {
    const parsed = Address.parse(rawAddress.trim());
    return parsed.toString({ bounceable: false });
  } catch (err) {
    console.warn(`[Address Normalizer Warning] ⚠️ 无法解析 TON 地址 [${rawAddress}], 保留原值:`, err);
    return rawAddress.trim();
  }
};

export const toRawAddress = (rawAddress?: string | null): string | null => {
  if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
    return null;
  }
  try {
    const parsed = Address.parse(rawAddress.trim());
    return parsed.toRawString().toLowerCase();
  } catch (err) {
    console.warn(`[Address Raw Normalizer Warning] ⚠️ 无法解析 TON Raw 地址 [${rawAddress}], 保留原值:`, err);
    return rawAddress.trim().toLowerCase();
  }
};

export const parseUserIdFromInitData = (initDataStr: string): string => {
  if (!initDataStr) return 'UNKNOWN';
  try {
    const decodedStr = safeFullyDecode(initDataStr);
    const searchParams = new URLSearchParams(decodedStr);
    const userJson = searchParams.get('user');
    if (userJson) {
      const userObj = JSON.parse(userJson);
      return userObj.id ? String(userObj.id) : 'UNKNOWN';
    }
  } catch (e) {}
  return 'UNKNOWN';
};

export const getTelegramInitData = (): string => {
  if (typeof window !== 'undefined') {
    const spInitData = (window as any).__SP_INIT_DATA__;
    if (spInitData && typeof spInitData === 'string' && spInitData.trim()) {
      const raw = safeFullyDecode(spInitData.trim());
      console.log(`[API Auth Debug] 🟢 来源 1 命中 - window.__SP_INIT_DATA__ (User ID: ${parseUserIdFromInitData(raw)})`);
      try {
        sessionStorage.setItem(INIT_DATA_CACHE_KEY, raw);
      } catch (e) {}
      return raw;
    }
    const tgWebApp = (window as any).Telegram?.WebApp;
    if (tgWebApp?.initData && typeof tgWebApp.initData === 'string' && tgWebApp.initData.trim()) {
      const raw = safeFullyDecode(tgWebApp.initData.trim());
      console.log(`[API Auth Debug] 🟢 来源 2 命中 - Telegram.WebApp.initData (User ID: ${parseUserIdFromInitData(raw)})`);
      try {
        sessionStorage.setItem(INIT_DATA_CACHE_KEY, raw);
      } catch (e) {}
      return raw;
    }
  }
  try {
    if (tmaInitData) {
      const rawVal = typeof tmaInitData.raw === 'function' ? (tmaInitData.raw as any)() : tmaInitData.raw;
      if (typeof rawVal === 'string' && rawVal.trim()) {
        const raw = safeFullyDecode(rawVal.trim());
        console.log(`[API Auth Debug] 🟢 来源 3 命中 - @tma.js/sdk-vue initData (User ID: ${parseUserIdFromInitData(raw)})`);
        try {
          sessionStorage.setItem(INIT_DATA_CACHE_KEY, raw);
        } catch (e) {}
        return raw;
      }
    }
  } catch (e) {}
  try {
    const launchParams = retrieveLaunchParams();
    if (typeof launchParams.initDataRaw === 'string' && launchParams.initDataRaw.trim()) {
      const raw = safeFullyDecode(launchParams.initDataRaw.trim());
      console.log(`[API Auth Debug] 🟢 来源 4 命中 - retrieveLaunchParams().initDataRaw (User ID: ${parseUserIdFromInitData(raw)})`);
      try {
        sessionStorage.setItem(INIT_DATA_CACHE_KEY, raw);
      } catch (e) {}
      return raw;
    }
  } catch (e) {}
  if (typeof window !== 'undefined') {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const searchData = searchParams.get('tgWebAppData');
      if (searchData && searchData.trim()) {
        const raw = safeFullyDecode(searchData.trim());
        console.log(`[API Auth Debug] 🟢 来源 5 命中 - URL Search Query (User ID: ${parseUserIdFromInitData(raw)})`);
        try {
          sessionStorage.setItem(INIT_DATA_CACHE_KEY, raw);
        } catch (e) {}
        return raw;
      }
    } catch (e) {}
    try {
      const rawHash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(rawHash);
      const hashData = hashParams.get('tgWebAppData');
      if (hashData && hashData.trim()) {
        const raw = safeFullyDecode(hashData.trim());
        console.log(`[API Auth Debug] 🟢 来源 6 命中 - URL Hash Parameter (User ID: ${parseUserIdFromInitData(raw)})`);
        try {
          sessionStorage.setItem(INIT_DATA_CACHE_KEY, raw);
        } catch (e) {}
        return raw;
      }
    } catch (e) {}
    try {
      const match = window.location.href.match(/tgWebAppData=([^&|#]+)/);
      if (match && match[1]) {
        const raw = safeFullyDecode(decodeURIComponent(match[1]).trim());
        console.log(`[API Auth Debug] 🟢 来源 7 命中 - URL 正则表达式匹配 (User ID: ${parseUserIdFromInitData(raw)})`);
        try {
          sessionStorage.setItem(INIT_DATA_CACHE_KEY, raw);
        } catch (e) {}
        return raw;
      }
    } catch (e) {}
    try {
      const cached = sessionStorage.getItem(INIT_DATA_CACHE_KEY);
      if (cached && cached.trim()) {
        const raw = safeFullyDecode(cached.trim());
        console.log(`[API Auth Debug] 🟡 来源 8 命中 - SessionStorage 缓存兜底 (User ID: ${parseUserIdFromInitData(raw)})`);
        return raw;
      }
    } catch (e) {}
  }
  console.warn('[API Auth Warning] 🔴 ⚠️ 未检测到任何可用的 initData，后端可能无法确认用户身份并返回 401！');
  return '';
};

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    (config as any)._requestStartTime = Date.now();
    let existingHeader = '';
    if (config.headers) {
      if (typeof config.headers.get === 'function') {
        existingHeader = (config.headers.get('X-TG-Init-Data') as string) || '';
      } else {
        existingHeader = (config.headers['X-TG-Init-Data'] as string) || '';
      }
    }
    let initDataStr = typeof existingHeader === 'string' ? existingHeader.trim() : '';
    if (!initDataStr) {
      initDataStr = getTelegramInitData();
    } else {
      initDataStr = safeFullyDecode(initDataStr);
    }
    const currentUserIdInHeader = parseUserIdFromInitData(initDataStr);
    if (initDataStr) {
      const authHeaderValue = `tma ${initDataStr}`;
      if (config.headers && typeof config.headers.set === 'function') {
        config.headers.set('Authorization', authHeaderValue);
        config.headers.set('X-TG-Init-Data', initDataStr);
        config.headers.set('x-tg-init-data', initDataStr);
      } else if (config.headers) {
        config.headers['Authorization'] = authHeaderValue;
        config.headers['X-TG-Init-Data'] = initDataStr;
        config.headers['x-tg-init-data'] = initDataStr;
      }
    } else {
      console.warn(
        `[API Auth Critical Warning]: 请求 [${config.method?.toUpperCase()} ${config.url}] 未能提取到 Telegram initData，将极大概率触发 401 Unauthorized！`
      );
    }
    console.log(`[API Request Header check] 📤 ${config.method?.toUpperCase()} -> ${config.url}`, {
      parsedUserId: currentUserIdInHeader,
      headers: {
        'Authorization': initDataStr ? `tma ${initDataStr.substring(0, 20)}...` : 'MISSING',
        'X-TG-Init-Data': initDataStr ? `${initDataStr.substring(0, 35)}... (长度: ${initDataStr.length})` : 'MISSING',
      },
      data: config.data || null,
      params: config.params || null,
    });
    return config;
  },
  (error) => {
    console.error('[API Request Error] 请求构建产生异常:', error);
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    const startTime = (response.config as any)._requestStartTime;
    const duration = startTime ? `${Date.now() - startTime}ms` : 'unknown';
    console.log(
      `[API Response] 📥 ${response.config.method?.toUpperCase()} ${response.config.url} [Status: ${response.status}] (${duration})`,
      response.data
    );
    return response;
  },
  (error) => {
    const config = error.config || {};
    const startTime = config._requestStartTime;
    const duration = startTime ? `${Date.now() - startTime}ms` : 'unknown';
    if (error.response) {
      console.error(
        `[API Error] ❌ ${config.method?.toUpperCase()} ${config.url} [Status: ${error.response.status}] (${duration})`,
        {
          responseData: error.response.data,
          headers: error.response.headers,
        }
      );
      if (error.response.status === 400) {
        console.error(
          '[API Schema Error] ⚠️ 400 Bad Request: 传入参数未通过后端 JSON Schema 校验！',
          {
            ajvErrors: error.response.data?.errors || error.response.data?.message || error.response.data,
            submittedBody: config.data ? JSON.parse(config.data) : null,
          }
        );
      } else if (error.response.status === 401) {
        console.warn('[API Auth Error] 🔐 401 Unauthorized: Telegram 验签失败！请检查前端请求头中的 initData 是否正确传达给后端，或后端 Telegram Bot Token 是否匹配。');
      }
    } else if (error.request) {
      console.error(`[API Network Error] 📡 请求发出但无响应: ${config.method?.toUpperCase()} ${config.url} (${duration})`, error.message);
    } else {
      console.error('[API Internal Error] ⚠️ 请求创建发生异常:', error.message);
    }
    return Promise.reject(error);
  }
);

export interface NotifyPaymentPayload {
  boc?: string;
  txHash?: string;
  tx_hash?: string;
  finalTxHash?: string;
  payerAddress?: string;
  payer_address?: string;
  normalizedPayer?: string;
  payerAddressRaw?: string;
  payer_address_raw?: string;
  payeeAddress?: string;
  payee_address?: string;
}

export interface BindWalletParams {
  walletAddress?: string | null;
  address?: string | null;
  wallet_address?: string | null;
  initData?: string;
  walletAddressRaw?: string | null;
  wallet_address_raw?: string | null;
}

export interface BillMember {
  id: number;
  billId?: string | number;
  bill_id?: string | number;
  userTgId?: string | number;
  user_tg_id?: string | number;
  payerUsername?: string;
  payer_username?: string;
  username?: string;
  payerName?: string;
  payer_name?: string;
  payerAddress?: string | null;
  payer_address?: string | null;
  walletAddressRaw?: string | null;
  wallet_address_raw?: string | null;
  amountDue?: string | number;
  amount_due?: string | number;
  amountPaid?: string | number;
  amount_paid?: string | number;
  amount?: string | number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'SUCCESS' | string;
  hasPaid?: boolean;
  has_paid?: boolean;
  txHash?: string;
  tx_hash?: string;
  paidAt?: string;
  paid_at?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface BillDetails {
  id: string | number;
  billId?: string | number;
  bill_id?: string | number;
  chatId?: string | number;
  chat_id?: string | number;
  creatorId?: string | number;
  creator_id?: string | number;
  amountPerPerson?: string | number;
  amount_per_person?: string | number;
  /** @deprecated 请使用 amountPerPerson 或 amount_per_person */
  totalAmount?: string | number;
  /** @deprecated 请使用 amountPerPerson 或 amount_per_person */
  total_amount?: string | number;
  amount?: string | number;
  originalAmount?: number | string;
  original_amount?: number | string;
  collectedAmount?: string | number;
  collected_amount?: string | number;
  paidAmount?: string | number;
  paid_amount?: string | number;
  status: 'PENDING' | 'ACTIVE' | 'SUCCESS' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED' | 'PAID' | string;
  myStatus?: 'UNPAID' | 'PARTIAL' | 'PAID' | string;
  hasPaid?: boolean;
  has_paid?: boolean;
  memberCount?: number;
  member_count?: number;
  paidMembersCount?: number;
  paid_members_count?: number;
  totalPaidMembers?: number;
  payeeAddress: string | null;
  payee_address?: string | null;
  payerAddress?: string | null;
  payer_address?: string | null;
  groupOwnerTgId?: string | number | null;
  group_owner_tg_id?: string | number | null;
  comment: string;
  description?: string;
  members?: BillMember[];
  bill_members?: BillMember[];
  paidMembers?: BillMember[];
  paid_members?: BillMember[];
  payments?: BillMember[];
  paymentList?: BillMember[];
  records?: BillMember[];
  boundWalletAddress?: string | null;
  userWalletAddress?: string | null;
  user_wallet_address?: string | null;
  walletAddress?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface HistoryRecord {
  id: string | number;
  billId: string | number;
  bill_id?: string | number;
  amount: string;
  description?: string;
  comment?: string;
  status: 'PENDING' | 'SUCCESS' | 'COMPLETED' | 'EXPIRED' | 'PAID' | string;
  payeeAddress?: string | null;
  payee_address?: string | null;
  payerAddress?: string | null;
  payer_address?: string | null;
  txHash?: string;
  tx_hash?: string;
  createdAt: string;
  created_at?: string;
}

export interface UserInfoResponse {
  success: boolean;
  isBound: boolean;
  walletAddress: string | null;
  walletAddressRaw?: string | null;
  user?: {
    id: number;
    telegramId?: string | number;
    telegram_id?: string | number;
    username?: string;
  };
}

export const api = {
  async getBillDetails(
    billId: string | number,
    customInitData?: string
  ): Promise<{ success: boolean; data: BillDetails; bill?: BillDetails; hasPaid?: boolean; myStatus?: string }> {
    console.log(`[API Method] api.getBillDetails -> 开始请求账单详情 billId: ${billId}`);
    const activeInitData = customInitData || getTelegramInitData();
    const currentUserId = parseUserIdFromInitData(activeInitData);
    const response = await apiClient.get(`/bills/${billId}`, {
      ...(customInitData ? { headers: { 'X-TG-Init-Data': safeFullyDecode(customInitData), 'Authorization': `tma ${safeFullyDecode(customInitData)}` } } : {}),
    });
    const rootData = response.data || {};
    const rawData = response.data?.data || response.data?.bill || response.data;
    const billData: BillDetails = rawData;
    if (billData) {
      billData.id = billData.id || billData.billId || billData.bill_id || billId;
      const payee = billData.payeeAddress || billData.payee_address;
      const payer = billData.payerAddress || billData.payer_address;
      billData.payeeAddress = normalizeAddress(payee);
      billData.payerAddress = normalizeAddress(payer);
      if (billData.boundWalletAddress) {
        billData.boundWalletAddress = normalizeAddress(billData.boundWalletAddress);
      }
      if (billData.userWalletAddress) {
        billData.userWalletAddress = normalizeAddress(billData.userWalletAddress);
      }
      if (billData.user_wallet_address) {
        billData.user_wallet_address = normalizeAddress(billData.user_wallet_address);
      }
      if (billData.walletAddress) {
        billData.walletAddress = normalizeAddress(billData.walletAddress);
      }
      const allRawMembers = [
        ...(Array.isArray(billData.members) ? billData.members : []),
        ...(Array.isArray(billData.bill_members) ? billData.bill_members : []),
        ...(Array.isArray(billData.paidMembers) ? billData.paidMembers : []),
        ...(Array.isArray(billData.paid_members) ? billData.paid_members : []),
        ...(Array.isArray(billData.payments) ? billData.payments : []),
        ...(Array.isArray(billData.paymentList) ? billData.paymentList : []),
        ...(Array.isArray(billData.records) ? billData.records : []),
      ];
      const uniqueMembersMap = new Map<string, BillMember>();
      allRawMembers.forEach((m: any, idx) => {
        if (!m) return;
        const key = m.id ? String(m.id) : (m.userTgId || m.user_tg_id || m.txHash || m.tx_hash || `idx_${idx}`);
        const cleanMember: BillMember = {
          ...m,
          payerAddress: normalizeAddress(m.payerAddress || m.payer_address),
          payer_address: normalizeAddress(m.payer_address || m.payerAddress),
          walletAddressRaw: toRawAddress(m.walletAddressRaw || m.wallet_address_raw || m.payerAddress || m.payer_address),
          wallet_address_raw: toRawAddress(m.wallet_address_raw || m.walletAddressRaw || m.payer_address || m.payerAddress),
          status: (m.status || '').toUpperCase()
        };
        uniqueMembersMap.set(String(key), cleanMember);
      });
      const normalizedMembersList = Array.from(uniqueMembersMap.values());
      billData.members = normalizedMembersList;
      billData.bill_members = normalizedMembersList;
      const paidMembersList = normalizedMembersList.filter(
        (m) => m.status === 'PAID' || m.status === 'SUCCESS' || m.status === 'COMPLETED' || m.hasPaid || m.has_paid
      );
      billData.paidMembers = paidMembersList;
      billData.paid_members = paidMembersList;
      billData.payments = paidMembersList;
      let myMemberRecord: BillMember | undefined;
      if (currentUserId && currentUserId !== 'UNKNOWN') {
        myMemberRecord = normalizedMembersList.find(
          m => String(m.userTgId || m.user_tg_id) === String(currentUserId)
        );
      }
      let isPaid = false;
      if (myMemberRecord) {
        isPaid = (
          myMemberRecord.status === 'PAID' ||
          myMemberRecord.status === 'SUCCESS' ||
          myMemberRecord.hasPaid === true ||
          myMemberRecord.has_paid === true
        );
      } else {
        const rootHasPaid = rootData.hasPaid ?? rootData.has_paid;
        if (typeof rootHasPaid === 'boolean') {
          isPaid = rootHasPaid;
        }
      }
      const calculatedPaidCount = paidMembersList.length;
      const countFromApi = billData.paidMembersCount ?? billData.paid_members_count ?? billData.totalPaidMembers ?? billData.memberCount ?? billData.member_count;
      billData.paidMembersCount = Math.max(calculatedPaidCount, typeof countFromApi === 'number' ? countFromApi : 0);
      billData.totalPaidMembers = billData.paidMembersCount;
      billData.memberCount = billData.paidMembersCount;
      billData.hasPaid = isPaid;
      billData.has_paid = isPaid;
      billData.myStatus = isPaid ? 'PAID' : (myMemberRecord ? myMemberRecord.status : 'UNPAID');
      console.log(`[API Method Result] api.getBillDetails -> 成功解析并校准个人支付状态:`, {
        billId: billData.id,
        amountPerPerson: billData.amountPerPerson ?? billData.amount_per_person ?? billData.amount,
        payeeAddress: billData.payeeAddress,
        comment: billData.comment,
        paidMembersCount: billData.paidMembersCount,
        currentUserId,
        myStatus: billData.myStatus,
        hasPaid: billData.hasPaid,
      });
    }
    return response.data;
  },

  async getBillDetail(billId: string | number, customInitData?: string) {
    return this.getBillDetails(billId, customInitData);
  },

  async notifyPayment(
    billId: string | number,
    payload?: NotifyPaymentPayload,
    customInitData?: string
  ): Promise<{ success: boolean; message: string; alreadyPaid?: boolean }> {
    const rawTxHash = payload?.txHash || payload?.tx_hash || payload?.finalTxHash || '';
    const rawPayer = payload?.payerAddress || payload?.payer_address || payload?.normalizedPayer || '';
    const normalizedPayerAddr = normalizeAddress(rawPayer) || rawPayer;
    const finalPayload: Record<string, any> = {
      ...payload,
      boc: payload?.boc || '',
      txHash: rawTxHash,
      tx_hash: rawTxHash,
      finalTxHash: rawTxHash,
      payerAddress: normalizedPayerAddr,
      payer_address: normalizedPayerAddr,
      normalizedPayer: normalizedPayerAddr,
      payerAddressRaw: payload?.payerAddressRaw || payload?.payer_address_raw || toRawAddress(normalizedPayerAddr) || '',
      payer_address_raw: payload?.payer_address_raw || payload?.payerAddressRaw || toRawAddress(normalizedPayerAddr) || '',
    };
    console.log(`[API Method] api.notifyPayment -> 开始上报支付状态 billId: ${billId}`, finalPayload);
    const response = await apiClient.post(`/bills/${billId}/notify`, finalPayload, {
      ...(customInitData ? { headers: { 'X-TG-Init-Data': safeFullyDecode(customInitData), 'Authorization': `tma ${safeFullyDecode(customInitData)}` } } : {}),
    });
    console.log(`[API Method Result] api.notifyPayment -> 上报响应成功`, response.data);
    return response.data;
  },

  async getHistory(
    type: 'received' | 'paid',
    customInitData?: string
  ): Promise<{ success: boolean; data: HistoryRecord[] }> {
    console.log(`[API Method] api.getHistory -> 开始查询历史列表, 类型: ${type}`);
    const response = await apiClient.get(`/history/${type}`, {
      ...(customInitData ? { headers: { 'X-TG-Init-Data': safeFullyDecode(customInitData), 'Authorization': `tma ${safeFullyDecode(customInitData)}` } } : {}),
    });
    const list: HistoryRecord[] = response.data?.data || [];
    console.log(`[API Method Result] api.getHistory -> 获取到 ${list.length} 条历史记录`);
    return response.data;
  },

  async bindWallet(
    arg1: string | BindWalletParams | null,
    customInitData?: string
  ): Promise<{ success: boolean; message: string; data?: any }> {
    let rawInputAddress = '';
    let explicitRaw = '';
    let initDataStr = customInitData || getTelegramInitData();
    if (typeof arg1 === 'object' && arg1 !== null) {
      rawInputAddress = arg1.walletAddress || arg1.address || arg1.wallet_address || '';
      explicitRaw = arg1.walletAddressRaw || arg1.wallet_address_raw || '';
      if (arg1.initData) initDataStr = arg1.initData;
    } else if (typeof arg1 === 'string') {
      rawInputAddress = arg1;
    }
    initDataStr = safeFullyDecode(initDataStr);
    console.log('[API Method] api.bindWallet -> 入参提取校验:', {
      rawInputAddress,
      explicitRaw,
      parsedUserId: parseUserIdFromInitData(initDataStr),
      hasInitData: Boolean(initDataStr)
    });
    if (!rawInputAddress || !rawInputAddress.trim()) {
      console.error('[API Method Error] api.bindWallet 校验失败: walletAddress 为空');
      throw new Error('Wallet address is required for binding');
    }
    const normalizedWallet = normalizeAddress(rawInputAddress) || rawInputAddress.trim();
    const rawWallet = explicitRaw || toRawAddress(rawInputAddress) || rawInputAddress.trim();
    const payload: Record<string, string> = {};
    if (typeof normalizedWallet === 'string' && normalizedWallet.trim()) {
      const cleanNorm = normalizedWallet.trim();
      payload.walletAddress = cleanNorm;
      payload.wallet_address = cleanNorm;
      payload.address = cleanNorm;
    }
    if (typeof rawWallet === 'string' && rawWallet.trim()) {
      const cleanRaw = rawWallet.trim();
      payload.walletAddressRaw = cleanRaw;
      payload.wallet_address_raw = cleanRaw;
    }
    console.log('[API Method Payload Check] 📤 api.bindWallet 准备发送 POST /users/bind Body:', {
      payload,
      headers: {
        'X-TG-Init-Data': initDataStr ? `${initDataStr.substring(0, 30)}...` : 'MISSING',
      }
    });
    const response = await apiClient.post('/users/bind', payload, {
      headers: {
        ...(initDataStr ? {
          'X-TG-Init-Data': initDataStr,
          'x-tg-init-data': initDataStr,
          'Authorization': `tma ${initDataStr}`
        } : {}),
      },
    });
    if (response.data?.data?.walletAddress) {
      response.data.data.walletAddress = normalizeAddress(response.data.data.walletAddress);
    }
    console.log('[API Method Result] api.bindWallet -> 绑定成功响应:', response.data);
    return response.data;
  },

  async syncWalletAddress(
    address: string | BindWalletParams | null,
    customInitData?: string
  ) {
    console.log('[API Method] api.syncWalletAddress 触发 -> 转调 api.bindWallet');
    return this.bindWallet(address, customInitData);
  },

  async fetchUserInfo(customInitData?: string): Promise<UserInfoResponse> {
    console.log('[API Method] api.fetchUserInfo -> 开始获取当前用户信息与角色权限...');
    const response = await apiClient.get('/users/me', {
      ...(customInitData ? { headers: { 'X-TG-Init-Data': safeFullyDecode(customInitData), 'Authorization': `tma ${safeFullyDecode(customInitData)}` } } : {}),
    });
    const resData: UserInfoResponse = response.data || {};
    const rawWallet = resData.walletAddress;
    const normalizedWallet = normalizeAddress(rawWallet);
    resData.walletAddress = normalizedWallet;
    resData.walletAddressRaw = toRawAddress(rawWallet) || undefined;
    resData.isBound = Boolean(normalizedWallet);
    console.log('[API Method Result] api.fetchUserInfo -> 成功获取用户状态:', {
      rawWallet,
      normalizedWallet: normalizedWallet || '未绑定',
      isBound: resData.isBound,
      telegramId: resData.user?.telegramId || resData.user?.telegram_id || 'N/A',
    });
    return resData;
  },

  /**
   * ✅ 新增：获取当前用户的绑定状态（简化版）
   * 内部调用 fetchUserInfo，提取绑定状态和钱包地址
   */
  async getBindStatus(customInitData?: string): Promise<{ isBound: boolean; walletAddress: string | null; walletAddressRaw: string | null }> {
    const userInfo = await this.fetchUserInfo(customInitData);
    return {
      isBound: userInfo.isBound || false,
      walletAddress: userInfo.walletAddress || null,
      walletAddressRaw: userInfo.walletAddressRaw || null,
    };
  },

  /**
   * 💡 获取账单支付明细（用于统计页）
   * 调用 GET /bills/:billId/payments 接口，返回账单信息、汇总和付款明细（含付款人用户名）
   */
  async getBillPayments(
    billId: string | number,
    customInitData?: string
  ): Promise<{ success: boolean; data: any; message?: string }> {
    console.log(`[API Method] api.getBillPayments -> 开始请求账单支付明细 billId: ${billId}`);
    const response = await apiClient.get(`/bills/${billId}/payments`, {
      ...(customInitData ? { headers: { 'X-TG-Init-Data': safeFullyDecode(customInitData), 'Authorization': `tma ${safeFullyDecode(customInitData)}` } } : {}),
    });
    return response.data;
  },
};

export const bindWallet = api.bindWallet;
export const syncWalletAddress = api.syncWalletAddress.bind(api);
export const fetchUserInfo = api.fetchUserInfo;
export const getBillDetails = api.getBillDetails;
export const getBillDetail = api.getBillDetail.bind(api);
export const notifyPayment = api.notifyPayment;
export const getHistory = api.getHistory;
export const getBillPayments = api.getBillPayments;
// ✅ 新增导出
export const getBindStatus = api.getBindStatus.bind(api);

export default api;
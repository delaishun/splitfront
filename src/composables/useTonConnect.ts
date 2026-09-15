// src/composables/useTonConnect.ts
import { ref } from 'vue';
import { TonConnectUI, type SendTransactionRequest } from '@tonconnect/ui';
import { beginCell, Address, Cell, toNano } from '@ton/core';
import { storePayMessage, type PayMessage, PaymentSplitter_opcodes } from '../contracts/PaymentSplitter';
import { api, getTelegramInitData, toRawAddress } from '../services/api';
import { toUserFriendlyAddress } from '../helperts/address';

// ✅ 新增：导入 TonClient 和 PaymentSplitter 用于查询合约状态
import { TonClient } from '@ton/ton';
import { PaymentSplitter } from '../contracts/PaymentSplitter';

// 平台 PaymentSplitter 最新合约地址
const PAYMENT_SPLITTER_CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

/**
 * ✅ 零地址常量：用于群主未绑定钱包时传递给合约
 * 合约收到零地址时会判断群主未绑定，将群主佣金合并到平台费用一起发送
 * 此常量导出供其他组件（如 IndexPage.vue）使用，确保前后端零地址定义一致
 */
export const ZERO_ADDRESS = '0:0000000000000000000000000000000000000000000000000000000000000000';

/**
 * 💡 Tact 自动生成的 PayMessage 操作码 (Opcode)
 */
const PAY_MESSAGE_OPCODE = (PaymentSplitter_opcodes as any)?.PayMessage;

if (!PAYMENT_SPLITTER_CONTRACT_ADDRESS) {
  console.warn(
    '[TonConnect Init] ⚠️ 未检测到 VITE_CONTRACT_ADDRESS 环境变量，请确保 .env 文件中已配置！'
  );
}

// ✅ 合约地址常量（用于查询 isActive，优先使用环境变量）
const CONTRACT_ADDRESS = PAYMENT_SPLITTER_CONTRACT_ADDRESS;

// ✅ 新增：合约开关状态（响应式）
const isContractActive = ref(true);
const isCheckingContract = ref(false);

// 其他状态
const isConnected = ref(false);
const isBinding = ref(false);
const isBound = ref(false);
const walletAddress = ref<string | null>(null);
const rawWalletAddress = ref<string | null>(null);
const userFriendlyAddress = ref<string | null>(null);
const connectUrl = ref<string>('');
const tonConnectUIInstance = ref<TonConnectUI | null>(null);

/**
 * 🔒 核心并发防护：全局请求互锁 Promise
 * 防止 onStatusChange 或初始化阶段重复/并发发起 POST /users/bind 请求
 */
let syncPromise: Promise<boolean> | null = null;

/**
 * 💡 辅助工具：同步阻塞式确保获取到有效的 Telegram InitData
 * 若提取为空，会尝试微轮询等待 TMA 初始化（最多等待 1.5 秒），解决 TMA 初始化延迟造成的凭证缺失问题
 */
async function waitForValidInitData(maxWaitMs: number = 1500): Promise<string> {
  const startTime = Date.now();
  let initDataStr = getTelegramInitData();

  if (initDataStr) {
    return initDataStr;
  }

  console.warn('[TonConnect InitGuard] ⏳ 初始时刻未获取到 initData，进入同步阻塞等待/轮询中...');

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    initDataStr = getTelegramInitData();
    if (initDataStr) {
      console.log(`[TonConnect InitGuard] 🟢 延迟轮询成功捕获到 initData (耗时 ${Date.now() - startTime}ms)`);
      return initDataStr;
    }
  }

  console.error(`[TonConnect InitGuard] 🔴 在 ${maxWaitMs}ms 内未能同步获取到有效的 Telegram InitData！`);
  return '';
}

/**
 * 💡 辅助工具：向后端同步绑定当前连接的钱包地址 (带有并发 Request Locking 互锁机制)
 */
async function syncWalletAddressToBackend(address: string, walletAddressRaw?: string): Promise<boolean> {
  // 🛡️ 如果已有相同/正在进行的绑定请求，复用现有的 Promise 阻止并发重复请求
  if (syncPromise) {
    console.warn('[TonConnect SyncLock] 🔒 检测到正在进行的绑定请求，互锁激活：复用既有 Promise，拦截重复请求');
    return syncPromise;
  }

  syncPromise = (async () => {
    const normalized = toUserFriendlyAddress(address, 'SyncWallet');
    const rawAddr = walletAddressRaw || toRawAddress(address) || address;

    if (!normalized) {
      console.warn('[TonConnect Sync] ⚠️ 地址提取/标准化转换为空，取消同步', { rawInput: address });
      return false;
    }

    // 🛡️ 核心防护 1：同步阻塞校验/轮询 Telegram initData 凭证
    const activeInitData = await waitForValidInitData(1500);
    if (!activeInitData) {
      console.error(
        '%c[TonConnect Sync] 🔴 绑定中断: 无法在限时内拦截到有效的 X-TG-Init-Data 身份凭证！放弃绑定以防 401/400 报错。',
        'background: #330000; color: #ff3333; font-weight: bold; font-size: 13px; padding: 4px;'
      );
      isBound.value = false;
      
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.showAlert) {
        (window as any).Telegram.WebApp.showAlert('Telegram credentials are still loading. Please try connecting your wallet again in a moment.');
      }
      return false;
    }

    isBinding.value = true;

    // -------------------------------------------------------------------------
    // 精炼清洗 Body
    // -------------------------------------------------------------------------
    const cleanNormalized = (normalized || '').trim();
    const cleanRawAddr = (rawAddr || cleanNormalized).trim();

    const payload: Record<string, string> = {};
    if (cleanNormalized) {
      payload.walletAddress = cleanNormalized;
      payload.wallet_address = cleanNormalized;
      payload.address = cleanNormalized;
    }
    if (cleanRawAddr) {
      payload.walletAddressRaw = cleanRawAddr;
      payload.wallet_address_raw = cleanRawAddr;
    }

    console.log('[TonConnect Sync] 🔄 准备向后端 POST /users/bind 同步绑定钱包地址:', {
      rawInput: address,
      normalized: cleanNormalized,
      rawAddress: cleanRawAddr,
      payloadDetail: payload
    });

    try {
      console.log('[TonConnect Sync] 📤 发起 /users/bind 纯净 Payload JSON:', JSON.stringify(payload));
      
      // 传入清洗后的 payload 与 Telegram initData Header 凭证
      const res = await api.bindWallet(payload, activeInitData);
      
      const success = Boolean(
        res && (res.success || (res as any).isBound || (res as any).is_bound || (res as any).data?.isBound)
      );

      if (success) {
        isBound.value = true;
        console.log(
          '%c[TonConnect Sync] ✅ 钱包地址成功同步并绑定到后端 DB users 表:',
          'color: #00ff66; font-weight: bold;',
          res
        );
      } else {
        isBound.value = false;
        console.error('[TonConnect Sync] ❌ 钱包同步后端返回失败状态:', res);
      }
      return success;
    } catch (error: any) {
      isBound.value = false;
      const status = error?.response?.status;
      const responseData = error?.response?.data;

      console.error(
        `[TonConnect Sync] ❌ 同步钱包地址到后端捕获异常 [HTTP Status: ${status || 'Network Error'}]:`,
        {
          status,
          responseData,
          errorMessage: error?.message,
          errorStack: error?.stack,
        }
      );

      if (status === 400) {
        console.error(
          '[TonConnect Sync AJV Diagnostic] 🚨 POST /users/bind 报 400 Bad Request！',
          { responseData, submittedPayload: payload }
        );
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.showAlert) {
          (window as any).Telegram.WebApp.showAlert(`Invalid binding parameters (${responseData?.message || '400 Bad Request'})`);
        }
      } else if (status >= 500) {
        console.warn('[TonConnect Sync] ⚠️ 后端服务暂不可用 (500/502/504)，已执行软降级处理');
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.showAlert) {
          (window as any).Telegram.WebApp.showAlert('The server is temporarily unavailable. Your wallet is connected, but identity sync may be delayed.');
        }
      } else if (status === 401) {
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.showAlert) {
          (window as any).Telegram.WebApp.showAlert('Telegram verification expired. Please close and reopen the Mini App.');
        }
      }

      return false;
    } finally {
      isBinding.value = false;
    }
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

/**
 * 💡 内部工具：统一更新响应式状态，并阻塞等待后端 Bind 成功
 */
async function updateWalletState(rawAddress: string | null): Promise<boolean> {
  if (!rawAddress) {
    console.log('[TonConnect State] 🧹 清除本地钱包状态 (DISCONNECTED)');
    isConnected.value = false;
    isBound.value = false;
    isBinding.value = false;
    rawWalletAddress.value = null;
    walletAddress.value = null;
    userFriendlyAddress.value = null;
    return false;
  }

  isConnected.value = true;
  
  const parsedRaw = toRawAddress(rawAddress) || rawAddress;
  const normalized = toUserFriendlyAddress(rawAddress, 'WalletStateUpdate');

  // 如果更换了新的钱包地址，先重置 isBound 标记
  if (walletAddress.value && walletAddress.value !== normalized) {
    isBound.value = false;
  }

  rawWalletAddress.value = parsedRaw;
  walletAddress.value = normalized;
  userFriendlyAddress.value = normalized;

  console.log('[TonConnect State] ⚡ 钱包状态已在前端更新:', {
    rawWalletAddress: parsedRaw,
    walletAddress: normalized,
  });

  if (normalized) {
    return await syncWalletAddressToBackend(normalized, parsedRaw);
  }
  return false;
}

/**
 * 💡 使用 Tact 生成的 storePayMessage 序列化构造 PayMessage BOC
 * 
 * 注意：此函数不关心 groupOwnerAddress 是有效地址还是零地址，
 * 它会原样传递给合约。合约会根据收到的地址判断是否为零地址，
 * 从而决定是分别发送费用（群主已绑定）还是合并发送（群主未绑定）。
 */
function createPayMessageBoc(
  sellerAddress: string,
  groupOwnerAddress: string,
  orderId: string,
  billAmountNano: bigint
): string {
  // 💡 严格去除 orderId (comment) 前后的换行与空格，保证与后端 bills.comment 完全匹配
  const cleanOrderId = (orderId || '').trim();

  // 检查 groupOwnerAddress 是否为零地址，用于日志标注
  const isZeroAddress = groupOwnerAddress.trim() === ZERO_ADDRESS || 
                         groupOwnerAddress.trim() === '0:0000000000000000000000000000000000000000000000000000000000000000';

  console.log('[TonConnect Multi-Member Tracker] ----------------------------------------');
  console.log('[TonConnect Multi-Member Tracker] 🔨 构建开放式分账 PayMessage Payload Cell...');
  console.log('  -> 卖家地址 (Seller):', sellerAddress);
  console.log('  -> 群主地址 (GroupOwner):', groupOwnerAddress, isZeroAddress ? '(零地址 - 群主未绑定，费用将合并到平台地址)' : '');
  console.log('  -> 唯一对账凭证 (comment / orderId):', cleanOrderId);
  console.log('  -> 成员分摊金额 NanoTON:', billAmountNano.toString());

  try {
    const cleanSellerAddress = sellerAddress.trim();
    const cleanGroupOwnerAddress = groupOwnerAddress.trim();

    if (!cleanSellerAddress) {
      throw new Error('Seller address cannot be empty');
    }

    // ✅ 校验群主地址：即使是零地址也需要是有效的 Address 格式
    if (!cleanGroupOwnerAddress) {
      throw new Error('Group owner address cannot be empty');
    }

    // 尝试解析地址，如果群主地址是零地址格式，Address.parse 能正确解析
    const seller = Address.parse(cleanSellerAddress);
    const groupOwner = Address.parse(cleanGroupOwnerAddress);

    const payMessageData: PayMessage = {
      $$type: 'PayMessage',
      seller: seller,
      groupOwner: groupOwner,
      orderId: cleanOrderId,
      billAmount: billAmountNano,
    };

    const cellBuilder = beginCell();
    storePayMessage(payMessageData)(cellBuilder);

    const cell = cellBuilder.endCell();
    const bocBase64 = cell.toBoc().toString('base64');
    const bocHex = cell.toBoc().toString('hex');

    if (PAY_MESSAGE_OPCODE !== undefined) {
      console.log('  -> 🎯 PayMessage Opcode Check:', `0x${PAY_MESSAGE_OPCODE.toString(16)}`);
    }
    console.log('  -> 📊 Cell Bits 长度:', cell.bits.length);
    console.log('  -> ✅ PaymentSplitter PayMessage BOC 构建成功 (Base64):', bocBase64);
    console.log('  -> 🔍 Payload Hex (Scanner 对账校验):', bocHex);
    console.log('[TonConnect Multi-Member Tracker] ----------------------------------------');

    return bocBase64;
  } catch (err: any) {
    console.error('[TonConnect Multi-Member Tracker] ❌ 构造 PayMessage BOC 失败:', err);
    throw new Error(`Failed to parse wallet address or build payload (${err.message || 'invalid format'})`);
  }
}

// ✅ 新增：查询合约 isActive 状态（使用 SDK）
const checkContractActive = async (): Promise<boolean> => {
  if (isCheckingContract.value) {
    // 如果正在查询，直接返回当前缓存值（不重复请求）
    return isContractActive.value;
  }
  isCheckingContract.value = true;
  try {
    const client = new TonClient({
      endpoint: 'https://toncenter.com/api/v2/jsonRPC',
      // 可添加 apiKey 提升限额
    });
    const addr = Address.parse(CONTRACT_ADDRESS);
    const contract = PaymentSplitter.fromAddress(addr);
    const active = await contract.getIsActive(client.provider(addr));
    isContractActive.value = active;
    return active;
  } catch (e) {
    console.warn('[TonConnect] 查询合约状态失败，默认允许支付', e);
    isContractActive.value = true; // 降级：允许支付
    return true;
  } finally {
    isCheckingContract.value = false;
  }
};

export function useTonConnect(): Record<string, any> {
  const initTonConnect = (buttonRootId?: string, twaReturnUrl?: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const manifestUrl =
      import.meta.env.VITE_MANIFEST_URL || `${origin}/tonconnect-manifest.json`;

    const returnUrl =
      twaReturnUrl || import.meta.env.VITE_TWA_RETURN_URL || '';

    console.log('[TonConnect Debug] 🚀 初始化 PaymentSplitter SDK 实例中...', {
      manifestUrl,
      returnUrl,
      buttonRootId,
      contractAddress: PAYMENT_SPLITTER_CONTRACT_ADDRESS,
    });

    let validButtonRootId: string | undefined = undefined;
    if (buttonRootId && typeof document !== 'undefined' && document.getElementById(buttonRootId)) {
      validButtonRootId = buttonRootId;
    } else if (buttonRootId) {
      console.warn(`[TonConnect Debug] ⚠️ 传入的 buttonRootId "${buttonRootId}" 在 DOM 中未找到，跳过挂载按钮。`);
    }

    if (tonConnectUIInstance.value) {
      console.log('[TonConnect Debug] 🔄 检测到已存在的 SDK 实例，复用当前实例');
      if (validButtonRootId) {
        tonConnectUIInstance.value.uiOptions = { buttonRootId: validButtonRootId };
      }
      return tonConnectUIInstance.value;
    }

    const instance = new TonConnectUI({
      manifestUrl,
      buttonRootId: validButtonRootId,
      actionsConfiguration: {
        twaReturnUrl: returnUrl,
      },
      walletsListConfiguration: {
        includeWallets: [
          {
            appName: 'telegram-wallet',
            name: 'Wallet in Telegram',
            imageUrl: 'https://wallet.tg/images/logo-288.png',
            aboutUrl: 'https://wallet.tg',
            universalLink: 'https://t.me/wallet?attach=wallet',
            jsBridgeKey: 'telegram-wallet',
            platforms: ['ios', 'android', 'macos', 'windows', 'linux'],
          },
          {
            appName: 'tonkeeper',
            name: 'Tonkeeper',
            imageUrl: 'https://tonkeeper.com/assets/tonconnect-icon.png',
            aboutUrl: 'https://tonkeeper.com',
            universalLink: 'https://app.tonkeeper.com/ton-connect',
            jsBridgeKey: 'tonkeeper',
            bridgeUrl: 'https://bridge.tonapi.io/bridge',
            platforms: ['ios', 'android', 'chrome', 'firefox'],
          },
        ],
      },
    });

    if (instance.wallet) {
      console.log('[TonConnect Debug] 🟢 发现已预先连接的钱包:', {
        raw: instance.wallet.account.address,
        chain: instance.wallet.account.chain,
      });
      updateWalletState(instance.wallet.account.address);
    }

    instance.onStatusChange(async (wallet) => {
      if (wallet) {
        connectUrl.value = '';
        console.log('[TonConnect Debug] 🟢 钱包连接状态变更 [CONNECTED]:', {
          appName: wallet.device.appName,
          appVersion: wallet.device.appVersion,
          platform: wallet.device.platform,
          rawAddress: wallet.account.address,
          network: wallet.account.chain === '-239' ? 'Mainnet' : 'Testnet/Unknown',
        });
        await updateWalletState(wallet.account.address);
      } else {
        console.log('[TonConnect Debug] 🔴 钱包连接状态变更 [DISCONNECTED]');
        await updateWalletState(null);
      }
    });

    tonConnectUIInstance.value = instance;
    return instance;
  };

  const getTonConnectUI = () => {
    if (!tonConnectUIInstance.value) {
      return initTonConnect();
    }
    return tonConnectUIInstance.value;
  };

  /**
   * ✅ 新增：直接打开钱包连接弹窗（推荐替代模拟点击）
   * 此方法通过 TonConnectUI 的官方 API 打开钱包选择模态框，
   * 在 iOS 上能正确唤起 Tonkeeper 等钱包，避免因影子 DOM 选择器失败导致无反应。
   */
  const connectWallet = async () => {
    const ui = getTonConnectUI();
    if (!ui) {
      // 如果 ui 未初始化，先初始化
      initTonConnect();
    }
    const uiInstance = tonConnectUIInstance.value;
    if (!uiInstance) {
      console.error('[TonConnect] Unable to initialize wallet connection');
      return;
    }
    try {
      // 新版 TonConnectUI 使用 openModal（推荐方式）
      if (typeof uiInstance.openModal === 'function') {
        await uiInstance.openModal();
      } 
      // 降级方案：通过 connector 手动连接（适配旧版本）
      else if (uiInstance.connector && typeof uiInstance.connector.connect === 'function') {
        await uiInstance.connector.connect({
          universalLink: 'https://app.tonkeeper.com/ton-connect',
          bridgeUrl: 'https://bridge.tonapi.io/bridge',
        });
      } else {
        console.warn('[TonConnect] No connect method available');
      }
    } catch (e) {
      console.error('[TonConnect] Failed to open wallet modal:', e);
    }
  };

  /**
   * 💡 向 PaymentSplitter 智能合约拉起分账支付
   * 
   * @param sellerAddress - 卖家（收款人）钱包地址
   * @param groupOwnerAddress - 群主钱包地址，如果是零地址则表示群主未绑定
   * @param amountInNanoton - 账单金额（nanoTON）
   * @param comment - 对账备注（orderId）
   * @returns 交易结果
   */
  const sendPayment = async (
    sellerAddress: string | null | undefined,
    groupOwnerAddress: string | null | undefined,
    amountInNanoton: string | number,
    comment?: string
  ) => {
    console.group('================ [PaymentSplitter 开放式多成员支付发起] ================');

    if (!PAYMENT_SPLITTER_CONTRACT_ADDRESS) {
      console.error('[TonConnect Debug] ❌ 交易终止: 未配置 VITE_CONTRACT_ADDRESS 环境变量');
      console.groupEnd();
      throw new Error('System configuration error: split contract address is not set');
    }

    const ui = getTonConnectUI();
    const isWalletReady = Boolean(ui?.wallet || isConnected.value);

    if (!ui || !isWalletReady) {
      console.error('[TonConnect Debug] ❌ 交易终止: 钱包未连接或 SDK 未初始化');
      console.groupEnd();
      throw new Error('Wallet not connected. Please connect your wallet first.');
    }

    // 🛡️ 核心门禁：强校验阻塞绑定逻辑（无论 isBound 状态如何，再次确保当前用户-钱包对成功绑定）
    const currentConnectedRaw = ui.wallet?.account?.address || rawWalletAddress.value || '';
    if (!isBound.value) {
      console.warn('[TonConnect Security Gate] ⚠️ 监听到钱包尚未与数据库同步绑定，正在拉起强阻塞绑定...');
      if (currentConnectedRaw) {
        const bindSuccess = await updateWalletState(currentConnectedRaw);
        if (!bindSuccess) {
          console.error('[TonConnect Security Gate] ❌ 强阻塞绑定失败，挂起交易以防出现未对账订单');
          console.groupEnd();
          throw new Error('Identity binding is not complete. Please make sure your Telegram verification passes and try again.');
        }
      } else {
        console.error('[TonConnect Security Gate] ❌ 未获取到可用的钱包地址');
        console.groupEnd();
        throw new Error('Please connect and bind your TON wallet first.');
      }
    }

    // 防空与 Comment 清洗归一化
    const actualSellerAddress = sellerAddress?.trim() || PAYMENT_SPLITTER_CONTRACT_ADDRESS;
    
    // ✅ 关键：如果 groupOwnerAddress 为 null 或空字符串，使用 ZERO_ADDRESS
    // 这样合约会识别群主未绑定，将费用合并到平台地址
    let actualGroupOwnerAddress = groupOwnerAddress?.trim() || '';
    if (!actualGroupOwnerAddress) {
      actualGroupOwnerAddress = ZERO_ADDRESS;
      console.log('[TonConnect Payment] ℹ️ 群主地址为空，自动使用零地址（群主未绑定，费用将合并到平台地址）');
    }
    
    const orderId = (comment || '').trim();

    const normalizedSeller = toUserFriendlyAddress(actualSellerAddress, 'SendPayment-Seller');
    const normalizedOwner = toUserFriendlyAddress(actualGroupOwnerAddress, 'SendPayment-Owner');

    console.log('[TonConnect Multi-Member Tracker] 📥 接收与清洗后的交易参数:', {
      rawSellerAddress: sellerAddress,
      normalizedSeller,
      rawGroupOwnerAddress: groupOwnerAddress,
      normalizedOwner,
      isZeroAddress: actualGroupOwnerAddress === ZERO_ADDRESS,
      amountInNanoton,
      commentBillKey: orderId,
      targetPaymentSplitterContract: PAYMENT_SPLITTER_CONTRACT_ADDRESS,
    });

    // 🛡️ 校验支付者与收款人地址是否相同
    try {
      if (currentConnectedRaw && actualSellerAddress) {
        const payerAddressParsed = Address.parse(currentConnectedRaw);
        const payeeAddressParsed = Address.parse(actualSellerAddress);

        if (payerAddressParsed.equals(payeeAddressParsed)) {
          console.error('[TonConnect Debug] ❌ 交易终止: 试图向自己的钱包地址发起支付');
          console.groupEnd();
          throw new Error('You cannot pay a bill to your own wallet address');
        }
      }
    } catch (err: any) {
      if (err.message === 'You cannot pay a bill to your own wallet address') {
        throw err;
      }
      console.warn('[TonConnect Security Check] ⚠️ 校验双方钱包地址时解析异常，忽略并继续运作:', err);
    }

    let parsedContractAddr: Address;
    try {
      parsedContractAddr = Address.parse(PAYMENT_SPLITTER_CONTRACT_ADDRESS.trim());
    } catch (e) {
      console.error('[TonConnect Debug] ❌ 交易终止: 配置的合约地址格式非法:', PAYMENT_SPLITTER_CONTRACT_ADDRESS);
      console.groupEnd();
      throw new Error('System contract address is invalid. Please contact the administrator.');
    }

    // 金额清洗计算
    let cleanAmountStr: string;
    if (typeof amountInNanoton === 'number') {
      cleanAmountStr = Math.floor(amountInNanoton).toString();
    } else {
      const strVal = String(amountInNanoton).trim();
      cleanAmountStr = strVal.split('.')[0];
    }
    const baseBillAmountNano = BigInt(cleanAmountStr || '0');

    if (baseBillAmountNano <= 0n) {
      console.error('[TonConnect Debug] ❌ 交易终止: 账单金额必须大于 0 nanoTON');
      console.groupEnd();
      throw new Error('Invalid bill amount');
    }

    const GAS_BUFFER_NANO = toNano('0.03'); 
    const totalSendAmountNano = baseBillAmountNano + GAS_BUFFER_NANO;
    const finalAmountStr = totalSendAmountNano.toString();

    // 构造 Payload BOC
    let payloadBoc = '';
    try {
      payloadBoc = createPayMessageBoc(
        actualSellerAddress,
        actualGroupOwnerAddress,
        orderId,
        baseBillAmountNano
      );
    } catch (e: any) {
      console.error('[TonConnect Debug] ❌ Payload 构建阶段失败:', e);
      console.groupEnd();
      throw e;
    }

    const currentUnixTime = Math.floor(Date.now() / 1000);
    const validUntilSec = currentUnixTime + 600;
    const targetAddressString = parsedContractAddr.toString({ bounceable: true });

    const transaction: SendTransactionRequest = {
      validUntil: validUntilSec,
      messages: [
        {
          address: targetAddressString,
          amount: finalAmountStr,
          payload: payloadBoc,
        },
      ],
    };

    try {
      console.log('[TonConnect Debug] 🚀 准备向 TonConnectUI 发起 sendTransaction...');
      const startTime = Date.now();
      const result: any = await ui.sendTransaction(transaction);
      const duration = Date.now() - startTime;

      // 💡 解析交易哈希 (txHash)：优先使用钱包返回的 txHash/hash，其次从 BOC 计算
      let calculatedTxHash = result.txHash || result.hash || '';
      if (!calculatedTxHash && result.boc) {
        try {
          calculatedTxHash = Cell.fromBase64(result.boc).hash().toString('hex');
        } catch (hashErr) {
          console.warn('[TonConnect Debug] ⚠️ 计算 BOC Hash 失败:', hashErr);
        }
      }

      // 💡 抓取并标准化付款人钱包地址 (payerAddress)
      const rawPayerAddr = ui.wallet?.account?.address || currentConnectedRaw;
      const normalizedPayer = walletAddress.value || toUserFriendlyAddress(rawPayerAddr, 'SendPaymentResult') || rawPayerAddr;

      console.log(`[TonConnect Multi-Member Tracker] 🎉 开放式多成员支付签名成功 (耗时: ${duration}ms)`);
      console.log('  -> Transaction BOC 报文:', result.boc);
      console.log('  -> Transaction Hash (Hex):', calculatedTxHash);
      console.log('  -> 付款人钱包地址:', normalizedPayer);
      console.log('  -> 已附加上链凭证 (comment):', orderId);
      console.log(`  -> 群主地址: ${actualGroupOwnerAddress}${actualGroupOwnerAddress === ZERO_ADDRESS ? ' (零地址，费用将合并到平台地址)' : ''}`);
      console.groupEnd();

      return {
        success: true,
        boc: result.boc,
        txHash: calculatedTxHash,
        comment: orderId,
        payerAddress: normalizedPayer,
      };
    } catch (error: any) {
      console.error('[TonConnect Debug] ❌ PaymentSplitter 支付流程报错或中断:', error);
      console.groupEnd();

      return {
        success: false,
        error: error?.message || 'User cancelled the transaction or payment timed out',
      };
    }
  };

  const disconnect = async () => {
    const ui = tonConnectUIInstance.value;
    if (ui && isConnected.value) {
      console.log('[TonConnect Debug] 正在断开钱包连接...');
      await ui.disconnect();
      await updateWalletState(null);
      console.log('[TonConnect Debug] ✅ 钱包连接已成功断开');
    }
  };

  const generateConnectUrl = async () => {
    const ui = getTonConnectUI();
    if (!ui) return;

    const connector = ui.connector;

    if (!connector.connected) {
      const link = connector.connect({
        universalLink: 'https://app.tonkeeper.com/ton-connect',
        bridgeUrl: 'https://bridge.tonapi.io/bridge',
      });

      connectUrl.value = link;
      console.log('[TonConnect Debug] 手动生成的 Universal Link:', link);
      return link;
    }
  };

  return {
    isConnected,
    isBinding,
    isBound,
    walletAddress,
    rawWalletAddress,
    userFriendlyAddress,
    connectUrl,
    tonConnectUI: tonConnectUIInstance,
    getTonConnectUI,
    generateConnectUrl,
    initTonConnect,
    connectWallet,   // ✅ 新增导出
    sendPayment,
    disconnect,
    syncWalletAddressToBackend,
    // ✅ 新增导出
    isContractActive,
    isCheckingContract,
    checkContractActive,
  };
}
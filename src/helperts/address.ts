// src/helpers/address.ts

import { Address } from '@ton/core';

/**
 * 💡 环境判断助手：兼顾 Vite (import.meta.env) 与 Webpack/CRA (process.env)
 */
const isDev = (): boolean => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env.DEV || import.meta.env.MODE === 'development';
    }
  } catch {}
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
};

/**
 * 💡 标准化 TON 钱包地址为 Non-bounceable 友好格式 (UQ...)
 * 支持将 Raw 格式 (0:...) 或 Bounceable 格式 (EQ...) 统一转化为标准的 UQ... 格式
 * 
 * @param rawAddress 传入的任意格式 TON 地址（支持字符串或 Address 对象）
 * @param debugTag 调试日志标识，便于追溯调用的组件/页面
 * @returns 转化后的 UQ 格式地址；若解析失败则返回空字符串或原始输入
 */
export function toUserFriendlyAddress(
  rawAddress?: string | Address | null,
  debugTag = 'AddressHelper'
): string {
  if (!rawAddress) return '';

  try {
    let parsed: Address;

    if (rawAddress instanceof Address) {
      parsed = rawAddress;
    } else if (typeof rawAddress === 'string') {
      const cleanAddr = rawAddress.trim();
      if (!cleanAddr) return '';
      parsed = Address.parse(cleanAddr);
    } else {
      return '';
    }

    // 强制转换为 Non-bounceable (UQ...) 格式
    const normalized = parsed.toString({ bounceable: false });

    // 💡 调试日志：如果发生格式纠偏（如 Raw 0: 或 EQ 格式被转换），输出提示
    if (isDev() && typeof rawAddress === 'string') {
      const clean = rawAddress.trim();
      if (!clean.startsWith('UQ')) {
        console.debug(
          `[${debugTag}] 🔄 TON 地址格式统一纠偏: "${clean.slice(0, 8)}..." (${clean.startsWith('0:') ? 'Raw' : 'EQ'}) -> "${normalized.slice(0, 8)}..." (UQ)`
        );
      }
    }

    return normalized;
  } catch (err: any) {
    console.warn(
      `[${debugTag}] ⚠️ 地址解析失败 (无效的 TON 地址格式): "${rawAddress}"`,
      err?.message || err
    );
    // 兜底返回去空后的原始值或空串，防止页面渲染中断
    return typeof rawAddress === 'string' ? rawAddress.trim() : '';
  }
}

/**
 * 💡 导出 normalizeAddress 别名，保持全局函数调用的一致性
 */
export const normalizeAddress = toUserFriendlyAddress;

/**
 * 💡 核心新增：标准化 TON 钱包地址为数据库 Raw 格式 (0:xxx... 小写)
 * 专门用于与数据库中的 wallet_address_raw / payer_address_raw 字段建立匹配
 * 
 * @param rawAddress 传入的任意格式 TON 地址
 * @param debugTag 调试日志标识
 * @returns 转化后的 Raw 格式地址 (如: 0:868f4e...)
 */
export function toRawAddress(
  rawAddress?: string | Address | null,
  debugTag = 'toRawAddress'
): string {
  if (!rawAddress) return '';

  try {
    let parsed: Address;

    if (rawAddress instanceof Address) {
      parsed = rawAddress;
    } else if (typeof rawAddress === 'string') {
      const cleanAddr = rawAddress.trim();
      if (!cleanAddr) return '';
      parsed = Address.parse(cleanAddr);
    } else {
      return '';
    }

    // 转换为标准 0:xxx 格式并统一转为小写
    const rawString = parsed.toRawString().toLowerCase();

    if (isDev() && typeof rawAddress === 'string') {
      const clean = rawAddress.trim();
      if (!clean.startsWith('0:')) {
        console.debug(
          `[${debugTag}] ⚙️ 转换 Raw 格式用于数据库对账: "${clean.slice(0, 8)}..." -> "${rawString.slice(0, 10)}..."`
        );
      }
    }

    return rawString;
  } catch (err: any) {
    console.warn(
      `[${debugTag}] ⚠️ 转化为 Raw 地址失败: "${rawAddress}"`,
      err?.message || err
    );
    return typeof rawAddress === 'string' ? rawAddress.trim().toLowerCase() : '';
  }
}

/**
 * 💡 将完整的 TON 钱包地址格式化为前后截断的简写形式
 * 例如: "UQA16ws3...2g3-GJ2" -> "UQA1...GJ2"
 * 
 * @param address 完整的 TON 地址（字符串或 Address 对象）
 * @param chars 显示的前后字符数，默认为 4
 * @param debugTag 调试日志标识
 */
export function blurAddress(
  address?: string | Address | null,
  chars = 4,
  debugTag = 'blurAddress'
): string {
  if (!address) return '';

  // 先通过归一化逻辑，确保截断展示的是统一规范后的 UQ 格式
  const normalized = toUserFriendlyAddress(address, debugTag);
  if (!normalized) return '';

  if (normalized.length <= chars * 2) {
    return normalized;
  }

  const start = normalized.slice(0, chars);
  const end = normalized.slice(-chars);

  return `${start}...${end}`;
}

/**
 * 💡 安全比对两个 TON 地址是否代表同一个钱包账户
 * 底层直接依赖 @ton/core 的 Address.equals()，彻底规避 Base64 字符串格式差异造成的判定失效
 * 
 * @param addr1 地址 A (字符串或 Address 对象)
 * @param addr2 地址 B (字符串或 Address 对象)
 * @param debugTag 调试日志标识
 * @returns boolean 是否为同一账户
 */
export function isSameAddress(
  addr1?: string | Address | null,
  addr2?: string | Address | null,
  debugTag = 'isSameAddress'
): boolean {
  if (!addr1 || !addr2) {
    if (isDev() && (addr1 || addr2)) {
      console.debug(`[${debugTag}] 🔍 比对终止: 其中一个地址为空 (addr1: ${Boolean(addr1)}, addr2: ${Boolean(addr2)})`);
    }
    return false;
  }

  try {
    const parsed1 = addr1 instanceof Address ? addr1 : Address.parse(typeof addr1 === 'string' ? addr1.trim() : '');
    const parsed2 = addr2 instanceof Address ? addr2 : Address.parse(typeof addr2 === 'string' ? addr2.trim() : '');

    // 💡 优先通过 @ton/core 的 Address.equals() 比对 Workchain 与 Hash，效率极高且绝对精准
    const isMatch = parsed1.equals(parsed2);

    if (isDev()) {
      const uq1 = parsed1.toString({ bounceable: false });
      const uq2 = parsed2.toString({ bounceable: false });
      if (isMatch) {
        console.debug(`[${debugTag}] ✅ 地址匹配成功: "${uq1.slice(0, 8)}..." === "${uq2.slice(0, 8)}..."`);
      } else {
        console.debug(`[${debugTag}] 🔍 地址比对不匹配: "${uq1.slice(0, 8)}..." vs "${uq2.slice(0, 8)}..."`);
      }
    }

    return isMatch;
  } catch (err: any) {
    if (isDev()) {
      console.warn(`[${debugTag}] ⚠️ 比对失败，存在无效地址:`, { addr1, addr2, error: err?.message });
    }
    return false;
  }
}
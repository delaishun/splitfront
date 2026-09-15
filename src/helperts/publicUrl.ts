/**
 * @returns A complete public URL prefixed with the public static assets base path.
 * @param path - path to prepend prefix to
 */
export function publicUrl(path: string): string {
  if (!path) return '';

  // 1. 若传入的已是完整的网络地址/Data URI/Blob，直接返回
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }

  // 2. 读取 Vite 的 BASE_URL 环境变量 (默认值为 '/')
  let baseUrl = import.meta.env.BASE_URL || '/';
  if (!baseUrl.endsWith('/')) {
    baseUrl += '/';
  }

  // 3. 判断 BASE_URL 是否为绝对路径 (如 https://cdn.example.com/assets/)
  let isBaseAbsolute = false;
  try {
    new URL(baseUrl);
    isBaseAbsolute = true;
  } catch {
    /* empty */
  }

  // 4. 清理输入 path 前置的多个斜杠，防止 URL 构造器将其识别为根路径覆盖 BASE_URL
  const cleanPath = path.replace(/^\/+/, '');

  // 5. 获取当前运行环境的 origin (防范 window 在极端 SSR/测试环境下未定义)
  const origin = typeof window !== 'undefined' && window.location?.origin 
    ? window.location.origin 
    : 'http://localhost';

  try {
    return new URL(
      cleanPath,
      isBaseAbsolute ? baseUrl : origin + baseUrl
    ).toString();
  } catch (err) {
    console.warn(`[publicUrl] Failed to construct public URL for path: "${path}"`, err);
    // 兜底返回拼接路径
    return `${baseUrl}${cleanPath}`;
  }
}
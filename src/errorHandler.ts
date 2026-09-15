import type { AppConfig } from 'vue';

/*
export const errorHandler: AppConfig['errorHandler'] = (err) => {
  const error = err instanceof Error
    ? err.message
    : typeof err === 'string'
      ? err
      : JSON.stringify(err);
  const root = document.getElementById('app') ?? document.body;
  root.insertAdjacentHTML('beforeend', `
            <div>
                <p>An unhandled error occurred:</p>
                <blockquote>
                    <code>
                    ${error}
                    </code>
                </blockquote>
            </div>
        `);
};
*/

export const errorHandler: AppConfig['errorHandler'] = (err) => {
  const errorMsg = err instanceof Error
    ? err.message
    : typeof err === 'string'
      ? err
      : JSON.stringify(err);

  // 1. 依旧保留控制台日志，方便你用 Eruda 调试或在控制台排查
  console.error('[Unhandled Application Error]:', err);

  // 2. 尝试调用 Telegram 官方提供的优雅原生弹窗告知用户，而不是破坏页面排版
  const tgWebApp = (window as any).Telegram?.WebApp;
  if (tgWebApp && typeof tgWebApp.showAlert === 'function') {
    tgWebApp.showAlert(`抱歉，系统发生意外错误：\n${errorMsg}`);
  } else {
    // 3. 浏览器 Mock 环境兜底提示
    alert(`系统错误: ${errorMsg}`);
  }
};

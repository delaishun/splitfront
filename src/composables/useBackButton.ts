import { backButton } from '@tma.js/sdk-vue';
import { watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useBackButton() {
  const route = useRoute();
  const router = useRouter();
  let offClick: (() => void) | null = null;

  // 统一的返回按钮点击回调
  async function onBackButtonClick(): Promise<void> {
    await router.go(-1);
  }

  // 监听路由变化
  watch(
    () => route.name,
    (newName) => {
      // 1. 清理上一次绑定的点击事件，防止重复绑定或内存泄漏
      if (offClick) {
        offClick();
        offClick = null;
      }

      // 2. 根据你在 router/index.ts 中定义的 name 来判断
      // 当处于 'History' (历史页) 或 'Home' (根路径重定向) 时隐藏返回键
      if (newName === 'History' || newName === 'Home') {
        backButton.hide();
      } else {
        // 3. 其他页面（如 BillDetails 或调试页）一律显示并绑定返回事件
        backButton.show();
        offClick = backButton.onClick(onBackButtonClick);
      }
    },
    { immediate: true } // 💡 极其重要：确保应用首次加载时（比如直接通过链接进入某个账单）就能立即触发判断
  );

  // 组件销毁或应用退出时，安全清理事件
  onUnmounted(() => {
    if (offClick) {
      offClick();
    }
  });
}
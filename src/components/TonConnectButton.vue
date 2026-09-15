<!-- src/components/TonConnectButton.vue -->
<template>
  <div class="wallet-connect-container">
    <!-- 1. Dynamic binding ID to ensure it matches props.buttonId -->
    <div :id="props.buttonId" class="ton-connect-wrapper"></div>

    <!-- 2. Fallback: when Telegram Desktop popup crashes, click this button to generate a direct link -->
    <div v-if="!isConnected" class="manual-connect">
      <button @click="handleManualConnect" class="btn-link">
        Generate Desktop Direct Link / QR
      </button>

      <div v-if="connectUrl" class="url-display">
        <p>Copy the link below and send it to the <b>@tonkeeper</b> chat to open:</p>
        <textarea readonly :value="connectUrl" rows="3" class="url-input"></textarea>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, nextTick } from "vue";
import { useTonConnect } from "../composables/useTonConnect";

const { isConnected, connectUrl, initTonConnect, generateConnectUrl } = useTonConnect();

const props = defineProps({
  buttonId: {
    type: String,
    default: "ton-connect-button-root",
  },
});

const handleManualConnect = async () => {
  console.log('[TonConnectButton Debug] 👆 User clicked to manually generate direct link');
  await generateConnectUrl();
};

onMounted(async () => {
  console.log('[TonConnectButton Debug] 🚀 TonConnectButton mounted, initializing mount point:', props.buttonId);
  await nextTick();

  let retryAttempts = 0;
  const maxRetries = 10;

  const mountTonConnect = () => {
    const targetEl = document.getElementById(props.buttonId);
    if (targetEl) {
      console.log('[TonConnectButton Debug] ✅ DOM node is ready, mounting TonConnect SDK UI');
      initTonConnect(props.buttonId);
    } else if (retryAttempts < maxRetries) {
      retryAttempts++;
      console.warn(`[TonConnectButton Debug] ⚠️ Mount node #${props.buttonId} not ready, retrying (${retryAttempts}/${maxRetries})...`);
      setTimeout(mountTonConnect, 100);
    } else {
      console.error(`[TonConnectButton Debug] ❌ Mount node #${props.buttonId} initialization timed out!`);
    }
  };

  mountTonConnect();
});
</script>

<style scoped>
.wallet-connect-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.ton-connect-wrapper {
  min-width: 150px;
  min-height: 40px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
}

.manual-connect {
  margin-top: 10px;
  text-align: center;
}

.btn-link {
  padding: 6px 12px;
  background-color: #0088cc;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.url-display {
  margin-top: 8px;
}

.url-input {
  width: 100%;
  font-size: 11px;
  word-break: break-all;
  padding: 6px;
  box-sizing: border-box;
}
</style>
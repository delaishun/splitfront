<!-- src/pages/PrivacyPage.vue -->
<template>
  <div class="privacy-container">
    <div class="privacy-card">
      <h1 class="title">Privacy Policy</h1>
      <p class="last-updated">Last Updated: July 2026</p>

      <div class="content-section">
        <section class="policy-item">
          <h2>1. Introduction</h2>
          <p>
            This Privacy Policy explains how the TON Split Payment App ("the Protocol") handles information when you interact with our Telegram Mini App interface. We respect your privacy and are committed to minimizing data collection in accordance with Web3 and decentralized design principles.
          </p>
        </section>

        <section class="policy-item">
          <h2>2. Data We Do NOT Collect</h2>
          <p>
            As a non-custodial decentralized application:
          </p>
          <ul>
            <li>We do NOT collect, store, or have access to your private keys, seed phrases, or wallet passwords.</li>
            <li>We do NOT request or store personally identifiable information (PII) such as your real name, email address, or phone number.</li>
            <li>We do NOT custody or hold any of your cryptocurrency funds.</li>
          </ul>
        </section>

        <section class="policy-item">
          <h2>3. Information We Process</h2>
          <p>
            To provide transaction indexing and bill management functionality, the Protocol processes limited technical data:
          </p>
          <ul>
            <li><strong>Public Wallet Addresses:</strong> When connected via TonConnect, your public TON address is used to verify bills and query chain activity.</li>
            <li><strong>Public Blockchain Data:</strong> Transaction hashes, amounts, and bill comments broadcasted to the open TON network.</li>
            <li><strong>Telegram Context Data:</strong> Telegram-provided authentication parameters (such as initData) used exclusively for session security and route parsing.</li>
          </ul>
        </section>

        <section class="policy-item">
          <h2>4. On-Chain Data Public Nature</h2>
          <p>
            Please note that transactions conducted on The Open Network (TON) are inherently public. Transaction details—including sender and recipient wallet addresses, transfer amounts, and memos/comments—are permanently stored on the public blockchain and indexed by public block explorers.
          </p>
        </section>

        <section class="policy-item">
          <h2>5. Third-Party Services</h2>
          <p>
            The Protocol integrates with third-party tools such as TonConnect and TON public RPC node endpoints. Your interactions with wallet applications (e.g., Tonkeeper) are governed by their respective privacy policies.
          </p>
        </section>

        <section class="policy-item">
          <h2>6. Data Security</h2>
          <p>
            We implement industry-standard technical measures to secure communications between our interface and backend services. However, no data transmission over the internet or decentralized network can be guaranteed as 100% secure.
          </p>
        </section>

        <section class="policy-item">
          <h2>7. Updates to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in technical infrastructure or regulatory standards. The latest version will always be accessible via this interface.
          </p>
        </section>
      </div>

      <div class="footer-action">
        <button class="btn-back" @click="goBack">Back to App</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};
</script>

<style scoped>
.privacy-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--tg-theme-text-color, #222222);
  background: var(--tg-theme-bg-color, #ffffff);
  min-height: 100vh;
  box-sizing: border-box;
}

.privacy-card {
  width: 100%;
  max-width: 480px;
  background: var(--tg-theme-secondary-bg-color, #f4f4f7);
  border-radius: 20px;
  padding: 24px 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  box-sizing: border-box;
}

.title {
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 4px;
  text-align: center;
}

.last-updated {
  font-size: 12px;
  color: var(--tg-theme-hint-color, #8e8e93);
  text-align: center;
  margin-bottom: 24px;
}

.content-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
  text-align: left;
}

.policy-item h2 {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--tg-theme-text-color, #1c1c1e);
}

.policy-item p {
  font-size: 13px;
  line-height: 1.5;
  color: var(--tg-theme-hint-color, #636366);
  margin: 0;
}

.policy-item ul {
  margin: 6px 0 0 0;
  padding-left: 18px;
}

.policy-item li {
  font-size: 13px;
  line-height: 1.5;
  color: var(--tg-theme-hint-color, #636366);
  margin-bottom: 4px;
}

.footer-action {
  margin-top: 28px;
}

.btn-back {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  background: var(--tg-theme-button-color, #248bcf);
  color: var(--tg-theme-button-text-color, #ffffff);
  transition: opacity 0.2s;
}

.btn-back:active {
  opacity: 0.8;
}
</style>
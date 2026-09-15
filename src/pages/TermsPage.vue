<!-- src/pages/TermsPage.vue -->
<template>
  <div class="terms-container">
    <div class="terms-card">
      <h1 class="title">Terms of Service</h1>
      <p class="last-updated">Last Updated: July 2026</p>

      <div class="content-section">
        <section class="term-item">
          <h2>1. Overview and Protocol Nature</h2>
          <p>
            TON Split Payment App ("the Protocol") is a decentralized, non-custodial software utility running on the Telegram Mini App platform. The Protocol provides a smart interface for initiating peer-to-peer (P2P) transfers and split payment requests on the The Open Network (TON) blockchain.
          </p>
        </section>

        <section class="term-item">
          <h2>2. Non-Custodial Architecture</h2>
          <p>
            The Protocol is strictly non-custodial. We do not maintain, collect, hold, or manage user private keys, seed phrases, or cryptocurrency funds. All transactions occur directly on the TON blockchain between the sender's wallet and the recipient's wallet. The Protocol operates purely as a bookkeeping and notification utility.
          </p>
        </section>

        <section class="term-item">
          <h2>3. User Responsibility & Private Keys</h2>
          <p>
            You are solely responsible for securing your wallet credentials, private keys, and seed phrases. The Protocol team has no ability to access your wallet, reverse transactions, or recover lost funds under any circumstances. Always verify wallet addresses and payment comments before authorizing transactions via TonConnect.
          </p>
        </section>

        <section class="term-item">
          <h2>4. Blockchain Execution & Irreversibility</h2>
          <p>
            Transactions initiated through the Protocol are broadcast directly to the TON blockchain. Once broadcast and confirmed by the network, transactions are permanent, public, and irreversible. We bear no liability for transactions sent to incorrect recipient addresses or with erroneous amounts.
          </p>

        </section>

        <section class="term-item">
          <h2>5. Service Availability & Network Risks</h2>
          <p>
            The Protocol relies on third-party public nodes, TonConnect providers, and the TON network infrastructure. We do not guarantee uninterrupted access, zero latency, or continuous service uptime. You acknowledge the risks inherent in using decentralized networks, including potential RPC delays or network congestion.
          </p>
        </section>

        <section class="term-item">
          <h2>6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, the Protocol developers, contributors, and operators shall not be liable for any direct, indirect, incidental, or consequential damages resulting from your use or inability to use the software or any blockchain transactions conducted thereunder.
          </p>
        </section>

        <section class="term-item">
          <h2>7. Amendments to Terms</h2>
          <p>
            We reserve the right to update or modify these Terms of Service at any time. Continued use of the Protocol after changes are published constitutes your acceptance of the updated terms.
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
.terms-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--tg-theme-text-color, #222222);
  background: var(--tg-theme-bg-color, #ffffff);
  min-height: 100vh;
  box-sizing: border-box;
}

.terms-card {
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

.term-item h2 {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--tg-theme-text-color, #1c1c1e);
}

.term-item p {
  font-size: 13px;
  line-height: 1.5;
  color: var(--tg-theme-hint-color, #636366);
  margin: 0;
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
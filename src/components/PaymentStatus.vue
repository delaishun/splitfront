<!-- splitapp/src/components/PaymentStatus.vue -->
<template>
  <div :class="['status-container', effectiveStatus]" role="status" aria-live="polite">
    <!-- 1. Pending payment status (unpaid and bill still accepts payment) -->
    <div v-if="effectiveStatus === 'pending'" class="status-content">
      <div class="icon-wrapper pending-icon">
        <span class="pulse-ring"></span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="feather-clock">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </div>
      <h3 class="status-title">Waiting for Payment</h3>
      <p class="status-desc">Please tap the button below and authorize with your TON wallet.</p>
    </div>

    <!-- 2. Waiting for others to pay (creator only) -->
    <div v-else-if="effectiveStatus === 'waiting_others'" class="status-content">
      <div class="icon-wrapper waiting-others-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="feather-users">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      </div>
      <h3 class="status-title">Waiting for Others</h3>
      <p class="status-desc">You are the creator. Please wait for other group members to complete the payment.</p>
    </div>

    <!-- 3. On-chain confirmation in progress -->
    <div v-else-if="effectiveStatus === 'confirming'" class="status-content">
      <div class="icon-wrapper confirming-icon">
        <div class="loading-spinner"></div>
      </div>
      <h3 class="status-title">Waiting for On-chain Confirmation...</h3>
      <p class="status-desc">
        The wallet has sent the transaction. The scanner is verifying the memo on the TON blockchain 
        <span v-if="comment" class="comment-badge">[{{ comment }}]</span>. Please do not close this page.
      </p>
      <div v-if="txHash" class="hash-preview">
        Tx Hash: {{ truncateHash(txHash) }}
      </div>
    </div>

    <!-- 4. Partial payment status -->
    <div v-else-if="effectiveStatus === 'partial'" class="status-content">
      <div class="icon-wrapper partial-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="feather-pie-chart">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
          <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
        </svg>
      </div>
      <h3 class="status-title">Partial Payment Received</h3>
      <p class="status-desc">
        This bill has received partial payment. Waiting for other members to complete the payment.
      </p>
    </div>

    <!-- 5. Personal payment success / bill settled -->
    <div v-else-if="effectiveStatus === 'paid' || effectiveStatus === 'success'" class="status-content">
      <div class="icon-wrapper success-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="feather-check">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h3 class="status-title">Payment Successful</h3>
      <p class="status-desc">Your decentralized transfer has been safely delivered. Your share has been paid successfully!</p>
    </div>

    <!-- 6. Bill fully funded, current user no longer needs to pay -->
    <div v-else-if="effectiveStatus === 'bill_closed'" class="status-content">
      <div class="icon-wrapper already-paid-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="feather-shield-check">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      </div>
      <h3 class="status-title">Bill Fully Funded</h3>
      <p class="status-desc">This bill has reached its target amount or has been closed by the creator. No further payment is needed.</p>
    </div>

    <!-- 7. Duplicate payment rejected -->
    <div v-else-if="effectiveStatus === 'already_paid'" class="status-content">
      <div class="icon-wrapper already-paid-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="feather-shield-check">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      </div>
      <h3 class="status-title">No Duplicate Payment Needed</h3>
      <p class="status-desc">You have already paid your share for this bill. No need to transfer again.</p>
    </div>

    <!-- 8. Bill expired -->
    <div v-else-if="effectiveStatus === 'expired'" class="status-content">
      <div class="icon-wrapper expired-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="feather-x">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>
      <h3 class="status-title">Bill Expired</h3>
      <p class="status-desc">This bill has exceeded its validity period. Please return to the Bot to create a new one.</p>
    </div>

    <!-- 9. Transaction failed / bounced -->
    <div v-else-if="effectiveStatus === 'failed' || effectiveStatus === 'bounced'" class="status-content">
      <div class="icon-wrapper failed-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="feather-alert-triangle">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <h3 class="status-title">Transaction Failed</h3>
      <p class="status-desc">The on-chain transaction was bounced or failed. Funds have been returned to your wallet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, ref, type PropType } from 'vue';
import { useTelegram } from '../composables/useTelegram';

export type BillStatus = 
  | 'pending' 
  | 'waiting_others'
  | 'confirming' 
  | 'partial'
  | 'paid' 
  | 'already_paid'
  | 'bill_closed'
  | 'expired' 
  | 'success' 
  | 'failed' 
  | 'bounced';

const props = defineProps({
  // Bill / operation base status
  status: {
    type: String as PropType<BillStatus | string>,
    required: true,
    default: 'pending'
  },
  // Current logged-in user's personal payment status (e.g. 'UNPAID', 'PAID')
  myStatus: {
    type: String,
    default: ''
  },
  // Whether current user has paid (boolean shortcut flag)
  hasPaid: {
    type: Boolean,
    default: false
  },
  // Unique reconciliation comment (e.g. SP-MSS8K9KA-3C34DBB5)
  comment: {
    type: String,
    default: ''
  },
  // Client-captured txHash
  txHash: {
    type: String,
    default: ''
  }
});

const { triggerNotificationHaptic } = useTelegram();
const hasNotified = ref(false);

/**
 * Truncate hash for display
 */
const truncateHash = (hash: string) => {
  if (!hash) return '';
  return hash.length > 16 ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : hash;
};

/**
 * Weak alert popup logic
 */
const notifyAlreadyPaid = () => {
  if (hasNotified.value) return;
  hasNotified.value = true;

  if (typeof triggerNotificationHaptic === 'function') {
    triggerNotificationHaptic('warning');
  }
  const tgWebApp = (window as any).Telegram?.WebApp;
  if (tgWebApp?.showAlert) {
    tgWebApp.showAlert('💡 This bill has been settled or you have already paid your share.');
  }
};

/**
 * Base status normalization
 */
const normalizedStatus = computed<BillStatus>(() => {
  if (!props.status) return 'pending';
  
  const rawClean = String(props.status).trim();
  const lower = rawClean.toLowerCase();

  const statusMapping: Record<string, BillStatus> = {
    'active': 'pending',
    'open': 'pending',
    'unpaid': 'pending',
    'pending': 'pending',
    'waiting_others': 'waiting_others',
    'confirming': 'confirming',
    'processing': 'confirming',
    'partial': 'partial',
    'paid': 'paid',
    'success': 'paid',
    'completed': 'paid',
    'closed': 'bill_closed',
    'bill_closed': 'bill_closed',
    'already_paid': 'already_paid',
    'already_paid_error': 'already_paid',
    'duplicate_payment': 'already_paid',
    'expired': 'expired',
    'cancelled': 'expired',
    'failed': 'failed',
    'error': 'failed',
    'bounced': 'bounced',
  };

  if (statusMapping[lower]) {
    return statusMapping[lower];
  }

  if (lower.includes('already') || lower.includes('duplicate')) {
    return 'already_paid';
  }

  return 'pending';
});

/**
 * Final effective visual status (strict misjudgment prevention)
 * Core principle: as long as current user is UNPAID and the bill is not hard-expired/failed,
 * prioritize showing the payment entry point
 */
const effectiveStatus = computed<BillStatus>(() => {
  const norm = normalizedStatus.value;
  const myStatusLower = (props.myStatus || '').toLowerCase();
  
  // 1. If current user is explicitly marked as paid, show paid/already_paid logic
  if (props.hasPaid || myStatusLower === 'paid' || myStatusLower === 'success') {
    return norm === 'already_paid' ? 'already_paid' : 'paid';
  }

  // 2. If global bill returns CLOSED / BILL_CLOSED / PAID / SUCCESS but current user is confirmed UNPAID,
  // the global status may be misjudged or in open-order mode. Force correct visual status to pending
  // to ensure the payment guide is displayed.
  if (
    (norm === 'bill_closed' || norm === 'paid') && 
    (myStatusLower === 'unpaid' || myStatusLower === '' || !props.hasPaid)
  ) {
    console.info('[PaymentStatus] 🛡️ Detected conflict between global CLOSED and personal UNPAID, overriding to pending to allow user to initiate transfer');
    return 'pending';
  }

  // If waiting_others passed in, return directly
  if (norm === 'waiting_others') {
    return 'waiting_others';
  }

  return norm;
});

onMounted(() => {
  console.log(
    `%c[PaymentStatus Debug] 📌 Component mounted | Raw: "${props.status}" | Personal: "${props.myStatus}" ➔ Final UI: "${effectiveStatus.value}"`,
    'background: #0284c7; color: #ffffff; padding: 2px 6px; border-radius: 4px;',
    {
      rawStatus: props.status,
      myStatus: props.myStatus,
      hasPaid: props.hasPaid,
      effectiveStatus: effectiveStatus.value,
      commentKey: props.comment || '(no comment)',
      txHash: props.txHash || '(no hash)'
    }
  );

  if (effectiveStatus.value === 'already_paid' || effectiveStatus.value === 'bill_closed') {
    notifyAlreadyPaid();
  }
});

watch(
  () => [props.status, props.myStatus, props.hasPaid],
  ([newStatus, newMyStatus, newHasPaid]) => {
    console.log(
      `%c[PaymentStatus Debug] 🔄 Status updated | Raw: [${newStatus}] | Personal: [${newMyStatus}] | Final UI: [${effectiveStatus.value}]`,
      'color: #0284c7; font-weight: bold;',
      `| Comment: "${props.comment}"`
    );

    if (effectiveStatus.value === 'already_paid' || effectiveStatus.value === 'bill_closed') {
      notifyAlreadyPaid();
    } else if (effectiveStatus.value === 'paid' || effectiveStatus.value === 'success') {
      if (typeof triggerNotificationHaptic === 'function') {
        triggerNotificationHaptic('success');
      }
    }
  }
);
</script>

<style scoped>
.status-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}
.status-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.status-title {
  font-size: 18px;
  font-weight: 700;
  margin: 12px 0 6px 0;
}
.status-desc {
  font-size: 13px;
  color: var(--tg-theme-hint-color, #8e8e93);
  margin: 0;
  max-width: 280px;
  line-height: 1.4;
  text-align: center;
}

.comment-badge {
  font-family: monospace;
  font-weight: bold;
  color: var(--tg-theme-link-color, #248bcf);
  display: inline-block;
  margin: 0 2px;
}

.hash-preview {
  margin-top: 8px;
  font-size: 11px;
  font-family: monospace;
  color: var(--tg-theme-hint-color, #8e8e93);
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 8px;
  border-radius: 4px;
}

/* Icon wrapper styles */
.icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.icon-wrapper svg {
  width: 28px;
  height: 28px;
}

/* Status colors and animations */
.pending-icon {
  background: rgba(36, 139, 207, 0.1);
  color: var(--tg-theme-button-color, #248bcf);
}
.waiting-others-icon {
  background: rgba(255, 159, 0, 0.1);
  color: #f59f00;
}
.confirming-icon {
  background: rgba(245, 159, 0, 0.1);
}
.partial-icon {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}
.success-icon {
  background: rgba(24, 160, 88, 0.1);
  color: #18a058;
}
.already-paid-icon {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.expired-icon {
  background: rgba(235, 87, 87, 0.1);
  color: #eb5757;
}
.failed-icon {
  background: rgba(208, 48, 80, 0.1);
  color: #d03050;
}

/* Spinner loading circle */
.loading-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(245, 159, 0, 0.2);
  border-top-color: #f59f00;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Pulse ring */
.pulse-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid var(--tg-theme-button-color, #248bcf);
  animation: pulse 1.8s ease-out infinite;
  opacity: 0;
}
@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  100% { transform: scale(1.35); opacity: 0; }
}
</style>
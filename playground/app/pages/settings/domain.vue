<script setup lang="ts">
definePageMeta({ middleware: 'plan-guard' });

const tenant = useTenant();
const domain = ref(tenant.value?.customDomain ?? '');
const status = ref<'idle' | 'checking' | 'verified' | 'failed'>('idle');
const errorMsg = ref('');

async function verify() {
    if (!domain.value.trim()) {
        return;
    }

    status.value = 'checking';
    errorMsg.value = '';

    try {
        const res = await fetch('/api/domains/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: domain.value.trim() }),
        });
        const data = (await res.json()) as { verified: boolean };
        status.value = data.verified ? 'verified' : 'failed';
    } catch {
        status.value = 'failed';
        errorMsg.value = 'An error occurred. Please try again.';
    }
}
</script>

<template>
    <div>
        <h1>Custom Domain</h1>
        <p class="description">
            Point a CNAME record from your domain to
            <code class="inline-code">cname.yoursaas.com</code>
            , then click Verify.
        </p>

        <div class="input-row">
            <input v-model="domain" class="domain-input" placeholder="acme.com" />
            <button class="verify-btn" :disabled="status === 'checking'" @click="verify">
                {{ status === 'checking' ? 'Checking…' : 'Verify DNS' }}
            </button>
        </div>

        <p v-if="status === 'verified'" class="status status--success">✓ Domain verified successfully!</p>
        <p v-else-if="status === 'failed'" class="status status--error">
            {{ errorMsg || 'DNS not found yet. CNAME changes can take up to 48h to propagate.' }}
        </p>

        <div class="tenant-info">
            <strong>Current tenant:</strong>
            {{ tenant?.domain }} ({{ tenant?.plan }} plan)
        </div>
    </div>
</template>

<style scoped>
.description {
    color: var(--color-text-dim);
}

.inline-code {
    background: var(--color-bg-code);
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
}

.input-row {
    display: flex;
    gap: 10px;
    margin-top: var(--space-5);
}

.domain-input {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
}

.verify-btn {
    padding: var(--space-2) 20px;
    background: var(--brand);
    color: var(--color-text-inverse);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--font-size-base);
}

.verify-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.status {
    margin-top: var(--space-4);
    font-weight: 600;
}

.status--success {
    color: var(--color-success);
}

.status--error {
    color: var(--color-error);
    font-weight: normal;
}

.tenant-info {
    margin-top: var(--space-6);
    padding: var(--space-4);
    background: var(--color-bg-info);
    border-radius: var(--radius-lg);
    font-size: var(--font-size-sm);
}
</style>

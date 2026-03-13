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
        <p style="color: #555">
            Point a CNAME record from your domain to
            <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px">cname.yoursaas.com</code>
            , then click Verify.
        </p>

        <div style="margin-top: 24px; display: flex; gap: 10px">
            <input
                v-model="domain"
                placeholder="acme.com"
                style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 15px"
            />
            <button
                :disabled="status === 'checking'"
                style="
                    padding: 8px 20px;
                    background: var(--brand, #333);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 15px;
                "
                @click="verify"
            >
                {{ status === 'checking' ? 'Checking…' : 'Verify DNS' }}
            </button>
        </div>

        <p v-if="status === 'verified'" style="margin-top: 16px; color: #27ae60; font-weight: 600">✓ Domain verified successfully!</p>
        <p v-else-if="status === 'failed'" style="margin-top: 16px; color: #e74c3c">
            {{ errorMsg || 'DNS not found yet. CNAME changes can take up to 48h to propagate.' }}
        </p>

        <div style="margin-top: 40px; padding: 16px; background: #fffbe6; border-radius: 8px; font-size: 14px">
            <strong>Current tenant:</strong>
            {{ tenant?.domain }} ({{ tenant?.plan }} plan)
        </div>
    </div>
</template>

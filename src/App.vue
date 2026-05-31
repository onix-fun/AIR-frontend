<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useAuthStore, useDeviceStore, useTemplateStore, useAnalyticsStore } from "@/infra/store";
import AppLayout from "@/infra/navigation/layouts/AppLayout.vue";
import { accountAppUrl } from "@/infra/navigation/accountApp";

const authStore = useAuthStore();
const deviceStore = useDeviceStore();
const templateStore = useTemplateStore();
const analyticsStore = useAnalyticsStore();

const isBooting = ref(true);

const bootstrap = async () => {
    try {
        await Promise.all([templateStore.fetchTemplates(), deviceStore.fetchConsumers(), analyticsStore.checkHealth()]);
        await Promise.all([
            deviceStore.hydrateLastEvents(),
            ...deviceStore.consumers.map((consumer) => templateStore.ensureTemplateDetail(consumer.templateId)),
        ]);
    } finally {
        isBooting.value = false;
    }
};

onMounted(async () => {
    await authStore.initAuth();
    if (!authStore.isAuthenticated) {
        // Prevent infinite redirect loops by checking if we already tried to redirect.
        // If not authenticated, we MUST go to profile login.
        const currentUrl = encodeURIComponent(window.location.origin + window.location.pathname);
        const baseUrl = accountAppUrl();
        window.location.href = `${baseUrl}?redirect=${currentUrl}`;
        return;
    }
    await bootstrap();
});
</script>

<template>
    <div v-if="isBooting" class="boot-screen">
        <div class="spinner"></div>
        <span>Connecting to Sparrow services</span>
    </div>

    <AppLayout v-else>
        <router-view />
    </AppLayout>
</template>

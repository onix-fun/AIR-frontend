<style scoped>
.hover-lift {
    transition: transform 0.2s;
}
.hover-lift:hover {
    transform: translateY(-2px);
}
</style>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useDeviceStore, useTemplateStore } from "@/infra/store";
import { apiErrorMessage } from "@/api/client";

const router = useRouter();
const deviceStore = useDeviceStore();
const templateStore = useTemplateStore();

const search = ref("");
const showCreate = ref(false);
const createTemplateId = ref("");
const createDisplayName = ref("");
const createError = ref("");

const devices = computed(() => deviceStore.deviceViews(templateStore.templates, templateStore.methodsByTemplate));
const filteredDevices = computed(() => {
    const query = search.value.trim().toLowerCase();
    if (!query) return devices.value;
    return devices.value.filter((device) =>
        [device.name, device.id, device.templateName, device.lastEvent || ""].some((value) =>
            value.toLowerCase().includes(query),
        ),
    );
});

onMounted(async () => {
    await Promise.all(deviceStore.consumers.map((consumer) => templateStore.ensureTemplateDetail(consumer.templateId)));
});

const createConsumer = async () => {
    createError.value = "";
    try {
        const result = await deviceStore.createConsumer(createTemplateId.value, createDisplayName.value || undefined);
        showCreate.value = false;
        createTemplateId.value = "";
        createDisplayName.value = "";
        window.alert(
            `Consumer created successfully!\n\nPlease save this JWT token, it will only be shown once:\n\n${result.token}`,
        );
    } catch (cause) {
        createError.value = apiErrorMessage(cause);
    }
};
</script>

<template>
    <div class="stack" style="padding-bottom: 2rem">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem">
            <div>
                <h2>Devices</h2>
                <span class="muted">Consumers visible to the current gateway identity</span>
            </div>
            <div class="toolbar" style="display: flex; gap: 1rem">
                <input v-model="search" class="input" placeholder="Search devices..." style="width: 300px" />
            </div>
        </div>

        <div v-if="deviceStore.error" class="empty-state">{{ deviceStore.error }}</div>
        <div v-else-if="filteredDevices.length === 0 && search" class="empty-state">
            No consumers found matching your search.
        </div>

        <div
            v-else
            class="consumer-grid"
            style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem"
        >
            <div
                v-for="device in filteredDevices"
                :key="device.id"
                class="consumer-card hover-lift"
                style="
                    background: var(--surface-card, #fff);
                    border: 1px solid var(--surface-border, #e2e8f0);
                    border-radius: 8px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                "
                @click="router.push(`/device/${device.id}`)"
            >
                <i
                    class="pi pi-server"
                    style="font-size: 2rem; color: var(--primary-color, #10b981); margin-bottom: 1rem"
                ></i>
                <h3 style="margin: 0; font-size: 1.1rem; text-align: center; word-break: break-all">
                    {{ device.name }}
                </h3>
                <div style="margin-top: 0.5rem">
                    <span
                        class="status-badge"
                        :class="device.state"
                        style="
                            display: inline-flex;
                            align-items: center;
                            gap: 0.5rem;
                            padding: 0.25rem 0.75rem;
                            border-radius: 999px;
                            font-size: 0.875rem;
                            background: var(--surface-ground, #f1f5f9);
                        "
                    >
                        <span
                            class="status-dot"
                            :class="{ online: device.state === 'online' }"
                            style="width: 8px; height: 8px; border-radius: 50%; background: #94a3b8"
                        ></span>
                        {{ device.state }}
                    </span>
                </div>
            </div>

            <!-- Add New Consumer Card -->
            <div
                class="consumer-card hover-lift add-card"
                @click="showCreate = true"
                style="
                    border: 2px dashed var(--surface-border, #cbd5e1);
                    border-radius: 8px;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    background: transparent;
                    min-height: 160px;
                "
            >
                <i
                    class="pi pi-plus"
                    style="font-size: 2rem; color: var(--text-muted, #64748b); margin-bottom: 0.5rem"
                ></i>
                <span style="color: var(--text-muted, #64748b); font-weight: 500">Add Consumer</span>
            </div>
        </div>
    </div>

    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
        <form class="modal panel" @submit.prevent="createConsumer">
            <div class="panel-header">
                <h2>Create consumer</h2>
                <button class="icon-button" type="button" @click="showCreate = false">
                    <i class="pi pi-times"></i>
                </button>
            </div>
            <div class="panel-body stack">
                <label class="field">
                    Name
                    <input v-model="createDisplayName" class="input" placeholder="Device name (optional)" maxlength="100" />
                </label>
                <label class="field">
                    Template
                    <select v-model="createTemplateId" class="select" required>
                        <option disabled value="">Select template</option>
                        <option v-for="template in templateStore.templates" :key="template.id" :value="template.id">
                            {{ template.name }} · {{ template.state }}
                        </option>
                    </select>
                </label>
                <div class="row-actions">
                    <button class="btn btn-primary" type="submit">Create consumer</button>
                </div>
            </div>
        </form>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { apiErrorMessage } from "@/api/client";
import { useDeviceStore, useTemplateStore } from "@/infra/store";

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
    return query
        ? devices.value.filter((device) =>
              [device.name, device.id, device.templateName, String(device.metadata.location || "")]
                  .join(" ")
                  .toLowerCase()
                  .includes(query),
          )
        : devices.value;
});
const stateLabel = (state: "recent" | "idle" | "no-data") =>
    state === "recent" ? "Active recently" : state === "idle" ? "Idle" : "No data";
const lastActivity = (date?: string) => (date ? new Date(date).toLocaleString() : "Waiting for first event");
const tags = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

const createConsumer = async () => {
    createError.value = "";
    try {
        const result = await deviceStore.createConsumer(createTemplateId.value, createDisplayName.value || undefined);
        showCreate.value = false;
        createTemplateId.value = "";
        createDisplayName.value = "";
        window.alert(`Consumer created successfully.\n\nPlease save this JWT token:\n\n${result.token}`);
    } catch (cause) {
        createError.value = apiErrorMessage(cause);
    }
};
</script>

<template>
    <div class="stack">
        <header class="page-heading">
            <div>
                <span class="eyebrow">Fleet overview</span>
                <h1>Devices</h1>
                <p>Monitor activity and open a consumer dashboard.</p>
            </div>
            <div class="toolbar">
                <input v-model="search" class="input search-input" placeholder="Search devices" />
                <button class="btn btn-primary" type="button" @click="showCreate = true"><i class="pi pi-plus"></i> Add consumer</button>
            </div>
        </header>

        <div v-if="deviceStore.error" class="notice error">{{ deviceStore.error }}</div>
        <div v-else-if="filteredDevices.length === 0" class="panel empty-state">
            {{ search ? "No consumers match your search." : "No consumers yet. Create the first device to get started." }}
        </div>
        <div v-else class="consumer-grid">
            <article v-for="device in filteredDevices" :key="device.id" class="consumer-card" @click="router.push(`/device/${device.id}`)">
                <div class="consumer-card-top">
                    <div class="device-icon"><i :class="String(device.metadata.icon || 'pi pi-server')"></i></div>
                    <span class="activity-chip" :class="device.state"><span></span>{{ stateLabel(device.state) }}</span>
                </div>
                <div>
                    <h2>{{ device.name }}</h2>
                    <p>{{ device.templateName }}</p>
                </div>
                <span v-if="device.metadata.criticality" class="criticality-badge" :class="String(device.metadata.criticality)">{{ device.metadata.criticality }} criticality</span>
                <div class="consumer-details">
                    <span v-if="device.metadata.location"><i class="pi pi-map-marker"></i> {{ device.metadata.location }}</span>
                    <span><i class="pi pi-clock"></i> {{ lastActivity(device.lastEvent) }}</span>
                </div>
                <div v-if="tags(device.metadata.tags).length" class="tag-list">
                    <span v-for="tag in tags(device.metadata.tags)" :key="tag" class="tag">{{ tag }}</span>
                </div>
            </article>
        </div>

        <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
            <form class="modal panel" @submit.prevent="createConsumer">
                <div class="panel-header"><h2>Create consumer</h2><button class="icon-button" type="button" @click="showCreate = false"><i class="pi pi-times"></i></button></div>
                <div class="panel-body stack">
                    <div v-if="createError" class="notice error">{{ createError }}</div>
                    <label class="field">Name<input v-model="createDisplayName" class="input" placeholder="Optional device name" maxlength="100" /></label>
                    <label class="field">Template<select v-model="createTemplateId" class="select" required><option disabled value="">Select template</option><option v-for="template in templateStore.templates" :key="template.id" :value="template.id">{{ template.name }} · {{ template.state }}</option></select></label>
                    <div class="row-actions"><button class="btn btn-primary" type="submit">Create consumer</button></div>
                </div>
            </form>
        </div>
    </div>
</template>

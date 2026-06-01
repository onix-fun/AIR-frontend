<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ContactsSocket } from "@/api/services/ContactsService";
import { AnalyticsService, type ValueSeriesPointResponse } from "@/api/services/AnalyticsService";
import { DeviceService } from "@/api/services/DeviceService";
import { apiErrorMessage } from "@/api/client";
import CollaboratorsPanel from "@/components/CollaboratorsPanel.vue";
import DashboardWidgetCard from "@/components/DashboardWidgetCard.vue";
import { useAnalyticsStore, useAuthStore, useDeviceStore, useTemplateStore } from "@/infra/store";
import {
    dashboardWidgets,
    parseTemplateInfo,
    valueAtPath,
    type DashboardWidget,
    type MethodDashboardWidget,
    type VariableDashboardWidget,
    type CollaboratorsResponse,
} from "@/domain";
import type { ConsumerRole, LiveEvent, MethodResponse, VariableResponse } from "@/domain";

type HistoryRange = "1h" | "24h" | "7d";

const route = useRoute();
const router = useRouter();
const deviceStore = useDeviceStore();
const templateStore = useTemplateStore();
const analyticsStore = useAnalyticsStore();
const authStore = useAuthStore();

const socketState = ref<"connecting" | "open" | "closed" | "error">("closed");
const liveEvents = ref<LiveEvent[]>([]);
const historicalSeries = ref<Record<string, ValueSeriesPointResponse[]>>({});
const commandValues = reactive<Record<string, string | number | boolean>>({});
const localToggleValues = reactive<Record<string, boolean>>({});
const commandError = ref("");
const activeTab = ref<"dashboard" | "history" | "access">("dashboard");
const historyRange = ref<HistoryRange>("24h");
const historyResource = ref("");
const collaboratorAccess = ref<CollaboratorsResponse<ConsumerRole> | null>(null);
let socket: ContactsSocket | null = null;

const consumerId = computed(() => route.params.id as string);
const devices = computed(() => deviceStore.deviceViews(templateStore.templates, templateStore.methodsByTemplate));
const device = computed(() => devices.value.find((item) => item.id === consumerId.value));
const variables = computed<VariableResponse[]>(() =>
    device.value ? templateStore.variablesByTemplate[device.value.templateId] || [] : [],
);
const methods = computed<MethodResponse[]>(() => device.value?.methods || []);
const metadata = computed(() => parseTemplateInfo(device.value?.template?.info));
const widgets = computed(() =>
    dashboardWidgets(metadata.value, variables.value, methods.value).filter(
        (widget) =>
            widget.resourceType !== "method" ||
            collaboratorAccess.value?.currentRole === "OWNER" ||
            collaboratorAccess.value?.currentRole === "USER",
    ),
);
const variableById = computed(() => Object.fromEntries(variables.value.map((item) => [item.id, item])));
const methodById = computed(() => Object.fromEntries(methods.value.map((item) => [item.id, item])));
const latestTelemetryById = computed<Record<string, LiveEvent>>(() => {
    const byName = Object.fromEntries(variables.value.map((variable) => [variable.name, variable.id]));
    return liveEvents.value.reduce<Record<string, LiveEvent>>((result, event) => {
        const id = event.variable_name ? byName[event.variable_name] : undefined;
        if (event.type === "event" && id && !result[id]) result[id] = event;
        return result;
    }, {});
});
const chartWidgets = computed(() =>
    widgets.value.filter(
        (widget): widget is VariableDashboardWidget =>
            widget.resourceType === "variable" && (widget.display === "line" || widget.display === "bar"),
    ),
);
const rangeFrom = computed(() => {
    const hours = historyRange.value === "1h" ? 1 : historyRange.value === "24h" ? 24 : 24 * 7;
    return new Date(Date.now() - hours * 60 * 60_000).toISOString();
});
const filteredHistory = computed(() =>
    historyResource.value
        ? analyticsStore.events.filter(
              (event) => event.variable_name === historyResource.value || event.method_name === historyResource.value,
          )
        : analyticsStore.events,
);
const activityLabel = computed(() => {
    if (!device.value?.lastEvent) return "No data received";
    return `Last activity ${new Date(device.value.lastEvent).toLocaleString()}`;
});

const editingName = ref(false);
const editName = ref("");
const nameInput = ref<HTMLInputElement>();

const startEdit = () => {
    editName.value = device.value?.name || "";
    editingName.value = true;
    nextTick(() => nameInput.value?.focus());
};
const saveName = async () => {
    const name = editName.value.trim().slice(0, 100);
    if (!name) return;
    await deviceStore.updateConsumerName(consumerId.value, name);
    editingName.value = false;
};

const loadCollaborators = async () => {
    collaboratorAccess.value = await DeviceService.getCollaborators(consumerId.value);
};
const saveCollaborator = async (clientId: string, role: string) => {
    try {
        await DeviceService.grantAccess(consumerId.value, clientId, role);
        await loadCollaborators();
    } catch (cause) {
        commandError.value = apiErrorMessage(cause);
    }
};
const removeCollaborator = async (clientId: string) => {
    try {
        await DeviceService.removeCollaborator(consumerId.value, clientId);
        await loadCollaborators();
    } catch (cause) {
        commandError.value = apiErrorMessage(cause);
    }
};

const regenerateToken = async () => {
    try {
        const token = await deviceStore.regenerateToken(consumerId.value);
        window.alert(`Token regenerated successfully.\n\nPlease save this JWT token:\n\n${token}`);
    } catch (cause) {
        window.alert(`Error regenerating token: ${apiErrorMessage(cause)}`);
    }
};

const payloadUnit = (widget: VariableDashboardWidget): string => {
    const event = latestTelemetryById.value[widget.resourceId];
    if (!event) return "";
    return (
        event.payload && typeof event.payload === "object" && typeof (event.payload as Record<string, unknown>).unit === "string"
            ? String((event.payload as Record<string, unknown>).unit)
            : ""
    );
};
const rawVariableValue = (variableId: string, path = "value") =>
    valueAtPath(latestTelemetryById.value[variableId]?.payload, path);
const widgetTitle = (widget: DashboardWidget) =>
    widget.title ||
    (widget.resourceType === "variable" ? variableById.value[widget.resourceId]?.name : methodById.value[widget.resourceId]?.name) ||
    "Unknown resource";
const variableWidget = (widget: DashboardWidget): widget is VariableDashboardWidget => widget.resourceType === "variable";
const methodWidget = (widget: DashboardWidget): widget is MethodDashboardWidget => widget.resourceType === "method";
const toggleValue = (widget: MethodDashboardWidget) =>
    widget.stateVariableId
        ? Boolean(rawVariableValue(widget.stateVariableId, widget.stateValuePath || "value"))
        : Boolean(localToggleValues[widget.id]);

const chartData = (widget: VariableDashboardWidget) => {
    const historical = historicalSeries.value[widget.id] || [];
    const live = liveEvents.value
        .filter((event) => event.type === "event" && event.variable_name === variableById.value[widget.resourceId]?.name)
        .map((event) => ({ bucket: event.ts || "", avg: Number(valueAtPath(event.payload, widget.valuePath || "value")) }))
        .filter((point) => Number.isFinite(point.avg))
        .reverse();
    const points = [...historical.map((point) => ({ bucket: point.bucket, avg: point.avg })), ...live].slice(-120);
    return { labels: points.map((point) => new Date(point.bucket).toLocaleTimeString()), values: points.map((point) => point.avg) };
};

const loadCharts = async () => {
    if (!device.value) return;
    const entries = await Promise.all(
        chartWidgets.value.map(async (widget) => {
            const variable = variableById.value[widget.resourceId];
            if (!variable) return [widget.id, []] as const;
            const points = await AnalyticsService.getValueSeries({
                consumerId: device.value!.id,
                variableName: variable.name,
                valuePath: widget.valuePath || "value",
                from: rangeFrom.value,
            });
            return [widget.id, points] as const;
        }),
    );
    historicalSeries.value = Object.fromEntries(entries);
};
const loadHistory = async () => {
    if (!device.value) return;
    await analyticsStore.load({ consumerId: device.value.id, from: rangeFrom.value, limit: 100 });
};

const connectSocket = () => {
    socket?.disconnect();
    liveEvents.value = [];
    if (!device.value) return;
    socket = new ContactsSocket(
        (message) => {
            liveEvents.value = [message, ...liveEvents.value].slice(0, 160);
            if (message.type === "error") commandError.value = message.message || message.code || "Execution error";
            if (message.type === "success") commandError.value = "";
        },
        (state) => (socketState.value = state),
    );
    socket.connect({ consumer_id: device.value.id, variables: variables.value.map((variable) => variable.name) });
};

const execute = (widget: MethodDashboardWidget, override?: boolean): boolean => {
    const method = methodById.value[widget.resourceId];
    if (!method) return false;
    try {
        if (widget.confirmation && !window.confirm(widget.confirmation)) return false;
        let input: unknown;
        if (method.input !== "VOID") {
            const value = override ?? commandValues[widget.id] ?? (method.input === "JSON" ? "{}" : "");
            input = method.input === "JSON" ? JSON.parse(String(value || "{}")) : value;
        }
        socket?.sendCommand({
            request_id: window.crypto.randomUUID(),
            consumer_id: consumerId.value,
            method_name: method.name,
            ...(input === undefined ? {} : { input }),
        });
        return true;
    } catch (cause) {
        commandError.value = apiErrorMessage(cause);
        return false;
    }
};
const toggle = (widget: MethodDashboardWidget) => {
    const nextValue = !toggleValue(widget);
    if (execute(widget, nextValue)) localToggleValues[widget.id] = nextValue;
};
const widgetRawValue = (widget: DashboardWidget) =>
    variableWidget(widget) ? rawVariableValue(widget.resourceId, widget.valuePath || "value") : undefined;
const widgetChartData = (widget: DashboardWidget) => (variableWidget(widget) ? chartData(widget) : { labels: [], values: [] });
const widgetToggleValue = (widget: DashboardWidget) => (methodWidget(widget) ? toggleValue(widget) : false);
const widgetBroken = (widget: DashboardWidget) =>
    widget.resourceType === "variable" ? !variableById.value[widget.resourceId] : !methodById.value[widget.resourceId];

watch([device, variables], () => connectSocket());
watch(device, async (current) => {
    if (!current) return;
    try {
        await loadCollaborators();
    } catch (cause) {
        commandError.value = apiErrorMessage(cause);
    }
}, { immediate: true });
watch([device, chartWidgets, historyRange], async () => {
    await Promise.all([loadCharts(), loadHistory()]);
}, { immediate: true, deep: true });
onMounted(async () => {
    const consumer = deviceStore.consumers.find((item) => item.id === consumerId.value);
    if (consumer) await templateStore.ensureTemplateDetail(consumer.templateId);
    connectSocket();
});
onBeforeUnmount(() => socket?.disconnect());
</script>

<template>
    <div v-if="!device" class="panel empty-state">
        <p>Device not found.</p>
        <button class="btn" type="button" @click="router.push('/')">Back to devices</button>
    </div>
    <div v-else class="stack">
        <section class="device-header panel">
            <button class="btn icon-button" type="button" aria-label="Back to devices" @click="router.push('/')">
                <i class="pi pi-arrow-left"></i>
            </button>
            <div class="device-icon"><i :class="String(metadata.icon || 'pi pi-server')"></i></div>
            <div class="device-header-copy">
                <div class="title-row">
                    <template v-if="editingName">
                        <input ref="nameInput" v-model="editName" class="input title-input" @keyup.enter="saveName" @keyup.escape="editingName = false" />
                        <button class="btn btn-primary icon-button" type="button" @click="saveName"><i class="pi pi-check"></i></button>
                    </template>
                    <template v-else>
                        <h1>{{ device.name }}</h1>
                        <button v-if="collaboratorAccess?.canManage" class="icon-button" type="button" aria-label="Rename" @click="startEdit"><i class="pi pi-pencil"></i></button>
                    </template>
                </div>
                <div class="device-meta">
                    <span>{{ device.templateName }}</span>
                    <span v-if="metadata.location"><i class="pi pi-map-marker"></i> {{ metadata.location }}</span>
                    <span v-if="metadata.criticality" class="criticality-badge" :class="String(metadata.criticality)">{{ metadata.criticality }} criticality</span>
                    <span>{{ activityLabel }}</span>
                </div>
            </div>
            <div class="device-header-actions">
                <span class="status-badge" :class="socketState">WS {{ socketState }}</span>
                <button v-if="collaboratorAccess?.canManage" class="btn" type="button" @click="regenerateToken"><i class="pi pi-refresh"></i> Reset token</button>
            </div>
        </section>

        <div class="tabs">
            <button :class="{ active: activeTab === 'dashboard' }" type="button" @click="activeTab = 'dashboard'">Dashboard</button>
            <button :class="{ active: activeTab === 'history' }" type="button" @click="activeTab = 'history'">History</button>
            <button :class="{ active: activeTab === 'access' }" type="button" @click="activeTab = 'access'">Access</button>
        </div>

        <div v-if="commandError" class="notice error">{{ commandError }}</div>

        <section v-if="activeTab === 'dashboard'">
            <div v-if="widgets.length === 0" class="panel empty-state">No dashboard widgets configured.</div>
            <div v-else class="widget-grid">
                <DashboardWidgetCard
                    v-for="widget in widgets"
                    :key="widget.id"
                    :widget="widget"
                    :title="widgetTitle(widget)"
                    :variable-type="widget.resourceType === 'variable' ? variableById[widget.resourceId]?.type : undefined"
                    :raw-value="widgetRawValue(widget)"
                    :payload-unit="widget.resourceType === 'variable' ? payloadUnit(widget) : ''"
                    :chart-data="widgetChartData(widget)"
                    :toggle-value="widgetToggleValue(widget)"
                    :command-value="commandValues[widget.id]"
                    :disabled="socketState !== 'open'"
                    :broken="widgetBroken(widget)"
                    @execute="methodWidget(widget) && execute(widget)"
                    @toggle="methodWidget(widget) && toggle(widget)"
                    @update:command-value="commandValues[widget.id] = $event"
                />
            </div>
        </section>

        <section v-else-if="activeTab === 'history'" class="panel">
            <div class="panel-header history-toolbar">
                <h2>Event history</h2>
                <div class="toolbar">
                    <select v-model="historyResource" class="select compact-select">
                        <option value="">All resources</option>
                        <option v-for="variable in variables" :key="variable.id" :value="variable.name">{{ variable.name }}</option>
                        <option v-for="method in methods" :key="method.id" :value="method.name">{{ method.name }}</option>
                    </select>
                    <select v-model="historyRange" class="select compact-select">
                        <option value="1h">Last hour</option>
                        <option value="24h">Last 24 hours</option>
                        <option value="7d">Last 7 days</option>
                    </select>
                </div>
            </div>
            <div class="panel-body event-list">
                <div v-if="filteredHistory.length === 0" class="empty-state">No historical events found.</div>
                <div v-for="event in filteredHistory" :key="event.event_id" class="event-row">
                    <div><strong>{{ event.action }}</strong><div class="muted">{{ event.method_name || event.variable_name || "Device" }}</div></div>
                    <span class="mono muted">{{ new Date(event.occurred_at).toLocaleString() }}</span>
                </div>
            </div>
        </section>

        <CollaboratorsPanel
            v-else-if="collaboratorAccess"
            :collaborators="collaboratorAccess.collaborators"
            :roles="['OWNER', 'USER', 'VIEWER']"
            :can-manage="collaboratorAccess.canManage"
            :current-user-id="authStore.currentUser?.id"
            @save="saveCollaborator"
            @remove="removeCollaborator"
        />
    </div>
</template>

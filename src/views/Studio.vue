<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { apiErrorMessage } from "@/api/client";
import { TemplateService } from "@/api/services/TemplateService";
import CollaboratorsPanel from "@/components/CollaboratorsPanel.vue";
import DashboardWidgetCard from "@/components/DashboardWidgetCard.vue";
import { useAuthStore, useTemplateStore } from "@/infra/store";
import {
    dashboardWidgets,
    fallbackMethodControl,
    fallbackVariableDisplay,
    methodControlsFor,
    parseTemplateInfo,
    sortedThresholds,
    validateTemplateMetadata,
    variableDisplaysFor,
    type CollaboratorsResponse,
    type CreateMethodPayload,
    type CreateVariablePayload,
    type DashboardWidget,
    type DomainType,
    type MethodDashboardWidget,
    type TemplateMetadata,
    type TemplateRole,
    type TemplateState,
    type VariableDashboardWidget,
    type WidgetWidth,
} from "@/domain";

type StudioTab = "metadata" | "contracts" | "collaborators";
type MetadataMode = "general" | "layout" | "custom" | "json";
type CustomPropertyType = "string" | "number" | "boolean" | "null" | "string-array" | "object" | "array";

const templateStore = useTemplateStore();
const authStore = useAuthStore();
const selectedTemplateId = ref("");
const activeTab = ref<StudioTab>("metadata");
const metadataMode = ref<MetadataMode>("layout");
const search = ref("");
const error = ref("");
const showCreate = ref(false);
const createName = ref("");
const createDisplayName = ref("");
const createLocation = ref("");
const metadata = ref<TemplateMetadata>({});
const widgets = ref<DashboardWidget[]>([]);
const savedSnapshot = ref("");
const selectedWidgetId = ref("");
const resourceSearch = ref("");
const iconSearch = ref("");
const jsonDraft = ref("");
const jsonError = ref("");
const customErrors = reactive<Record<string, string>>({});
const customKey = ref("");
const customType = ref<CustomPropertyType>("string");
const draggedIndex = ref<number | null>(null);
const showResourceDrawer = ref(false);
const showInspectorDrawer = ref(false);
const sampleValues = reactive<Record<string, string | number | boolean>>({});
const sampleCommands = reactive<Record<string, string | number | boolean>>({});
const sampleToggles = reactive<Record<string, boolean>>({});
const variableDraft = reactive<CreateVariablePayload>(templateStore.emptyVariable());
const methodDraft = reactive<CreateMethodPayload>(templateStore.emptyMethod());
const variableEdits = reactive<Record<string, CreateVariablePayload>>({});
const methodEdits = reactive<Record<string, CreateMethodPayload>>({});
const collaboratorAccess = ref<(CollaboratorsResponse<TemplateRole> & { canEdit: boolean }) | null>(null);

const typeOptions: DomainType[] = ["VOID", "TEXT", "INTEGER", "FLOAT", "BOOLEAN", "JSON", "UUID", "DATE", "TIMESTAMP"];
const variableTypes = typeOptions.filter((type) => type !== "VOID");
const states: TemplateState[] = ["DRAFT", "PUBLIC", "ARCHIVED"];
const widths: WidgetWidth[] = [1, 2, 3];
const customTypes: CustomPropertyType[] = ["string", "number", "boolean", "null", "string-array", "object", "array"];
const reservedMetadataKeys = new Set(["displayName", "location", "tags", "icon", "criticality", "ui"]);
const iconOptions = [
    "pi pi-server",
    "pi pi-desktop",
    "pi pi-microchip",
    "pi pi-bolt",
    "pi pi-sun",
    "pi pi-cloud",
    "pi pi-home",
    "pi pi-building",
    "pi pi-car",
    "pi pi-wifi",
    "pi pi-database",
    "pi pi-cog",
    "pi pi-gauge",
    "pi pi-chart-line",
    "pi pi-shield",
    "pi pi-mobile",
];

const selectedTemplate = computed(() => templateStore.templates.find((item) => item.id === selectedTemplateId.value));
const variables = computed(() => (selectedTemplateId.value ? templateStore.variablesByTemplate[selectedTemplateId.value] || [] : []));
const methods = computed(() => (selectedTemplateId.value ? templateStore.methodsByTemplate[selectedTemplateId.value] || [] : []));
const variableById = computed(() => Object.fromEntries(variables.value.map((item) => [item.id, item])));
const methodById = computed(() => Object.fromEntries(methods.value.map((item) => [item.id, item])));
const canEdit = computed(() => Boolean(collaboratorAccess.value?.canEdit));
const filteredTemplates = computed(() => {
    const query = search.value.trim().toLowerCase();
    return query ? templateStore.templates.filter((item) => item.name.toLowerCase().includes(query)) : templateStore.templates;
});
const filteredResources = computed(() => {
    const query = resourceSearch.value.trim().toLowerCase();
    return [
        ...variables.value.map((resource) => ({ type: "variable" as const, resource })),
        ...methods.value.map((resource) => ({ type: "method" as const, resource })),
    ].filter((item) => !query || `${item.resource.name} ${"type" in item.resource ? item.resource.type : item.resource.input}`.toLowerCase().includes(query));
});
const filteredIcons = computed(() => {
    const query = iconSearch.value.trim().toLowerCase();
    return iconOptions.filter((icon) => !query || icon.includes(query));
});
const selectedWidget = computed(() => widgets.value.find((widget) => widget.id === selectedWidgetId.value));
const customProperties = computed(() => Object.entries(metadata.value).filter(([key]) => !reservedMetadataKeys.has(key)));
const normalizedWidgets = computed(() =>
    widgets.value.map((widget) =>
        widget.resourceType === "variable" && widget.thresholds
            ? { ...widget, thresholds: sortedThresholds(widget) }
            : widget,
    ),
);
const draftInfo = computed<TemplateMetadata>(() => ({
    ...metadata.value,
    ui: {
        ...(metadata.value.ui || {}),
        version: 1,
        widgets: normalizedWidgets.value,
    },
}));
const currentSnapshot = computed(() => JSON.stringify(draftInfo.value));
const validationErrors = computed(() => validateTemplateMetadata(draftInfo.value, variables.value, methods.value));
const editorErrors = computed(() => [...validationErrors.value, ...Object.values(customErrors)]);
const jsonNeedsApply = computed(() => metadataMode.value === "json" && jsonDraft.value !== JSON.stringify(draftInfo.value, null, 2));
const isDirty = computed(() => Boolean(selectedTemplate.value) && (currentSnapshot.value !== savedSnapshot.value || jsonNeedsApply.value || Object.keys(customErrors).length > 0));

const run = async (action: () => Promise<void>) => {
    error.value = "";
    try {
        await action();
    } catch (cause) {
        error.value = apiErrorMessage(cause);
    }
};
const deepCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const updateJsonDraft = () => {
    jsonDraft.value = JSON.stringify(draftInfo.value, null, 2);
    jsonError.value = "";
};
const resetSampleValues = () => {
    Object.keys(sampleValues).forEach((key) => delete sampleValues[key]);
    Object.keys(sampleCommands).forEach((key) => delete sampleCommands[key]);
    Object.keys(sampleToggles).forEach((key) => delete sampleToggles[key]);
    widgets.value.forEach((widget) => initializeSample(widget));
};
const syncEditor = () => {
    const parsed = parseTemplateInfo(selectedTemplate.value?.info);
    Object.keys(customErrors).forEach((key) => delete customErrors[key]);
    metadata.value = deepCopy(parsed);
    widgets.value = deepCopy(dashboardWidgets(parsed, variables.value, methods.value));
    savedSnapshot.value = JSON.stringify(draftInfo.value);
    selectedWidgetId.value = widgets.value[0]?.id || "";
    resetSampleValues();
    updateJsonDraft();
    variables.value.forEach((item) => (variableEdits[item.id] = { name: item.name, type: item.type, description: item.description || "" }));
    methods.value.forEach((item) => (methodEdits[item.id] = { name: item.name, input: item.input, description: item.description || "" }));
};
const loadCollaborators = async () => {
    if (!selectedTemplateId.value) return;
    collaboratorAccess.value = await TemplateService.getCollaborators(selectedTemplateId.value);
};
const confirmDiscard = () => !isDirty.value || window.confirm("Discard unsaved metadata changes?");
const chooseTemplate = (id: string) => {
    if (!confirmDiscard()) return;
    selectedTemplateId.value = id;
};
const closeTemplate = () => {
    if (!confirmDiscard()) return;
    selectedTemplateId.value = "";
};
const setActiveTab = (tab: StudioTab) => {
    if (tab !== activeTab.value && !confirmDiscard()) return;
    activeTab.value = tab;
};
const setMetadataMode = (mode: MetadataMode) => {
    if (metadataMode.value === "json" && mode !== "json" && jsonNeedsApply.value) {
        if (!window.confirm("Discard unapplied JSON changes?")) return;
        updateJsonDraft();
    }
    if (metadataMode.value === "custom" && mode !== "custom" && Object.keys(customErrors).length) {
        if (!window.confirm("Discard invalid custom property changes?")) return;
        Object.keys(customErrors).forEach((key) => delete customErrors[key]);
    }
    metadataMode.value = mode;
    if (mode === "json") updateJsonDraft();
};
const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty.value) return;
    event.preventDefault();
};

watch(selectedTemplateId, async (id) => {
    activeTab.value = "metadata";
    metadataMode.value = "layout";
    collaboratorAccess.value = null;
    if (!id) return;
    try {
        await Promise.all([templateStore.ensureTemplateDetail(id), loadCollaborators()]);
        syncEditor();
    } catch (cause) {
        error.value = apiErrorMessage(cause);
    }
});
onMounted(() => window.addEventListener("beforeunload", handleBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", handleBeforeUnload));
onBeforeRouteLeave(() => confirmDiscard());

const saveDashboard = () =>
    run(async () => {
        if (!selectedTemplate.value || editorErrors.value.length || jsonNeedsApply.value) return;
        const info = deepCopy(draftInfo.value);
        await templateStore.updateTemplate(selectedTemplate.value.id, { info: JSON.stringify(info) });
        metadata.value = info;
        widgets.value = deepCopy(info.ui?.widgets || []);
        savedSnapshot.value = JSON.stringify(draftInfo.value);
        updateJsonDraft();
    });
const saveCollaborator = (clientId: string, role: string) =>
    run(async () => {
        await TemplateService.grantAccess(selectedTemplateId.value, clientId, role);
        await loadCollaborators();
    });
const removeCollaborator = (clientId: string) =>
    run(async () => {
        await TemplateService.removeCollaborator(selectedTemplateId.value, clientId);
        await loadCollaborators();
    });
const updateState = (state: TemplateState) =>
    run(async () => {
        if (selectedTemplate.value) await templateStore.updateTemplate(selectedTemplate.value.id, { state });
    });
const createTemplate = () =>
    run(async () => {
        const id = await templateStore.createTemplate({
            name: createName.value,
            info: JSON.stringify({ displayName: createDisplayName.value || undefined, location: createLocation.value || undefined }),
        });
        createName.value = "";
        createDisplayName.value = "";
        createLocation.value = "";
        showCreate.value = false;
        selectedTemplateId.value = id;
    });
const createVariable = () =>
    run(async () => {
        await templateStore.createVariable(selectedTemplateId.value, variableDraft);
        Object.assign(variableDraft, templateStore.emptyVariable());
        syncEditor();
    });
const createMethod = () =>
    run(async () => {
        await templateStore.createMethod(selectedTemplateId.value, methodDraft);
        Object.assign(methodDraft, templateStore.emptyMethod());
        syncEditor();
    });

function initializeSample(widget: DashboardWidget) {
    if (widget.resourceType === "variable") {
        const type = variableById.value[widget.resourceId]?.type;
        sampleValues[widget.id] = type === "BOOLEAN" ? true : type === "INTEGER" || type === "FLOAT" ? 24.6 : "Sample value";
    } else {
        sampleCommands[widget.id] = methodById.value[widget.resourceId]?.input === "JSON" ? "{}" : "";
        sampleToggles[widget.id] = false;
    }
}
const addWidget = (type: "variable" | "method", resourceId: string) => {
    if (!canEdit.value) return;
    const id = window.crypto.randomUUID();
    const widget: DashboardWidget =
        type === "variable"
            ? {
                  id,
                  resourceType: "variable",
                  resourceId,
                  title: variableById.value[resourceId]?.name || "Variable",
                  width: 1,
                  display: fallbackVariableDisplay(variableById.value[resourceId]),
                  valuePath: "value",
              }
            : {
                  id,
                  resourceType: "method",
                  resourceId,
                  title: methodById.value[resourceId]?.name || "Method",
                  width: 1,
                  control: fallbackMethodControl(methodById.value[resourceId]),
              };
    widgets.value.push(widget);
    initializeSample(widget);
    selectedWidgetId.value = widget.id;
    showInspectorDrawer.value = true;
};
const moveWidget = (index: number, delta: number) => {
    const target = index + delta;
    if (!canEdit.value || target < 0 || target >= widgets.value.length) return;
    const [widget] = widgets.value.splice(index, 1);
    widgets.value.splice(target, 0, widget);
};
const removeWidget = (id: string) => {
    if (!canEdit.value) return;
    const index = widgets.value.findIndex((widget) => widget.id === id);
    if (index < 0) return;
    widgets.value.splice(index, 1);
    selectedWidgetId.value = widgets.value[Math.min(index, widgets.value.length - 1)]?.id || "";
};
const dropWidget = (index: number) => {
    if (!canEdit.value || draggedIndex.value === null || draggedIndex.value === index) return;
    const [widget] = widgets.value.splice(draggedIndex.value, 1);
    widgets.value.splice(index, 0, widget);
    draggedIndex.value = null;
};
const dropResource = (type: "variable" | "method", resourceId: string) => addWidget(type, resourceId);
const titleFor = (widget: DashboardWidget) =>
    widget.title || (widget.resourceType === "variable" ? variableById.value[widget.resourceId]?.name : methodById.value[widget.resourceId]?.name) || "Missing resource";
const widgetBroken = (widget: DashboardWidget) =>
    widget.resourceType === "variable" ? !variableById.value[widget.resourceId] : !methodById.value[widget.resourceId];
const sampleChart = (widget: DashboardWidget) => {
    const value = Number(sampleValues[widget.id]) || 24;
    return { labels: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"], values: [value - 3, value - 1, value + 2, value, value + 1, value] };
};
const selectWidget = (id: string) => {
    selectedWidgetId.value = id;
    showInspectorDrawer.value = true;
};
const selectedWidgetIndex = computed(() => widgets.value.findIndex((widget) => widget.id === selectedWidgetId.value));
const selectedVariableWidget = computed(() => (selectedWidget.value?.resourceType === "variable" ? selectedWidget.value : null));
const selectedMethodWidget = computed(() => (selectedWidget.value?.resourceType === "method" ? selectedWidget.value : null));
const variableDisplays = (widget: VariableDashboardWidget) => variableDisplaysFor(variableById.value[widget.resourceId]?.type);
const methodControls = (widget: MethodDashboardWidget) => methodControlsFor(methodById.value[widget.resourceId]?.input);
const addThreshold = (widget: VariableDashboardWidget) => {
    if (!canEdit.value) return;
    widget.thresholds = [...(widget.thresholds || []), { value: 0, color: "#2563eb" }];
};
const removeThreshold = (widget: VariableDashboardWidget, index: number) => {
    if (!canEdit.value) return;
    widget.thresholds = (widget.thresholds || []).filter((_, ruleIndex) => ruleIndex !== index);
};

const propertyType = (value: unknown): CustomPropertyType => {
    if (value === null) return "null";
    if (Array.isArray(value)) return value.every((item) => typeof item === "string") ? "string-array" : "array";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "string") return "string";
    return "object";
};
const defaultPropertyValue = (type: CustomPropertyType): unknown => {
    if (type === "number") return 0;
    if (type === "boolean") return false;
    if (type === "null") return null;
    if (type === "string-array" || type === "array") return [];
    if (type === "object") return {};
    return "";
};
const addCustomProperty = () => {
    const key = customKey.value.trim();
    if (!canEdit.value || !key || reservedMetadataKeys.has(key) || Object.prototype.hasOwnProperty.call(metadata.value, key)) return;
    metadata.value[key] = defaultPropertyValue(customType.value);
    customKey.value = "";
};
const changeCustomType = (key: string, type: CustomPropertyType) => {
    metadata.value[key] = defaultPropertyValue(type);
    delete customErrors[key];
};
const customJson = (value: unknown) => JSON.stringify(value, null, 2);
const updateCustomJson = (key: string, event: Event) => {
    try {
        metadata.value[key] = JSON.parse((event.target as HTMLTextAreaElement).value) as unknown;
        delete customErrors[key];
    } catch {
        customErrors[key] = "Enter valid JSON.";
    }
};
const removeCustomProperty = (key: string) => {
    if (!canEdit.value) return;
    delete metadata.value[key];
    delete customErrors[key];
};
const applyJson = () => {
    jsonError.value = "";
    try {
        const parsed = JSON.parse(jsonDraft.value) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Metadata must be a JSON object.");
        const nextMetadata = parsed as TemplateMetadata;
        const errors = validateTemplateMetadata(nextMetadata, variables.value, methods.value);
        if (errors.length) throw new Error(errors.join("\n"));
        metadata.value = deepCopy(nextMetadata);
        widgets.value = deepCopy(dashboardWidgets(nextMetadata, variables.value, methods.value));
        selectedWidgetId.value = widgets.value[0]?.id || "";
        resetSampleValues();
        updateJsonDraft();
    } catch (cause) {
        jsonError.value = cause instanceof Error ? cause.message : "Enter valid JSON.";
    }
};
</script>

<template>
    <div class="stack">
        <template v-if="!selectedTemplate">
            <header class="page-heading">
                <div><span class="eyebrow">Template builder</span><h1>Studio</h1><p>Configure device resources and dashboard presentation.</p></div>
                <div class="toolbar"><input v-model="search" class="input search-input" placeholder="Search templates" /><button class="btn btn-primary" type="button" @click="showCreate = true"><i class="pi pi-plus"></i> New template</button></div>
            </header>
            <div class="template-grid">
                <article v-for="template in filteredTemplates" :key="template.id" class="template-card" @click="chooseTemplate(template.id)">
                    <div class="device-icon"><i class="pi pi-sitemap"></i></div>
                    <div><h2>{{ template.name }}</h2><p>Version {{ template.version }}</p></div>
                    <span class="status-badge">{{ template.state }}</span>
                </article>
            </div>
        </template>

        <template v-else>
            <header class="device-header panel">
                <button class="btn icon-button" type="button" @click="closeTemplate"><i class="pi pi-arrow-left"></i></button>
                <div class="device-header-copy"><span class="eyebrow">Template editor</span><h1>{{ selectedTemplate.name }}</h1><div class="device-meta"><span>Version {{ selectedTemplate.version }}</span><span>{{ variables.length }} variables</span><span>{{ methods.length }} methods</span></div></div>
                <div class="device-header-actions">
                    <span v-if="isDirty" class="status-badge warning">Unsaved changes</span>
                    <select class="select compact-select" :disabled="!canEdit" :value="selectedTemplate.state" @change="updateState(($event.target as HTMLSelectElement).value as TemplateState)"><option v-for="state in states" :key="state">{{ state }}</option></select>
                    <button v-if="activeTab === 'metadata' && canEdit" class="btn btn-primary" type="button" :disabled="editorErrors.length > 0 || jsonNeedsApply" @click="saveDashboard"><i class="pi pi-save"></i> Save metadata</button>
                </div>
            </header>
            <div v-if="error" class="notice error">{{ error }}</div>

            <div class="tabs">
                <button :class="{ active: activeTab === 'metadata' }" type="button" @click="setActiveTab('metadata')">Template metadata</button>
                <button :class="{ active: activeTab === 'contracts' }" type="button" @click="setActiveTab('contracts')">Contracts</button>
                <button :class="{ active: activeTab === 'collaborators' }" type="button" @click="setActiveTab('collaborators')">Collaborators</button>
            </div>

            <div v-if="activeTab === 'metadata'" class="stack">
                <div v-if="!canEdit" class="notice">Metadata is read only for your current template role.</div>
                <div v-if="editorErrors.length" class="notice error">
                    <strong>Resolve metadata errors before saving.</strong>
                    <ul><li v-for="message in editorErrors" :key="message">{{ message }}</li></ul>
                </div>

                <div class="metadata-editor">
                    <aside class="metadata-sidebar panel" :class="{ 'mobile-open': showResourceDrawer }">
                        <div class="panel-header"><h2>Template metadata</h2><button class="icon-button mobile-only" type="button" @click="showResourceDrawer = false"><i class="pi pi-times"></i></button></div>
                        <nav class="metadata-mode-nav">
                            <button :class="{ active: metadataMode === 'general' }" type="button" @click="setMetadataMode('general')"><i class="pi pi-sliders-h"></i> General</button>
                            <button :class="{ active: metadataMode === 'layout' }" type="button" @click="setMetadataMode('layout')"><i class="pi pi-th-large"></i> Dashboard layout</button>
                            <button :class="{ active: metadataMode === 'custom' }" type="button" @click="setMetadataMode('custom')"><i class="pi pi-list"></i> Custom properties</button>
                            <button :class="{ active: metadataMode === 'json' }" type="button" @click="setMetadataMode('json')"><i class="pi pi-code"></i> JSON</button>
                        </nav>
                        <div v-if="metadataMode === 'layout'" class="resource-catalog">
                            <label class="field">Resources<input v-model="resourceSearch" class="input" placeholder="Search resources" /></label>
                            <button
                                v-for="item in filteredResources"
                                :key="`${item.type}-${item.resource.id}`"
                                class="resource-catalog-item"
                                type="button"
                                :disabled="!canEdit"
                                draggable="true"
                                @dragstart="$event.dataTransfer?.setData('text/plain', `${item.type}:${item.resource.id}`)"
                                @click="addWidget(item.type, item.resource.id)"
                            >
                                <i :class="item.type === 'variable' ? 'pi pi-chart-line' : 'pi pi-bolt'"></i>
                                <span><strong>{{ item.resource.name }}</strong><small>{{ item.type }} · {{ "type" in item.resource ? item.resource.type : item.resource.input }}</small></span>
                                <i class="pi pi-plus"></i>
                            </button>
                        </div>
                    </aside>

                    <main class="metadata-workspace">
                        <div class="mobile-editor-toolbar">
                            <button class="btn" type="button" @click="showResourceDrawer = true"><i class="pi pi-list"></i> Metadata</button>
                            <button v-if="metadataMode === 'layout'" class="btn" type="button" @click="showInspectorDrawer = true"><i class="pi pi-sliders-h"></i> Inspector</button>
                        </div>

                        <section v-if="metadataMode === 'general'" class="panel">
                            <div class="panel-header"><div><h2>General metadata</h2><p class="muted">Identity and context shown across consumer views.</p></div></div>
                            <div class="panel-body form-grid">
                                <label class="field">Display name<input v-model="metadata.displayName" class="input" :disabled="!canEdit" /></label>
                                <label class="field">Location<input v-model="metadata.location" class="input" :disabled="!canEdit" /></label>
                                <label class="field full-span">Tags<input :value="Array.isArray(metadata.tags) ? metadata.tags.join(', ') : ''" class="input" :disabled="!canEdit" placeholder="office, climate" @input="metadata.tags = ($event.target as HTMLInputElement).value.split(',').map((item) => item.trim()).filter(Boolean)" /></label>
                                <label class="field">Criticality<select v-model="metadata.criticality" class="select" :disabled="!canEdit"><option value="">Not set</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                                <label class="field">Icon search<input v-model="iconSearch" class="input" placeholder="Search icon" /></label>
                                <div class="field full-span"><span>Icon</span><div class="icon-picker"><button v-for="icon in filteredIcons" :key="icon" class="icon-picker-item" :class="{ active: metadata.icon === icon }" type="button" :disabled="!canEdit" :title="icon" @click="metadata.icon = icon"><i :class="icon"></i></button></div></div>
                            </div>
                        </section>

                        <section v-else-if="metadataMode === 'layout'" class="stack">
                            <div class="panel dashboard-canvas">
                                <div class="panel-header"><div><h2>Dashboard layout</h2><p class="muted">Ordered 3-column grid. Add the same resource more than once when needed.</p></div><span class="muted">{{ widgets.length }} widgets</span></div>
                                <div
                                    class="panel-body widget-grid"
                                    @dragover.prevent
                                    @drop="($event) => { const [type, id] = $event.dataTransfer?.getData('text/plain').split(':') || []; if (type === 'variable' || type === 'method') dropResource(type, id); }"
                                >
                                    <div v-if="widgets.length === 0" class="empty-state widget-span-3">Add a resource from the catalog to build the dashboard.</div>
                                    <div
                                        v-for="(widget, index) in widgets"
                                        :key="widget.id"
                                        class="studio-widget-shell"
                                        :class="`widget-span-${widget.width}`"
                                        :draggable="canEdit"
                                        @dragstart.stop="draggedIndex = index"
                                        @dragover.prevent
                                        @drop.stop="dropWidget(index)"
                                    >
                                        <span class="drag-handle"><i class="pi pi-bars"></i></span>
                                        <DashboardWidgetCard
                                            :widget="widget"
                                            :title="titleFor(widget)"
                                            :variable-type="widget.resourceType === 'variable' ? variableById[widget.resourceId]?.type : undefined"
                                            :raw-value="sampleValues[widget.id]"
                                            :chart-data="sampleChart(widget)"
                                            :toggle-value="sampleToggles[widget.id]"
                                            :command-value="sampleCommands[widget.id]"
                                            :broken="widgetBroken(widget)"
                                            :selected="selectedWidgetId === widget.id"
                                            @select="selectWidget(widget.id)"
                                            @toggle="sampleToggles[widget.id] = !sampleToggles[widget.id]"
                                            @update:command-value="sampleCommands[widget.id] = $event"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section v-else-if="metadataMode === 'custom'" class="panel">
                            <div class="panel-header"><div><h2>Custom properties</h2><p class="muted">Additional top-level values preserved in template info.</p></div></div>
                            <div class="panel-body stack">
                                <div v-if="customProperties.length === 0" class="empty-state">No custom properties configured.</div>
                                <div v-for="[key, value] in customProperties" :key="key" class="custom-property">
                                    <strong>{{ key }}</strong>
                                    <select class="select" :value="propertyType(value)" :disabled="!canEdit" @change="changeCustomType(key, ($event.target as HTMLSelectElement).value as CustomPropertyType)"><option v-for="type in customTypes" :key="type">{{ type }}</option></select>
                                    <select v-if="propertyType(value) === 'boolean'" class="select" :value="String(value)" :disabled="!canEdit" @change="metadata[key] = ($event.target as HTMLSelectElement).value === 'true'"><option value="true">true</option><option value="false">false</option></select>
                                    <span v-else-if="propertyType(value) === 'null'" class="muted">null</span>
                                    <textarea v-else-if="propertyType(value) === 'object' || propertyType(value) === 'array' || propertyType(value) === 'string-array'" class="textarea mono" :value="customJson(value)" :disabled="!canEdit" @change="updateCustomJson(key, $event)"></textarea>
                                    <input v-else class="input" :type="propertyType(value) === 'number' ? 'number' : 'text'" :value="value as string | number" :disabled="!canEdit" @input="metadata[key] = propertyType(value) === 'number' ? Number(($event.target as HTMLInputElement).value) : ($event.target as HTMLInputElement).value" />
                                    <button v-if="canEdit" class="icon-button danger" type="button" @click="removeCustomProperty(key)"><i class="pi pi-trash"></i></button>
                                    <span v-if="customErrors[key]" class="notice error">{{ customErrors[key] }}</span>
                                </div>
                                <form v-if="canEdit" class="custom-property-add" @submit.prevent="addCustomProperty">
                                    <input v-model="customKey" class="input" placeholder="New top-level key" required />
                                    <select v-model="customType" class="select"><option v-for="type in customTypes" :key="type">{{ type }}</option></select>
                                    <button class="btn" type="submit"><i class="pi pi-plus"></i> Add property</button>
                                </form>
                            </div>
                        </section>

                        <section v-else class="panel">
                            <div class="panel-header"><div><h2>Metadata JSON</h2><p class="muted">Edit the complete info object, including unknown fields.</p></div></div>
                            <div class="panel-body stack">
                                <div v-if="jsonError" class="notice error mono">{{ jsonError }}</div>
                                <div v-else-if="jsonNeedsApply" class="notice">Apply JSON changes before saving metadata.</div>
                                <textarea v-model="jsonDraft" class="textarea mono metadata-json" :disabled="!canEdit"></textarea>
                                <div v-if="canEdit" class="row-actions"><button class="btn" type="button" @click="applyJson"><i class="pi pi-check"></i> Apply JSON</button></div>
                            </div>
                        </section>
                    </main>

                    <aside v-if="metadataMode === 'layout'" class="metadata-inspector panel" :class="{ 'mobile-open': showInspectorDrawer }">
                        <div class="panel-header"><h2>Inspector</h2><button class="icon-button mobile-only" type="button" @click="showInspectorDrawer = false"><i class="pi pi-times"></i></button></div>
                        <div v-if="!selectedWidget" class="panel-body empty-state">Select a widget to configure it.</div>
                        <div v-else class="panel-body inspector-fields">
                            <div><span class="resource-kind">{{ selectedWidget.resourceType }}</span><h3>{{ titleFor(selectedWidget) }}</h3></div>
                            <div v-if="widgetBroken(selectedWidget)" class="notice error">This contract was removed. Delete this widget or restore the resource.</div>
                            <label class="field">Title<input v-model="selectedWidget.title" class="input" :disabled="!canEdit" /></label>
                            <label class="field">Width<select v-model="selectedWidget.width" class="select" :disabled="!canEdit"><option v-for="width in widths" :key="width" :value="width">{{ width }} column{{ width > 1 ? "s" : "" }}</option></select></label>

                            <template v-if="selectedVariableWidget">
                                <label class="field">Display<select v-model="selectedVariableWidget.display" class="select" :disabled="!canEdit"><option v-for="display in variableDisplays(selectedVariableWidget)" :key="display">{{ display }}</option></select></label>
                                <label class="field">Sample value<select v-if="variableById[selectedVariableWidget.resourceId]?.type === 'BOOLEAN'" v-model="sampleValues[selectedVariableWidget.id]" class="select"><option :value="true">true</option><option :value="false">false</option></select><input v-else v-model="sampleValues[selectedVariableWidget.id]" class="input" :type="variableById[selectedVariableWidget.resourceId]?.type === 'INTEGER' || variableById[selectedVariableWidget.resourceId]?.type === 'FLOAT' ? 'number' : 'text'" /></label>
                                <label class="field">Value path<input v-model="selectedVariableWidget.valuePath" class="input" :disabled="!canEdit" placeholder="value" /></label>
                                <label class="field">Unit<input v-model="selectedVariableWidget.unit" class="input" :disabled="!canEdit" placeholder="C" /></label>
                                <label class="field">Precision<input v-model.number="selectedVariableWidget.precision" class="input" type="number" min="0" max="6" :disabled="!canEdit" /></label>
                                <label class="field">Accent color<input v-model="selectedVariableWidget.color" class="input" :disabled="!canEdit" placeholder="#2563eb" /></label>
                                <template v-if="selectedVariableWidget.display === 'status'">
                                    <label class="field">True label<input v-model="selectedVariableWidget.trueLabel" class="input" :disabled="!canEdit" placeholder="Active" /></label>
                                    <label class="field">True color<input v-model="selectedVariableWidget.trueColor" class="input" :disabled="!canEdit" placeholder="#159a73" /></label>
                                    <label class="field">False label<input v-model="selectedVariableWidget.falseLabel" class="input" :disabled="!canEdit" placeholder="Inactive" /></label>
                                    <label class="field">False color<input v-model="selectedVariableWidget.falseColor" class="input" :disabled="!canEdit" placeholder="#667085" /></label>
                                </template>
                                <template v-else>
                                    <div class="inspector-row">
                                        <label class="field">Min<input v-model.number="selectedVariableWidget.min" class="input" type="number" :disabled="!canEdit" /></label>
                                        <label class="field">Max<input v-model.number="selectedVariableWidget.max" class="input" type="number" :disabled="!canEdit" /></label>
                                    </div>
                                    <div class="threshold-editor">
                                        <div class="section-label"><span>Thresholds</span><button v-if="canEdit" class="icon-button" type="button" @click="addThreshold(selectedVariableWidget)"><i class="pi pi-plus"></i></button></div>
                                        <div v-for="(rule, index) in selectedVariableWidget.thresholds || []" :key="index" class="threshold-row">
                                            <input v-model.number="rule.value" class="input" type="number" :disabled="!canEdit" placeholder="Value" />
                                            <input v-model="rule.color" class="input" :disabled="!canEdit" placeholder="#2563eb" />
                                            <input v-model="rule.label" class="input" :disabled="!canEdit" placeholder="Label" />
                                            <button v-if="canEdit" class="icon-button danger" type="button" @click="removeThreshold(selectedVariableWidget, index)"><i class="pi pi-trash"></i></button>
                                        </div>
                                    </div>
                                </template>
                            </template>

                            <template v-else-if="selectedMethodWidget">
                                <label class="field">Control<select v-model="selectedMethodWidget.control" class="select" :disabled="!canEdit"><option v-for="control in methodControls(selectedMethodWidget)" :key="control">{{ control }}</option></select></label>
                                <label class="field">Action label<input v-model="selectedMethodWidget.actionLabel" class="input" :disabled="!canEdit" placeholder="Send" /></label>
                                <label v-if="selectedMethodWidget.control === 'text' || selectedMethodWidget.control === 'number' || selectedMethodWidget.control === 'json'" class="field">Placeholder<input v-model="selectedMethodWidget.placeholder" class="input" :disabled="!canEdit" placeholder="Value" /></label>
                                <template v-if="selectedMethodWidget.control === 'toggle'">
                                    <label class="field">State variable<select v-model="selectedMethodWidget.stateVariableId" class="select" :disabled="!canEdit"><option value="">Local toggle state</option><option v-for="variable in variables.filter((item) => item.type === 'BOOLEAN')" :key="variable.id" :value="variable.id">{{ variable.name }}</option></select></label>
                                    <label class="field">State value path<input v-model="selectedMethodWidget.stateValuePath" class="input" :disabled="!canEdit" placeholder="value" /></label>
                                    <label class="field">On label<input v-model="selectedMethodWidget.onLabel" class="input" :disabled="!canEdit" placeholder="On" /></label>
                                    <label class="field">Off label<input v-model="selectedMethodWidget.offLabel" class="input" :disabled="!canEdit" placeholder="Off" /></label>
                                </template>
                                <label class="field">Confirmation<textarea v-model="selectedMethodWidget.confirmation" class="textarea" :disabled="!canEdit" placeholder="Optional confirmation message"></textarea></label>
                            </template>

                            <div v-if="canEdit" class="inspector-actions">
                                <button class="btn" type="button" :disabled="selectedWidgetIndex === 0" @click="moveWidget(selectedWidgetIndex, -1)"><i class="pi pi-arrow-up"></i> Move up</button>
                                <button class="btn" type="button" :disabled="selectedWidgetIndex === widgets.length - 1" @click="moveWidget(selectedWidgetIndex, 1)"><i class="pi pi-arrow-down"></i> Move down</button>
                                <button class="btn btn-danger" type="button" @click="removeWidget(selectedWidget.id)"><i class="pi pi-trash"></i> Remove widget</button>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>

            <div v-else-if="activeTab === 'contracts'" class="stack">
                <div v-if="!canEdit" class="notice">Contracts are read only for your current template role.</div>
                <section class="panel">
                    <div class="panel-header"><h2>Variables</h2></div>
                    <div class="panel-body stack">
                        <div v-for="variable in variables" :key="variable.id" class="resource-row"><input v-model="variableEdits[variable.id].name" class="input" :disabled="!canEdit" /><select v-model="variableEdits[variable.id].type" class="select" :disabled="!canEdit"><option v-for="type in variableTypes" :key="type">{{ type }}</option></select><input v-model="variableEdits[variable.id].description" class="input" :disabled="!canEdit" placeholder="Description" /><button v-if="canEdit" class="btn" type="button" @click="templateStore.updateVariable(selectedTemplateId, variable.id, variableEdits[variable.id])">Save</button><button v-if="canEdit" class="icon-button danger" type="button" @click="templateStore.deleteVariable(selectedTemplateId, variable.id)"><i class="pi pi-trash"></i></button></div>
                        <form v-if="canEdit" class="resource-row" @submit.prevent="createVariable"><input v-model="variableDraft.name" class="input" placeholder="New variable" required /><select v-model="variableDraft.type" class="select"><option v-for="type in variableTypes" :key="type">{{ type }}</option></select><input v-model="variableDraft.description" class="input" placeholder="Description" /><button class="btn btn-primary" type="submit">Add</button></form>
                    </div>
                </section>

                <section class="panel">
                    <div class="panel-header"><h2>Methods</h2></div>
                    <div class="panel-body stack">
                        <div v-for="method in methods" :key="method.id" class="resource-row"><input v-model="methodEdits[method.id].name" class="input" :disabled="!canEdit" /><select v-model="methodEdits[method.id].input" class="select" :disabled="!canEdit"><option v-for="type in typeOptions" :key="type">{{ type }}</option></select><input v-model="methodEdits[method.id].description" class="input" :disabled="!canEdit" placeholder="Description" /><button v-if="canEdit" class="btn" type="button" @click="templateStore.updateMethod(selectedTemplateId, method.id, methodEdits[method.id])">Save</button><button v-if="canEdit" class="icon-button danger" type="button" @click="templateStore.deleteMethod(selectedTemplateId, method.id)"><i class="pi pi-trash"></i></button></div>
                        <form v-if="canEdit" class="resource-row" @submit.prevent="createMethod"><input v-model="methodDraft.name" class="input" placeholder="New method" required /><select v-model="methodDraft.input" class="select"><option v-for="type in typeOptions" :key="type">{{ type }}</option></select><input v-model="methodDraft.description" class="input" placeholder="Description" /><button class="btn btn-primary" type="submit">Add</button></form>
                    </div>
                </section>
            </div>

            <CollaboratorsPanel
                v-else-if="collaboratorAccess"
                :collaborators="collaboratorAccess.collaborators"
                :roles="['OWNER', 'EDITOR']"
                :can-manage="collaboratorAccess.canManage"
                :current-user-id="authStore.currentUser?.id"
                @save="saveCollaborator"
                @remove="removeCollaborator"
            />
        </template>

        <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
            <form class="modal panel" @submit.prevent="createTemplate"><div class="panel-header"><h2>Create template</h2><button class="icon-button" type="button" @click="showCreate = false"><i class="pi pi-times"></i></button></div><div class="panel-body stack"><label class="field">Internal name<input v-model="createName" class="input" required /></label><label class="field">Display name<input v-model="createDisplayName" class="input" /></label><label class="field">Location<input v-model="createLocation" class="input" /></label><div class="row-actions"><button class="btn btn-primary">Create template</button></div></div></form>
        </div>
    </div>
</template>

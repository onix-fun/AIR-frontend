<style scoped>
.hover-lift {
    transition: transform 0.2s;
}
.hover-lift:hover {
    transform: translateY(-2px);
}

.access-modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.access-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
}

.access-modal-head h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
}

.access-modal-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.access-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.5rem;
}
</style>
<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useTemplateStore } from "@/infra/store";
import { apiErrorMessage } from "@/api/client";
import { AuthService } from "@/api/services/AuthService";
import { TemplateService } from "@/api/services/TemplateService";
import type { CreateMethodPayload, CreateVariablePayload, DomainType, TemplateState } from "@/domain";

const templateStore = useTemplateStore();

const selectedTemplateId = ref("");
const templateSearch = ref("");
const createName = ref("");
const createInfoEntries = ref<{ key: string; value: string }[]>([
    { key: "displayName", value: "" },
    { key: "location", value: "" },
]);
const error = ref("");

const methodTypeOptions: DomainType[] = [
    "VOID",
    "TEXT",
    "INTEGER",
    "FLOAT",
    "BOOLEAN",
    "JSON",
    "UUID",
    "DATE",
    "TIMESTAMP",
];
const variableTypeOptions = methodTypeOptions.filter((type) => type !== "VOID");
const stateOptions: TemplateState[] = ["DRAFT", "PUBLIC", "ARCHIVED"];

const variableDraft = reactive<CreateVariablePayload>(templateStore.emptyVariable());
const methodDraft = reactive<CreateMethodPayload>(templateStore.emptyMethod());
const variableEdits = reactive<Record<string, CreateVariablePayload>>({});
const methodEdits = reactive<Record<string, CreateMethodPayload>>({});

// Grant access modal state
const showAccessModal = ref(false);
const accessSearch = ref("");
const accessRole = ref("USER");

const filteredTemplates = computed(() => {
    const query = templateSearch.value.trim().toLowerCase();
    if (!query) return templateStore.templates;
    return templateStore.templates.filter(
        (template) => template.name.toLowerCase().includes(query) || template.id.includes(query),
    );
});
const selectedTemplate = computed(() =>
    templateStore.templates.find((template) => template.id === selectedTemplateId.value),
);
const variables = computed(() =>
    selectedTemplateId.value ? templateStore.variablesByTemplate[selectedTemplateId.value] || [] : [],
);
const methods = computed(() =>
    selectedTemplateId.value ? templateStore.methodsByTemplate[selectedTemplateId.value] || [] : [],
);

const selectedTemplateInfoEntries = ref<{ key: string; value: string }[]>([]);

const syncSelectedInfoEntries = () => {
    if (!selectedTemplate.value) return;
    try {
        const infoObj = JSON.parse(selectedTemplate.value.info || "{}");
        selectedTemplateInfoEntries.value = Object.entries(infoObj).map(([key, value]) => ({
            key,
            value: String(value),
        }));
    } catch (e) {
        selectedTemplateInfoEntries.value = [];
    }
};

watch(selectedTemplate, syncSelectedInfoEntries, { immediate: true });

const saveSelectedInfo = async () => {
    if (!selectedTemplate.value) return;
    const infoObj: Record<string, string> = {};
    selectedTemplateInfoEntries.value.forEach((entry) => {
        if (entry.key) {
            infoObj[entry.key] = entry.value;
        }
    });
    await templateStore.updateTemplate(selectedTemplate.value.id, { info: JSON.stringify(infoObj) });
};

const addSelectedInfoEntry = () => {
    selectedTemplateInfoEntries.value.push({ key: "", value: "" });
};

const removeSelectedInfoEntry = async (index: number) => {
    selectedTemplateInfoEntries.value.splice(index, 1);
    await saveSelectedInfo();
};

watch(
    selectedTemplateId,
    async (id) => {
        if (id) await templateStore.ensureTemplateDetail(id);
    },
    { immediate: true },
);

watch(
    variables,
    (items) => {
        items.forEach((item) => {
            variableEdits[item.id] = {
                name: item.name,
                type: item.type,
                description: item.description || "",
            };
        });
    },
    { immediate: true },
);

watch(
    methods,
    (items) => {
        items.forEach((item) => {
            methodEdits[item.id] = {
                name: item.name,
                input: item.input,
                description: item.description || "",
            };
        });
    },
    { immediate: true },
);
const run = async (action: () => Promise<void>) => {
    error.value = "";
    try {
        await action();
    } catch (cause) {
        error.value = apiErrorMessage(cause);
    }
};

const addInfoEntry = () => {
    createInfoEntries.value.push({ key: "", value: "" });
};

const removeInfoEntry = (index: number) => {
    createInfoEntries.value.splice(index, 1);
};

const showCreateModal = ref(false);

const createTemplate = () =>
    run(async () => {
        const infoObj: Record<string, string> = {};
        createInfoEntries.value.forEach((entry) => {
            if (entry.key) {
                infoObj[entry.key] = entry.value;
            }
        });
        const infoJson = JSON.stringify(infoObj);
        const id = await templateStore.createTemplate({ name: createName.value, info: infoJson });
        selectedTemplateId.value = id;
        createName.value = "";
        createInfoEntries.value = [
            { key: "displayName", value: "" },
            { key: "location", value: "" },
        ];
        showCreateModal.value = false;
    });

const updateTemplateState = (state: TemplateState) =>
    run(async () => {
        if (!selectedTemplate.value) return;
        await templateStore.updateTemplate(selectedTemplate.value.id, { state });
    });

const grantAccess = async () => {
    if (!accessSearch.value.trim()) return;
    error.value = "";
    try {
        const users = await AuthService.searchUsers(accessSearch.value);
        if (users.length === 0) {
            error.value = "User not found";
            return;
        }
        await TemplateService.grantAccess(selectedTemplateId.value, users[0].id, accessRole.value);
        showAccessModal.value = false;
        accessSearch.value = "";
        accessRole.value = "USER";
    } catch (cause) {
        error.value = apiErrorMessage(cause);
    }
};

const createVariable = () =>
    run(async () => {
        await templateStore.createVariable(selectedTemplateId.value, variableDraft);
        Object.assign(variableDraft, templateStore.emptyVariable());
    });

const createMethod = () =>
    run(async () => {
        await templateStore.createMethod(selectedTemplateId.value, methodDraft);
        Object.assign(methodDraft, templateStore.emptyMethod());
    });
</script>

<template>
    <div class="stack" style="padding-bottom: 2rem">
        <!-- List View -->
        <template v-if="!selectedTemplate">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem">
                <div>
                    <h2>Studio</h2>
                    <span class="muted">Manage templates, variables, and methods</span>
                </div>
                <div class="toolbar" style="display: flex; gap: 1rem">
                    <input
                        v-model="templateSearch"
                        class="input"
                        placeholder="Search templates..."
                        style="width: 300px"
                    />
                </div>
            </div>

            <div v-if="error" class="status-badge error" style="margin-bottom: 1rem">{{ error }}</div>

            <div
                class="template-grid"
                style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem"
            >
                <div
                    v-for="template in filteredTemplates"
                    :key="template.id"
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
                    @click="selectedTemplateId = template.id"
                >
                    <i
                        class="pi pi-sitemap"
                        style="font-size: 2rem; color: var(--primary-color, #10b981); margin-bottom: 1rem"
                    ></i>
                    <h3 style="margin: 0; font-size: 1.1rem; text-align: center; word-break: break-all">
                        {{ template.name }}
                    </h3>
                    <div style="margin-top: 0.5rem">
                        <span
                            class="status-badge"
                            :class="template.state.toLowerCase()"
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
                            {{ template.state }}
                        </span>
                    </div>
                </div>

                <!-- Add New Template Card -->
                <div
                    class="consumer-card hover-lift add-card"
                    @click="showCreateModal = true"
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
                    <span style="color: var(--text-muted, #64748b); font-weight: 500">Add Template</span>
                </div>
            </div>
        </template>

        <template v-else>
            <section class="panel" style="margin-bottom: 1.5rem; background: var(--surface-card)">
                <div class="panel-header" style="border-bottom: 0">
                    <div style="display: flex; align-items: center; gap: 1rem">
                        <button
                            class="btn icon-button"
                            type="button"
                            @click="selectedTemplateId = ''"
                            aria-label="Back to templates"
                        >
                            <i class="pi pi-arrow-left"></i>
                        </button>
                        <div>
                            <h2 style="margin: 0; font-size: 1.5rem">{{ selectedTemplate.name }}</h2>
                            <span class="mono muted">v{{ selectedTemplate.version }}</span>
                        </div>
                    </div>
                    <div class="toolbar">
                        <button class="btn" type="button" @click="showAccessModal = true">
                            <i class="pi pi-users"></i> Grant Access
                        </button>
                        <select
                            class="select compact-select"
                            :value="selectedTemplate.state"
                            @change="updateTemplateState(($event.target as HTMLSelectElement).value as TemplateState)"
                        >
                            <option v-for="state in stateOptions" :key="state" :value="state">{{ state }}</option>
                        </select>
                    </div>
                </div>

                <!-- Access Modal -->
                <div v-if="showAccessModal" class="modal-backdrop" @click.self="showAccessModal = false">
                    <div class="modal access-modal">
                        <div class="access-modal-head">
                            <h3>Grant Access</h3>
                            <button type="button" class="icon-button" @click="showAccessModal = false">
                                <i class="pi pi-times"></i>
                            </button>
                        </div>
                        <div class="access-modal-body">
                            <label class="field">
                                <span>User</span>
                                <input v-model="accessSearch" class="input" placeholder="Search by username or email..." @keyup.enter="grantAccess" />
                            </label>
                            <label class="field">
                                <span>Role</span>
                                <select v-model="accessRole" class="select">
                                    <option value="USER">User</option>
                                    <option value="VIEWER">Viewer</option>
                                    <option value="OWNER">Owner</option>
                                </select>
                            </label>
                            <div class="access-modal-actions">
                                <button type="button" class="btn" @click="showAccessModal = false">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="grantAccess">Grant</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="panel-body">
                    <label class="field">Info Metadata</label>
                    <div
                        v-for="(entry, idx) in selectedTemplateInfoEntries"
                        :key="idx"
                        style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center"
                    >
                        <input
                            v-model="entry.key"
                            class="input"
                            placeholder="Key"
                            style="flex: 1"
                            @change="saveSelectedInfo"
                        />
                        <input
                            v-model="entry.value"
                            class="input"
                            placeholder="Value"
                            style="flex: 1"
                            @change="saveSelectedInfo"
                        />
                        <button
                            type="button"
                            class="btn icon-button"
                            @click="removeSelectedInfoEntry(idx)"
                            style="color: var(--error-color, #ef4444)"
                        >
                            <i class="pi pi-times"></i>
                        </button>
                    </div>
                    <button
                        type="button"
                        class="btn"
                        style="align-self: flex-start; margin-top: 0.5rem"
                        @click="addSelectedInfoEntry"
                    >
                        <i class="pi pi-plus"></i> Add Field
                    </button>
                </div>
            </section>

            <section class="panel">
                <div class="panel-header">
                    <h2>Variables</h2>
                </div>
                <div class="panel-body stack">
                    <div v-for="variable in variables" :key="variable.id" class="edit-row">
                        <input v-model="variableEdits[variable.id].name" class="input" />
                        <select v-model="variableEdits[variable.id].type" class="select">
                            <option v-for="type in variableTypeOptions" :key="type" :value="type">{{ type }}</option>
                        </select>
                        <input
                            v-model="variableEdits[variable.id].description"
                            class="input"
                            placeholder="Description"
                        />
                        <button
                            class="btn"
                            type="button"
                            @click="
                                templateStore.updateVariable(
                                    selectedTemplate?.id || '',
                                    variable.id,
                                    variableEdits[variable.id],
                                )
                            "
                        >
                            Save
                        </button>
                        <button
                            class="btn btn-danger"
                            type="button"
                            @click="templateStore.deleteVariable(selectedTemplate?.id || '', variable.id)"
                        >
                            Delete
                        </button>
                    </div>
                    <form class="edit-row" @submit.prevent="createVariable">
                        <input v-model="variableDraft.name" class="input" placeholder="Variable name" required />
                        <select v-model="variableDraft.type" class="select">
                            <option v-for="type in variableTypeOptions" :key="type" :value="type">{{ type }}</option>
                        </select>
                        <input v-model="variableDraft.description" class="input" placeholder="Description" />
                        <button class="btn btn-primary" type="submit">Add variable</button>
                    </form>
                </div>
            </section>

            <section class="panel">
                <div class="panel-header">
                    <h2>Methods</h2>
                </div>
                <div class="panel-body stack">
                    <div v-for="method in methods" :key="method.id" class="edit-row method-edit-row">
                        <input v-model="methodEdits[method.id].name" class="input" />
                        <select v-model="methodEdits[method.id].input" class="select">
                            <option v-for="type in methodTypeOptions" :key="type" :value="type">{{ type }}</option>
                        </select>
                        <input
                            v-model="methodEdits[method.id].description"
                            class="input"
                            placeholder="Description"
                        />
                        <button
                            class="btn"
                            type="button"
                            @click="
                                templateStore.updateMethod(
                                    selectedTemplate?.id || '',
                                    method.id,
                                    methodEdits[method.id],
                                )
                            "
                        >
                            Save
                        </button>
                        <button
                            class="btn btn-danger"
                            type="button"
                            @click="templateStore.deleteMethod(selectedTemplate?.id || '', method.id)"
                        >
                            Delete
                        </button>
                    </div>
                    <form class="edit-row method-edit-row" @submit.prevent="createMethod">
                        <input v-model="methodDraft.name" class="input" placeholder="Method name" required />
                        <select v-model="methodDraft.input" class="select">
                            <option v-for="type in methodTypeOptions" :key="type" :value="type">{{ type }}</option>
                        </select>
                        <input v-model="methodDraft.description" class="input" placeholder="Description" />
                        <button class="btn btn-primary" type="submit">Add method</button>
                    </form>
                </div>
            </section>
        </template>
    </div>

    <!-- Modals -->
    <div v-if="showCreateModal" class="modal-backdrop" @click.self="showCreateModal = false">
        <form class="modal panel" @submit.prevent="createTemplate">
            <div class="panel-header">
                <h2>Create template</h2>
                <button class="icon-button" type="button" @click="showCreateModal = false">
                    <i class="pi pi-times"></i>
                </button>
            </div>
            <div class="panel-body stack">
                <label class="field">
                    Name
                    <input v-model="createName" class="input" required />
                </label>
                <div class="field">
                    <label>Info Metadata</label>
                    <div
                        v-for="(entry, idx) in createInfoEntries"
                        :key="idx"
                        style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center"
                    >
                        <input v-model="entry.key" class="input" placeholder="Key (e.g. displayName)" style="flex: 1" />
                        <input v-model="entry.value" class="input" placeholder="Value" style="flex: 1" />
                        <button
                            type="button"
                            class="btn icon-button"
                            @click="removeInfoEntry(idx)"
                            style="color: var(--error-color, #ef4444)"
                        >
                            <i class="pi pi-times"></i>
                        </button>
                    </div>
                    <button type="button" class="btn" style="align-self: flex-start" @click="addInfoEntry">
                        <i class="pi pi-plus"></i> Add Field
                    </button>
                </div>
                <div class="row-actions">
                    <button class="btn btn-primary" type="submit">Create template</button>
                </div>
            </div>
        </form>
    </div>
</template>

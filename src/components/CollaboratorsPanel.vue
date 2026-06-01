<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AuthService, type UserPublicDto } from "@/api/services/AuthService";
import { apiErrorMessage } from "@/api/client";
import type { CollaboratorResponse } from "@/domain";

const props = defineProps<{
    collaborators: CollaboratorResponse[];
    roles: string[];
    canManage: boolean;
    currentUserId?: string;
}>();
const emit = defineEmits<{
    save: [clientId: string, role: string];
    remove: [clientId: string];
}>();

const query = ref("");
const role = ref(props.roles[0] || "");
const searchResults = ref<UserPublicDto[]>([]);
const selectedUser = ref<UserPublicDto | null>(null);
const searchError = ref("");
const isSearching = ref(false);
const knownUsers = ref<Record<string, UserPublicDto>>({});
const loadedClientIds = ref<Record<string, boolean>>({});
const hasCollaborators = computed(() => props.collaborators.length > 0);
const visibleCollaborators = computed(() =>
    props.collaborators
        .map((collaborator) => ({ collaborator, user: knownUsers.value[collaborator.clientId] }))
        .filter((item): item is { collaborator: CollaboratorResponse; user: UserPublicDto } => Boolean(item.user)),
);
const isLoadingProfiles = computed(() =>
    props.collaborators.some((collaborator) => !loadedClientIds.value[collaborator.clientId]),
);

const search = async () => {
    if (!query.value.trim()) return;
    isSearching.value = true;
    searchError.value = "";
    try {
        searchResults.value = (await AuthService.searchUsers(query.value.trim())).filter(
            (user) => user.id !== props.currentUserId,
        );
        searchResults.value.forEach((user) => (knownUsers.value[user.id] = user));
        if (searchResults.value.length === 0) searchError.value = "No users found.";
    } catch (cause) {
        searchError.value = apiErrorMessage(cause);
    } finally {
        isSearching.value = false;
    }
};
const choose = (user: UserPublicDto) => {
    selectedUser.value = user;
    query.value = user.username;
    searchResults.value = [];
};
const add = () => {
    if (!selectedUser.value || selectedUser.value.id === props.currentUserId || !role.value) return;
    emit("save", selectedUser.value.id, role.value);
    selectedUser.value = null;
    query.value = "";
};
const displayName = (user: UserPublicDto) =>
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
const initials = (user: UserPublicDto) =>
    displayName(user)
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
watch(
    () => props.collaborators.map((item) => item.clientId),
    async (clientIds) => {
        await Promise.all(
            clientIds.map(async (clientId) => {
                if (knownUsers.value[clientId]) return;
                try {
                    knownUsers.value[clientId] = await AuthService.getUser(clientId);
                } catch {
                    // Omit collaborator entries whose profiles are unavailable.
                } finally {
                    loadedClientIds.value[clientId] = true;
                }
            }),
        );
    },
    { immediate: true },
);
</script>

<template>
    <section class="panel">
        <div class="panel-header">
            <div>
                <h2>Collaborators</h2>
                <span class="muted">People with access to this resource.</span>
            </div>
            <span v-if="!canManage" class="status-badge">Read only</span>
        </div>
        <div class="panel-body stack">
            <div v-if="!hasCollaborators" class="empty-state">No collaborators found.</div>
            <div v-else-if="isLoadingProfiles" class="empty-state">Loading collaborators...</div>
            <div v-else class="collaborator-list">
                <div v-for="{ collaborator, user } in visibleCollaborators" :key="collaborator.clientId" class="collaborator-row">
                    <div class="collaborator-avatar">
                        <img v-if="user.avatarUrl" :src="user.avatarUrl" alt="" />
                        <span v-else>{{ initials(user) }}</span>
                    </div>
                    <div class="collaborator-identity">
                        <strong>{{ displayName(user) }}</strong>
                        <span class="muted">@{{ user.username }}</span>
                        <span v-if="collaborator.clientId === currentUserId" class="muted">Current user</span>
                    </div>
                    <select
                        v-if="canManage && collaborator.clientId !== currentUserId"
                        class="select compact-select"
                        :value="collaborator.role"
                        @change="emit('save', collaborator.clientId, ($event.target as HTMLSelectElement).value)"
                    >
                        <option v-for="item in roles" :key="item">{{ item }}</option>
                    </select>
                    <span v-else class="status-badge">{{ collaborator.role }}</span>
                    <button v-if="canManage && collaborator.clientId !== currentUserId" class="icon-button danger" type="button" aria-label="Remove collaborator" @click="emit('remove', collaborator.clientId)">
                        <i class="pi pi-trash"></i>
                    </button>
                </div>
            </div>

            <div v-if="canManage" class="collaborator-add">
                <h3>Add collaborator</h3>
                <div class="collaborator-add-form">
                    <div class="collaborator-search">
                        <input v-model="query" class="input" placeholder="Search username" @input="selectedUser = null" @keyup.enter="search" />
                        <div v-if="searchResults.length" class="search-results">
                            <button v-for="user in searchResults" :key="user.id" type="button" @click="choose(user)">
                                <span class="collaborator-avatar small">
                                    <img v-if="user.avatarUrl" :src="user.avatarUrl" alt="" />
                                    <span v-else>{{ initials(user) }}</span>
                                </span>
                                <strong>{{ displayName(user) }}</strong>
                                <span>@{{ user.username }}</span>
                            </button>
                        </div>
                    </div>
                    <button class="btn" type="button" :disabled="isSearching" @click="search">Search</button>
                    <select v-model="role" class="select compact-select"><option v-for="item in roles" :key="item">{{ item }}</option></select>
                    <button class="btn btn-primary" type="button" :disabled="!selectedUser" @click="add">Add</button>
                </div>
                <span v-if="searchError" class="muted">{{ searchError }}</span>
            </div>
        </div>
    </section>
</template>

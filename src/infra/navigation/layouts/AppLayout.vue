<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/infra/store";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const navItems = [
    { path: "/", label: "Devices", icon: "pi pi-server" },
    { path: "/studio", label: "Studio", icon: "pi pi-sitemap" },
];

const isActive = (path: string) => {
    if (path === "/") return route.path === "/" || route.path.startsWith("/device/");
    return route.path.startsWith(path);
};

const displayInitials = computed(() => {
    const user = authStore.currentUser;
    const source = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "S";
    return source
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
});

const profileUrl = computed(() => {
    const currentUrl = encodeURIComponent(window.location.origin + window.location.pathname);
    // Assuming profile frontend runs on port 5174 in dev, or relative path in production
    // You can adjust this to use an environment variable if needed.
    const baseUrl = import.meta.env.DEV ? "http://localhost:5174" : "/profile/";
    return `${baseUrl}/?redirect=${currentUrl}`;
});
</script>

<template>
    <div class="app-shell">
        <aside class="nav-rail">
            <button class="logo-button" type="button" aria-label="Sparrow" @click="router.push('/')">S</button>
            <nav>
                <button
                    v-for="item in navItems"
                    :key="item.path"
                    class="nav-button"
                    :class="{ active: isActive(item.path) }"
                    type="button"
                    :aria-label="item.label"
                    @click="router.push(item.path)"
                >
                    <i :class="item.icon"></i>
                    <span>{{ item.label }}</span>
                </button>
            </nav>
            <div style="flex: 1"></div>
            <a :href="profileUrl" class="nav-button avatar-button" aria-label="Profile">
                <div class="avatar-circle">
                    <img v-if="authStore.currentUser?.avatarUrl" :src="authStore.currentUser?.avatarUrl" alt="" />
                    <span v-else>{{ displayInitials }}</span>
                </div>
            </a>
        </aside>

        <div class="workspace">
            <main class="page-frame">
                <slot />
            </main>
        </div>
    </div>
</template>

<style scoped>
.avatar-button {
    margin-bottom: 1rem;
    padding: 0;
    justify-content: center;
    text-decoration: none;
}
.avatar-circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-muted);
    border: 1px solid var(--border);
    color: var(--text);
    display: grid;
    place-items: center;
    overflow: hidden;
    font-size: 14px;
    font-weight: 700;
}
.avatar-circle img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>

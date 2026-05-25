<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const navItems = [
    { path: "/", label: "Devices", icon: "pi pi-server" },
    { path: "/studio", label: "Studio", icon: "pi pi-sitemap" },
    { path: "/settings", label: "Settings", icon: "pi pi-cog" },
];

const isActive = (path: string) => {
    if (path === "/") return route.path === "/" || route.path.startsWith("/device/");
    return route.path.startsWith(path);
};
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
        </aside>

        <div class="workspace">
            <main class="page-frame">
                <slot />
            </main>
        </div>
    </div>
</template>

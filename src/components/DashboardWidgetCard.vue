<script setup lang="ts">
import { computed } from "vue";
import { BaseChart } from "@/infra/chart";
import {
    formatWidgetValue,
    gaugePercent,
    widgetAccent,
    type DashboardWidget,
    type DomainType,
} from "@/domain";

const props = withDefaults(
    defineProps<{
        widget: DashboardWidget;
        title: string;
        variableType?: DomainType;
        rawValue?: unknown;
        payloadUnit?: string;
        chartData?: { labels: string[]; values: number[] };
        toggleValue?: boolean;
        commandValue?: string | number | boolean;
        disabled?: boolean;
        broken?: boolean;
        selected?: boolean;
    }>(),
    {
        payloadUnit: "",
        chartData: () => ({ labels: [], values: [] }),
        toggleValue: false,
        commandValue: "",
        disabled: false,
        broken: false,
        selected: false,
    },
);

const emit = defineEmits<{
    select: [];
    execute: [];
    toggle: [];
    "update:commandValue": [value: string | number];
}>();

const variableWidget = computed(() => (props.widget.resourceType === "variable" ? props.widget : null));
const methodWidget = computed(() => (props.widget.resourceType === "method" ? props.widget : null));
const formattedValue = computed(() =>
    variableWidget.value ? formatWidgetValue(variableWidget.value, props.rawValue, props.payloadUnit) : "",
);
const accent = computed(() => (variableWidget.value ? widgetAccent(variableWidget.value, props.rawValue) : "#2563eb"));
const statusEnabled = computed(() => Boolean(props.rawValue));
const statusLabel = computed(() => {
    if (!variableWidget.value) return "";
    return statusEnabled.value ? variableWidget.value.trueLabel || "Active" : variableWidget.value.falseLabel || "Inactive";
});
const statusColor = computed(() => {
    if (!variableWidget.value) return "";
    return statusEnabled.value ? variableWidget.value.trueColor || "#159a73" : variableWidget.value.falseColor || "#667085";
});
const gauge = computed(() => (variableWidget.value ? gaugePercent(variableWidget.value, props.rawValue) : 0));

const updateCommandValue = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    emit("update:commandValue", target.type === "number" ? Number(target.value) : target.value);
};
</script>

<template>
    <article class="widget-card" :class="[`widget-span-${widget.width}`, { selected, broken }]" @click="emit('select')">
        <header class="widget-head">
            <div>
                <span class="widget-kicker">{{ widget.resourceType }}</span>
                <h2>{{ title }}</h2>
            </div>
            <span v-if="broken" class="status-badge error">Missing resource</span>
            <span v-else-if="variableWidget" class="muted">{{ variableType }}</span>
        </header>

        <div v-if="broken" class="notice error">The referenced contract no longer exists. Remove or replace this widget.</div>

        <template v-else-if="variableWidget">
            <div v-if="variableWidget.display === 'line' || variableWidget.display === 'bar'" class="chart-widget">
                <strong>{{ formattedValue }}</strong>
                <BaseChart
                    :type="variableWidget.display"
                    :data="chartData.values"
                    :labels="chartData.labels"
                    :color="accent"
                    :min="variableWidget.min"
                    :max="variableWidget.max"
                />
            </div>
            <div v-else-if="variableWidget.display === 'gauge'" class="gauge-widget">
                <div class="gauge-ring" :style="{ '--gauge': `${gauge}%`, '--gauge-color': accent }">
                    <strong>{{ formattedValue }}</strong>
                </div>
            </div>
            <div v-else-if="variableWidget.display === 'status'" class="status-value" :class="{ enabled: statusEnabled }" :style="{ color: statusColor }">
                <span class="status-light" :style="{ background: statusColor }"></span>
                <strong>{{ statusLabel }}</strong>
            </div>
            <div v-else class="metric-value" :style="{ color: accent }">{{ formattedValue }}</div>
        </template>

        <template v-else-if="methodWidget">
            <button v-if="methodWidget.control === 'button'" class="btn btn-primary control-button" type="button" :disabled="disabled" @click.stop="emit('execute')">
                {{ methodWidget.actionLabel || "Run command" }}
            </button>
            <button v-else-if="methodWidget.control === 'toggle'" class="toggle-control" :class="{ enabled: toggleValue }" type="button" :disabled="disabled" @click.stop="emit('toggle')">
                <span class="toggle-track"><span></span></span>
                <strong>{{ toggleValue ? methodWidget.onLabel || "On" : methodWidget.offLabel || "Off" }}</strong>
            </button>
            <form v-else class="control-form" @submit.prevent.stop="emit('execute')">
                <textarea
                    v-if="methodWidget.control === 'json'"
                    class="textarea mono"
                    :placeholder="methodWidget.placeholder || '{}'"
                    :value="String(commandValue || '')"
                    @input="updateCommandValue"
                ></textarea>
                <input
                    v-else
                    class="input"
                    :type="methodWidget.control === 'number' ? 'number' : 'text'"
                    :placeholder="methodWidget.placeholder || 'Value'"
                    :value="commandValue"
                    @input="updateCommandValue"
                />
                <button class="btn btn-primary" type="submit" :disabled="disabled">{{ methodWidget.actionLabel || "Send" }}</button>
            </form>
        </template>
    </article>
</template>

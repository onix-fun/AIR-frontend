<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import Chart from 'chart.js/auto';

const props = defineProps<{
  data: number[];
  labels?: string[];
  color?: string;
  type?: 'line' | 'bar';
  min?: number;
  max?: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

const colorWithAlpha = (color: string, alpha: number) => {
  const normalized = color.replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((part) => `${part}${part}`).join('') : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(37, 99, 235, ${alpha})`;
  const value = Number.parseInt(expanded, 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

const chartFill = (color: string) => {
  if (props.type !== 'line' || !canvasRef.value) return colorWithAlpha(color, 0.72);
  const gradient = canvasRef.value.getContext('2d')?.createLinearGradient(0, 0, 0, 190);
  if (!gradient) return colorWithAlpha(color, 0.18);
  gradient.addColorStop(0, colorWithAlpha(color, 0.26));
  gradient.addColorStop(1, colorWithAlpha(color, 0.02));
  return gradient;
};

const createChart = () => {
  if (!canvasRef.value) return;
  const color = props.color || '#10b981';
  chartInstance = new Chart(canvasRef.value, {
      type: props.type || 'bar',
      data: {
        labels: props.labels || props.data.map((_, i) => i.toString()),
        datasets: [{
          data: props.data,
          backgroundColor: chartFill(color),
          borderColor: color,
          borderWidth: props.type === 'line' ? 2 : 0,
          pointRadius: 0,
          tension: 0.25,
          fill: props.type === 'line',
          borderRadius: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { display: false },
          y: { display: false, min: props.min, max: props.max }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        animation: false
      }
    });
};

onMounted(createChart);

watch(() => props.type, () => {
  chartInstance?.destroy();
  chartInstance = null;
  createChart();
});

watch(() => [props.data, props.labels, props.color, props.min, props.max] as const, ([newData, newLabels, color, min, max]) => {
  if (chartInstance) {
    chartInstance.data.datasets[0].data = newData;
    chartInstance.data.labels = newLabels || newData.map((_, i) => i.toString());
    const nextColor = color || '#10b981';
    chartInstance.data.datasets[0].backgroundColor = chartFill(nextColor);
    chartInstance.data.datasets[0].borderColor = nextColor;
    chartInstance.options.scales = {
      x: { display: false },
      y: { display: false, min, max },
    };
    chartInstance.update();
  }
}, { deep: true });

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy();
  }
});
</script>

<template>
  <div class="w-full h-full">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

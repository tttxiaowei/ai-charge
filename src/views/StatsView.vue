<template>
  <div class="stats-page">
    <h2 class="page-title">支出统计</h2>
    <div class="filter-bar">
      <el-input
        v-model="month"
        placeholder="YYYY-MM"
        style="width: 130px"
        @change="loadStats"
      />
    </div>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card>
          <template #header>
            <h3 style="margin: 0">当月概览</h3>
          </template>
          <div class="summary-item">
            <div class="label">总支出</div>
            <div class="value">¥ {{ formatAmount(totalCents) }}</div>
          </div>
          <div class="summary-item">
            <div class="label">笔数</div>
            <div class="value">{{ totalCount }} 笔</div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card>
          <template #header>
            <h3 style="margin: 0">各一级分类占比</h3>
          </template>
          <div ref="chartRef" class="chart" v-loading="loading"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import type { CategorySummaryRow } from '@/types/window';

const month = ref(currentMonth());
const loading = ref(false);
const chartRef = ref<HTMLDivElement | null>(null);
const totalCents = ref(0);
const totalCount = ref(0);
let chartInstance: echarts.ECharts | null = null;

function currentMonth(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function formatAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

async function loadStats() {
  loading.value = true;
  try {
    const rows: CategorySummaryRow[] = await window.chargeDB.getCategorySummary({
      month: month.value || undefined,
    });
    totalCents.value = rows.reduce((sum, r) => sum + r.total_cents, 0);
    totalCount.value = rows.reduce((sum, r) => sum + r.count, 0);

    await nextTick();
    if (!chartInstance && chartRef.value) {
      chartInstance = echarts.init(chartRef.value);
    }
    if (chartInstance) {
      chartInstance.setOption({
        tooltip: { trigger: 'item' },
        legend: { orient: 'vertical', left: 'left' },
        series: [
          {
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            data: rows.map((r) => ({
              name: r.parent_name,
              value: r.total_cents / 100,
            })),
            label: {
              formatter: (p: any) => {
                const totalYuan = totalCents.value / 100 || 1;
                const pct = ((p.value / totalYuan) * 100).toFixed(1);
                return `${p.name}\n¥${p.value.toFixed(2)} (${pct}%)`;
              },
            },
          },
        ],
      });
    }
  } catch (e) {
    ElMessage.error('加载统计失败：' + (e as Error).message);
  } finally {
    loading.value = false;
  }
}

function handleResize() {
  if (chartInstance) chartInstance.resize();
}

onMounted(async () => {
  window.addEventListener('resize', handleResize);
  await loadStats();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
});
</script>

<style scoped>
.page-title {
  margin-bottom: 12px;
}
.filter-bar {
  margin-bottom: 16px;
}
.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #ebeef5;
}
.summary-item:last-child {
  border-bottom: none;
}
.label {
  color: #909399;
}
.value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
.chart {
  height: 320px;
}
</style>

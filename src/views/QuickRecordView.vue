<template>
  <div class="quick-record-page">
    <h2 class="page-title">记一笔花销</h2>
    <el-card class="form-card">
      <el-form :model="form" label-width="80px" @submit.prevent="handleSave">
        <el-form-item label="金额（元）">
          <el-input-number
            v-model="form.amount"
            :min="0"
            :precision="2"
            :step="0.01"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-cascader
            v-model="form.categoryIds"
            :options="cascaderOptions"
            :props="{ checkStrictly: false, emitPath: true }"
            placeholder="请选择分类"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="发生时间">
          <el-date-picker
            v-model="form.occurTime"
            type="datetime"
            placeholder="选择时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" placeholder="可选" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" style="width: 100%">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-button link type="primary" @click="$router.push('/records')">
      保存后查看记账列表 →
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { CategoryNode } from '@/types/window';

const router = useRouter();
const categories = ref<CategoryNode[]>([]);

const form = reactive({
  amount: null as number | null,
  categoryIds: [] as number[],
  occurTime: new Date(),
  note: '',
});

const cascaderOptions = computed(() =>
  categories.value.map((c) => ({
    value: c.id,
    label: c.name,
    children: c.children.map((child) => ({ value: child.id, label: child.name })),
  }))
);

function formatDateTime(dt: unknown): string {
  if (!dt) return new Date().toISOString().slice(0, 10);
  const d = new Date(dt as string | number | Date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resetForm() {
  form.amount = null;
  form.categoryIds = [];
  form.occurTime = new Date();
  form.note = '';
}

async function handleSave() {
  if (!form.amount || form.categoryIds.length < 2) {
    ElMessage.warning('请填写金额并选择完整的分类（大类+小类）');
    return;
  }
  const categoryId = form.categoryIds[form.categoryIds.length - 1];
  try {
    await window.chargeDB.addTransaction({
      amount: form.amount,
      categoryId,
      occurTime: formatDateTime(form.occurTime),
      note: form.note,
    });
    ElMessage.success('已保存一笔花销');
    resetForm();
    router.push('/records');
  } catch (e) {
    ElMessage.error('保存失败：' + (e as Error).message);
  }
}

onMounted(async () => {
  try {
    categories.value = await window.chargeDB.getCategories();
  } catch (e) {
    ElMessage.error('加载分类失败：' + (e as Error).message);
  }
});
</script>

<style scoped>
.page-title {
  margin-bottom: 12px;
}
.form-card {
  max-width: 480px;
}
</style>

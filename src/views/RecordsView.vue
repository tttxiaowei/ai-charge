<template>
  <div class="records-page">
    <h2 class="page-title">花销记录</h2>
    <div class="filter-bar">
      <el-input
        v-model="filterMonth"
        placeholder="YYYY-MM"
        style="width: 130px"
        @change="loadTransactions"
      />
      <el-cascader
        v-model="filterCategoryIds"
        :options="cascaderOptions"
        :props="{ checkStrictly: true }"
        clearable
        placeholder="全部分类"
        @change="loadTransactions"
      />
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="primary" @click="$router.push('/quick-record')">+ 记一笔</el-button>
    </div>

    <el-table :data="transactions" v-loading="loading" style="width: 100%">
      <el-table-column label="日期" prop="occur_time" width="170"></el-table-column>
      <el-table-column label="一级分类" prop="parent_category_name" width="120"></el-table-column>
      <el-table-column label="分类" prop="category_name" width="120"></el-table-column>
      <el-table-column label="金额（元）" width="120">
        <template #default="{ row }">
          ¥ {{ formatAmount((row as TransactionRow).amount_cents) }}
        </template>
      </el-table-column>
      <el-table-column label="备注" prop="note"></el-table-column>
      <el-table-column label="操作" width="130">
        <template #default="{ row }">
          <el-button link @click="openEdit(row as TransactionRow)">编辑</el-button>
          <el-popconfirm title="确认删除这笔花销？" @confirm="handleDelete((row as TransactionRow).id)">
            <template #reference>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑弹窗（取代原先右侧固定表单） -->
    <el-dialog
      v-model="editDialogVisible"
      :title="editingId === null ? '编辑花销' : ''"
      width="440px"
    >
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
          <el-button type="primary" native-type="submit">更新</el-button>
          <el-button @click="cancelEdit">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import type {
  CategoryNode,
  TransactionRow,
} from '@/types/window';
import { formatDateTime, formatAmount } from '@/utils/date';

const transactions = ref<TransactionRow[]>([]);
const categories = ref<CategoryNode[]>([]);
const loading = ref(false);
const filterMonth = ref('');
const filterCategoryIds = ref<number[]>([]);
const editingId = ref<number | null>(null);
const editDialogVisible = ref(false);

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

async function loadTransactions() {
  loading.value = true;
  try {
    const categoryId = filterCategoryIds.value.length
      ? filterCategoryIds.value[filterCategoryIds.value.length - 1]
      : undefined;
    transactions.value = await window.chargeDB.getTransactions({
      month: filterMonth.value || undefined,
      categoryId,
    });
  } catch (e) {
    ElMessage.error('加载记录失败：' + (e as Error).message);
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!form.amount || form.categoryIds.length < 2) {
    ElMessage.warning('请填写金额并选择完整的分类（大类+小类）');
    return;
  }
  const categoryId = form.categoryIds[form.categoryIds.length - 1];
  try {
    await window.chargeDB.updateTransaction(editingId.value as number, {
      amount: form.amount,
      categoryId,
      occurTime: formatDateTime(form.occurTime),
      note: form.note,
    });
    ElMessage.success('已更新');
    cancelEdit();
    loadTransactions();
  } catch (e) {
    ElMessage.error('保存失败：' + (e as Error).message);
  }
}

function openEdit(row: TransactionRow) {
  editingId.value = row.id;
  form.amount = row.amount_cents / 100;
  form.categoryIds = [findParentId(row), row.category_id];
  form.occurTime = row.occur_time as unknown as Date;
  form.note = row.note || '';
  editDialogVisible.value = true;
}

function findParentId(row: TransactionRow): number {
  for (const c of categories.value) {
    const child = c.children.find((x) => x.id === row.category_id);
    if (child) return c.id;
  }
  return 0;
}

function cancelEdit() {
  editingId.value = null;
  form.amount = null;
  form.categoryIds = [];
  form.occurTime = new Date();
  form.note = '';
  editDialogVisible.value = false;
}

async function handleDelete(id: number) {
  try {
    await window.chargeDB.deleteTransaction(id);
    ElMessage.success('已删除');
    loadTransactions();
  } catch (e) {
    ElMessage.error('删除失败：' + (e as Error).message);
  }
}

function resetFilters() {
  filterMonth.value = '';
  filterCategoryIds.value = [];
  loadTransactions();
}

onMounted(async () => {
  try {
    categories.value = await window.chargeDB.getCategories();
    loadTransactions();
  } catch (e) {
    ElMessage.error('加载失败：' + (e as Error).message);
  }
});
</script>

<style scoped>
.page-title {
  margin-bottom: 12px;
}
.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
</style>

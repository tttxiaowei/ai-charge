<template>
  <div class="settings-page">
    <h2 class="page-title">设置</h2>

    <el-card class="settings-card">
      <template #header>
        <h3 style="margin: 0">数据导出</h3>
      </template>
      <p>将全部花销记录导出为 CSV 文件（含 UTF-8 BOM，可用 Excel 直接打开）。</p>
      <el-button type="primary" @click="handleExport">导出 CSV</el-button>
    </el-card>

    <el-card class="settings-card">
      <template #header>
        <h3 style="margin: 0">关于</h3>
      </template>
      <p>黑马记账 v0.1.0</p>
      <p>个人桌面记账工具，支持 Windows 与 macOS。数据仅存储在本地，不上传云端。</p>
    </el-card>

    <el-card class="settings-card">
      <template #header>
        <h3 style="margin: 0">分类管理（预留）</h3>
      </template>
      <p>当前版本使用内置分类，自定义增删分类将在后续版本提供。</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';

async function handleExport() {
  try {
    const csv = await window.chargeDB.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `charge-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success('已导出 CSV');
  } catch (e) {
    ElMessage.error('导出失败：' + (e as Error).message);
  }
}
</script>

<style scoped>
.page-title {
  margin-bottom: 12px;
}
.settings-card {
  max-width: 560px;
  margin-bottom: 16px;
}
</style>

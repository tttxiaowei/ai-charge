<template>
  <el-container class="layout">
    <el-aside width="200px" class="sidebar">
      <h1 class="logo">黑马记账</h1>
      <el-menu :default-active="activeIndex" router class="side-menu">
        <el-menu-item index="quick-record">
          <span>✏️ 记账</span>
        </el-menu-item>
        <el-menu-item index="records">
          <span>📋 记账列表</span>
        </el-menu-item>
        <el-menu-item index="stats">
          <span>📊 统计</span>
        </el-menu-item>
        <el-menu-item index="settings">
          <span>⚙️ 设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main class="main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

// el-menu router 模式下 index 即路由 path 名，这里用 index 匹配 route.name
const activeIndex = () => route.name || '';

function onMenuSelect(index: string) {
  router.push('/' + index);
}
</script>

<style scoped>
.layout {
  height: 100vh;
}
.sidebar {
  border-right: 1px solid #e4e7ed;
  background: #fff;
}
.logo {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  padding: 20px 20px 10px;
}
.side-menu {
  border-right: none;
}
.main {
  background: #f5f7fa;
  overflow-y: auto;
}
</style>

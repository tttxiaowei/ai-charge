import { createRouter, createWebHashHistory } from 'vue-router';
import QuickRecordView from './views/QuickRecordView.vue';
import RecordsView from './views/RecordsView.vue';
import StatsView from './views/StatsView.vue';
import SettingsView from './views/SettingsView.vue';

const routes = [
  { path: '/', redirect: '/quick-record' },
  { path: '/quick-record', name: 'quick-record', component: QuickRecordView },
  { path: '/records', name: 'records', component: RecordsView },
  { path: '/stats', name: 'stats', component: StatsView },
  { path: '/settings', name: 'settings', component: SettingsView },
];

export default createRouter({
  history: createWebHashHistory(),
  routes,
});

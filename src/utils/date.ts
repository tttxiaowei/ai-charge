/**
 * 把任意日期来源（string / number / Date / 空）格式化为 'YYYY-MM-DD HH:mm' 本地时间字符串。
 * 空值回退到当前日期的 'YYYY-MM-DD'（仅到日，无时间部分，与历史行为一致）。
 * 供记账表单 / 编辑弹窗等需要展示 occur_time 的 UI 复用，避免多处拷贝。
 */
export function formatDateTime(dt: unknown): string {
  if (!dt) return new Date().toISOString().slice(0, 10);
  const d = new Date(dt as string | number | Date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 把"分"（整数）格式化为两位小数的元字符串，供金额展示用。 */
export function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

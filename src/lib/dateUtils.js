// 日期相關純函式（FE-1）：與 React 無關，集中於此便於測試與重用

export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const formatFullDateTime = (date) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const toLocalMidnight = (dateInput) => {
  if (!dateInput) return new Date();
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
};

import { platformTitle } from './common.js';

export const formatNumberList = (ref, label, items = [], options = {}) => {
  const ranges = compactNumberRanges(items.map(item => item.number));
  const lines = [
    `${platformTitle(ref.platform)} 开启 ${label} 编号`,
    `仓库: ${ref.fullName}`,
    `编号: ${ranges || '无'}`
  ];
  if (options.truncated) lines.push('提示: 数量较多，仅统计前 1000 个');
  return lines.join('\n');
};

export const compactNumberRanges = values => {
  const numeric = [];
  const textNumbers = [];
  const seenText = new Set();

  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    if (/^\d+$/.test(text)) {
      numeric.push(Number(text));
    } else if (!seenText.has(text)) {
      seenText.add(text);
      textNumbers.push(text);
    }
  }

  const sorted = [...new Set(numeric)].sort((left, right) => left - right);
  const ranges = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index];
    let end = start;
    while (sorted[index + 1] === end + 1) {
      end = sorted[index + 1];
      index += 1;
    }
    ranges.push(start === end ? String(start) : `${start}~${end}`);
  }

  return [...ranges, ...textNumbers].join(', ');
};

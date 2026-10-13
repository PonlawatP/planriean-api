import { test, expect } from 'bun:test';
const { templateGE } = require('../../src/utils/customs/msu');

// src/utils/customs/msu.js only exports the MSU General-Education category template (no parsing / HTTP here).
test('templateGE has 5 GE categories keyed by 004x course-code prefixes', () => {
  expect(templateGE).toHaveLength(5);
  expect(templateGE.map((g) => g.startsWith)).toEqual(['0041', '0042', '0043', '0044', '0045']);
  for (const g of templateGE) {
    expect(g.header).toMatch(/^หมวดหมู่ที่ [1-5]$/);
    expect(g.desc.length).toBeGreaterThan(0);
  }
});

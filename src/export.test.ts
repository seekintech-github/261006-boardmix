import { describe, expect, it } from 'vitest';
import { COMPANY_LOGO_DATA_URL, COMPANY_NAME, PRODUCT_NAME } from './branding';
import { exportSvg } from './export';
import { createBoard, createDemoBoards } from './model';

describe('branded image export', () => {
  it('embeds the company logo and full developer attribution without external resources', () => {
    const svg = exportSvg(createDemoBoards()[0]);
    expect(COMPANY_LOGO_DATA_URL).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    expect(svg).toContain(`<image href="${COMPANY_LOGO_DATA_URL}"`);
    expect(svg).toContain(`由 ${COMPANY_NAME} 开发`);
    expect(svg).toContain(`${PRODUCT_NAME} · 让想法清晰可见`);
    expect(svg).not.toMatch(/(?:href|src)="(?:https?:|\/)/);
  });

  it.each(['empty', 'small'] as const)(
    'keeps the entire footer within a %s board and below its contents',
    (size) => {
      const board = createBoard('flow');
      if (size === 'empty') board.nodes = [];
      const svg = exportSvg(board);
      const [, width, height] = svg.match(/<svg[^>]* width="(\d+)" height="(\d+)"/)!.map(Number);
      const [, x, y, fontSize] = svg
        .match(/<text x="(\d+)" y="(\d+)"[^>]*font-size="(\d+)">由 /)!
        .map(Number);
      // One font-size per Unicode character conservatively bounds the Chinese text.
      const textWidth = Array.from(`由 ${COMPANY_NAME} 开发`).length * fontSize;
      expect(x + textWidth).toBeLessThanOrEqual(width - 56);
      expect(y + fontSize).toBeLessThan(height);
      const [, logoX, logoY, logoWidth, logoHeight] = svg
        .match(/<image[^>]* x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/)!
        .map(Number);
      expect(logoX + logoWidth).toBeLessThan(x);
      expect(logoY + logoHeight).toBeLessThan(height);
      const contentBottom = board.nodes.length
        ? 104 +
          Math.max(...board.nodes.map((node) => node.position.y + node.height!)) -
          Math.min(...board.nodes.map((node) => node.position.y))
        : 104;
      expect(logoY).toBeGreaterThan(contentBottom);
    },
  );

  it('escapes user text while retaining the company footer', () => {
    const board = createBoard('flow');
    board.name = '<script>&"\'\u0001';
    board.nodes[0].data.label = 'A < B & C > D';
    const svg = exportSvg(board);
    expect(svg).toContain('&lt;script&gt;&amp;&quot;&apos;');
    expect(svg).toContain('A &lt; B &amp; C &gt; D');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('\u0001');
    expect(svg).toContain(`由 ${COMPANY_NAME} 开发`);
  });
});

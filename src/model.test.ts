import { describe, expect, it } from 'vitest';
import { MarkerType } from '@xyflow/react';
import {
  createBoard,
  createDemoBoards,
  exportBoard,
  layoutBoard,
  MAX_COORDINATE,
  MAX_FILE_BYTES,
  NODE_SIZES,
  parseBoard,
  type Board,
} from './model';

function expectNoOverlap(board: Board) {
  for (let i = 0; i < board.nodes.length; i++) {
    const a = board.nodes[i];
    const aSize = {
      ...NODE_SIZES[a.data.kind],
      width: a.width ?? NODE_SIZES[a.data.kind].width,
      height: a.height ?? NODE_SIZES[a.data.kind].height,
    };
    expect(Number.isFinite(a.position.x) && Number.isFinite(a.position.y)).toBe(true);
    for (const b of board.nodes.slice(i + 1)) {
      const bSize = {
        width: b.width ?? NODE_SIZES[b.data.kind].width,
        height: b.height ?? NODE_SIZES[b.data.kind].height,
      };
      const overlap =
        a.position.x < b.position.x + bSize.width &&
        a.position.x + aSize.width > b.position.x &&
        a.position.y < b.position.y + bSize.height &&
        a.position.y + aSize.height > b.position.y;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

function documentFixture() {
  return JSON.parse(exportBoard(createDemoBoards()[0]));
}

describe('board layout', () => {
  it('provides useful Chinese mind map and branching flow examples with valid connections', () => {
    const [mindmap, flow] = createDemoBoards();
    expect(mindmap.name).toBe('个人成长计划');
    expect(mindmap.nodes.length).toBeGreaterThanOrEqual(12);
    expect(flow.name).toBe('灵感落地流程');
    expect(flow.nodes.length).toBeGreaterThanOrEqual(8);
    expect(
      flow.nodes.some(
        (item) =>
          item.data.kind === 'decision' &&
          flow.edges.filter((link) => link.source === item.id).length > 1,
      ),
    ).toBe(true);
    expect(
      flow.edges.every(
        (link) =>
          typeof link.markerEnd === 'object' && link.markerEnd.type === MarkerType.ArrowClosed,
      ),
    ).toBe(true);
    for (const board of [mindmap, flow]) {
      expectNoOverlap(board);
      const nodes = new Map(board.nodes.map((item) => [item.id, item]));
      for (const link of board.edges) {
        const source = nodes.get(link.source)!;
        const target = nodes.get(link.target)!;
        if (board.kind === 'mindmap') {
          expect(target.position.x).toBeGreaterThan(source.position.x + source.width!);
          expect(link.sourceHandle).toBe('right');
          expect(link.targetHandle).toBe('left');
        } else {
          expect(target.position.y).toBeGreaterThan(source.position.y + source.height!);
          expect(link.sourceHandle).toBe('bottom');
          expect(link.targetHandle).toBe('top');
        }
      }
    }
    const flowWidth = Math.max(...flow.nodes.map((item) => item.position.x + item.width!));
    const flowHeight = Math.max(...flow.nodes.map((item) => item.position.y + item.height!));
    expect(flowWidth).toBeLessThanOrEqual(550);
    expect(flowHeight).toBeLessThanOrEqual(860);
  });

  it.each(['mindmap', 'flow'] as const)(
    'keeps %s content and dimensions intact while arranging cycles, disconnected nodes, and large notes',
    (kind) => {
      const original = createDemoBoards()[0];
      original.kind = kind;
      original.nodes.push({
        id: 'isolated',
        type: 'boardNode',
        position: { x: -999, y: -999 },
        width: 700,
        height: 400,
        data: { label: '不连接的便签', kind: 'note', color: '#36A592' },
      });
      original.edges.push({
        id: 'cycle',
        source: 'books',
        target: 'growth',
        type: 'smoothstep',
        label: '回顾',
      });
      const originalSnapshot = JSON.stringify(original);
      const arranged = layoutBoard(original);
      expectNoOverlap(arranged);
      expect(arranged.nodes.map((item) => item.id)).toEqual(original.nodes.map((item) => item.id));
      expect(arranged.nodes.map((item) => item.data)).toEqual(
        original.nodes.map((item) => item.data),
      );
      expect(arranged.nodes.map(({ position: _position, ...item }) => item)).toEqual(
        original.nodes.map(({ position: _position, ...item }) => item),
      );
      if (kind === 'mindmap') expect(arranged.edges).toBe(original.edges);
      else
        expect(arranged.edges).toEqual(
          original.edges.map((link) => ({ ...link, sourceHandle: 'bottom', targetHandle: 'top' })),
        );
      expect(JSON.stringify(original)).toBe(originalSnapshot);
      expect(layoutBoard(arranged).nodes.map((item) => item.position)).toEqual(
        arranged.nodes.map((item) => item.position),
      );
    },
  );

  it('supports empty boards and seeds new boards with one editable topic', () => {
    const board = createBoard('flow');
    expect(board.nodes[0].data.label).toBe('开始');
    expect(board.nodes[0].selected).toBeUndefined();
    expect(layoutBoard({ ...board, nodes: [], edges: [] }).nodes).toEqual([]);
  });

  it('round-trips a 360-node flow chain after automatic layout', () => {
    const board = createBoard('flow');
    board.nodes = Array.from({ length: 360 }, (_, index) => ({
      id: `node-${index}`,
      type: 'boardNode',
      position: { x: 0, y: 0 },
      height: 300,
      data: { label: `步骤 ${index + 1}`, kind: 'process', color: '#7765E8' },
    }));
    board.edges = Array.from({ length: 359 }, (_, index) => ({
      id: `edge-${index}`,
      source: `node-${index}`,
      target: `node-${index + 1}`,
      type: 'smoothstep',
    }));
    const arranged = layoutBoard(board);
    expect(arranged.nodes.at(-1)!.position.y).toBeGreaterThan(100000);
    expect(arranged.nodes.at(-1)!.position.y).toBeLessThan(MAX_COORDINATE);
    arranged.nodes.slice(1).forEach((item, index) => {
      expect(item.position.y).toBeGreaterThan(
        arranged.nodes[index].position.y + arranged.nodes[index].height!,
      );
    });
    expect(parseBoard(exportBoard(arranged)).nodes.map((item) => item.position)).toEqual(
      arranged.nodes.map((item) => item.position),
    );
  });

  it('keeps the maximum supported chain with large nodes and 3000 edges importable after layout', () => {
    const board = createBoard('flow');
    board.nodes = Array.from({ length: 1000 }, (_, index) => ({
      id: `node-${index}`,
      type: 'boardNode',
      position: { x: 0, y: 0 },
      width: 2000,
      height: 2000,
      data: { label: `步骤 ${index + 1}`, kind: 'process', color: '#7765E8' },
    }));
    board.edges = Array.from({ length: 3000 }, (_, index) => ({
      id: `edge-${index}`,
      source: `node-${index % 999}`,
      target: `node-${(index % 999) + 1}`,
      type: 'smoothstep',
    }));
    const arranged = layoutBoard(board);
    expect(arranged.nodes.at(-1)!.position.y).toBeGreaterThan(2000000);
    expect(arranged.nodes.at(-1)!.position.y).toBeLessThan(MAX_COORDINATE);
    const restored = parseBoard(exportBoard(arranged));
    expect(restored.nodes.map((item) => item.position)).toEqual(
      arranged.nodes.map((item) => item.position),
    );
    expect(restored.edges).toHaveLength(3000);
  });
});

describe('board file format', () => {
  it('round-trips user content, dimensions, branch labels and arrows, assigning a fresh board ID', () => {
    const original = createDemoBoards()[1];
    original.nodes[0].data.label = '旅行计划 🧭\n第二行';
    original.nodes[0].position = { x: -200.5, y: 170.25 };
    original.nodes[0].selected = true;
    original.nodes[0].width = 250;
    original.edges[0].markerEnd = {
      type: MarkerType.ArrowClosed,
      color: '#5297DB',
      width: 18,
      height: 18,
    };
    original.edges[0].style = { stroke: '#5297DB', strokeWidth: 2.5, strokeDasharray: '6 4' };
    const exported = exportBoard(original);
    const restored = parseBoard(exported);
    expect(restored.id).not.toBe(original.id);
    expect(restored.id).not.toBe(parseBoard(exported).id);
    expect(restored.name).toBe(original.name);
    expect(restored.nodes.map((item) => item.data)).toEqual(
      original.nodes.map((item) => item.data),
    );
    expect(restored.nodes[0].position).toEqual({ x: -200.5, y: 170.25 });
    expect(restored.nodes[0].width).toBe(250);
    expect(restored.nodes[0].selected).toBeUndefined();
    expect(restored.edges[0].markerEnd).toEqual(original.edges[0].markerEnd);
    expect(restored.edges[0].style).toEqual(original.edges[0].style);
    expect(restored.edges.map((link) => link.label)).toEqual(
      original.edges.map((link) => link.label),
    );
    expect(JSON.parse(exported).schemaVersion).toBe(1);
  });

  it.each([
    [
      'unsupported version',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.schemaVersion = 9;
      },
    ],
    [
      'wrong board kind',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.kind = 'html';
      },
    ],
    [
      'invalid node type',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].type = 'iframe';
      },
    ],
    [
      'unknown shape',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].data.kind = '__proto__';
      },
    ],
    [
      'array instead of shape name',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].data.kind = ['topic'];
      },
    ],
    [
      'CSS injection',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].data.color = 'url(https://example.com)';
      },
    ],
    [
      'oversized coordinate',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].position.x = MAX_COORDINATE + 1;
      },
    ],
    [
      'null coordinate',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].position.y = null;
      },
    ],
    [
      'oversized node',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].width = 2001;
      },
    ],
    [
      'negative height',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].height = -10;
      },
    ],
    [
      'duplicate node',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[1].id = doc.board.nodes[0].id;
      },
    ],
    [
      'dangling edge',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.edges[0].target = 'missing';
      },
    ],
    [
      'duplicate edge',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.edges[1].id = doc.board.edges[0].id;
      },
    ],
    [
      'invalid handle',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.edges[0].sourceHandle = '<script>';
      },
    ],
    [
      'invalid arrow',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.edges[0].markerEnd = { type: 'html' };
      },
    ],
    [
      'oversized label',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes[0].data.label = '长'.repeat(501);
      },
    ],
    [
      'too many nodes',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.nodes = Array.from({ length: 1001 }, (_, i) => ({
          ...doc.board.nodes[0],
          id: `node-${i}`,
        }));
      },
    ],
    [
      'too many edges',
      (doc: ReturnType<typeof documentFixture>) => {
        doc.board.edges = Array.from({ length: 3001 }, (_, i) => ({
          ...doc.board.edges[0],
          id: `edge-${i}`,
        }));
      },
    ],
  ])('rejects %s without partially loading a board', (_label, damage) => {
    const fixture = documentFixture();
    damage(fixture);
    expect(() => parseBoard(JSON.stringify(fixture))).toThrow('无法导入白板');
  });

  it('rejects broken JSON and oversized UTF-8 files', () => {
    expect(() => parseBoard('{broken')).toThrow('不是有效的 JSON');
    expect(() => parseBoard('中'.repeat(750000))).toThrow('超过 2 MB');
    expect(() => parseBoard('null')).toThrow('格式不正确');
  });

  it('removes optional formatting so a large export stays within the import file limit', () => {
    const board = createBoard('mindmap');
    const original = board.nodes[0];
    board.nodes = Array.from({ length: 1000 }, (_, index) => ({
      ...original,
      id: `node-${index}`,
      data: { ...original.data, description: '文'.repeat(600) },
    }));
    const text = exportBoard(board);
    expect(
      new TextEncoder().encode(JSON.stringify(JSON.parse(text), null, 2)).byteLength,
    ).toBeGreaterThan(MAX_FILE_BYTES);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_FILE_BYTES);
    const restored = parseBoard(text);
    expect(restored.nodes.map((item) => item.data)).toEqual(board.nodes.map((item) => item.data));
  });

  it('refuses an export that cannot be imported instead of creating an unusable backup file', () => {
    const board = createBoard('mindmap');
    const original = board.nodes[0];
    board.nodes = Array.from({ length: 500 }, (_, index) => ({
      ...original,
      id: `node-${index}`,
      data: { ...original.data, description: '文'.repeat(1600) },
    }));
    expect(() => exportBoard(board)).toThrow('无法导出白板：文件超过 2 MB');
    board.nodes = [original];
    board.nodes[0].position.x = MAX_COORDINATE + 1;
    expect(() => exportBoard(board)).toThrow('无法导出白板：横坐标');
  });

  it('accepts exactly 2 MB of UTF-8 JSON and rejects a single extra byte', () => {
    const original = exportBoard(createBoard('flow', '文件大小边界'));
    const padding = MAX_FILE_BYTES - new TextEncoder().encode(original).byteLength;
    const exact = original + ' '.repeat(padding);
    expect(parseBoard(exact).name).toBe('文件大小边界');
    expect(() => parseBoard(exact + ' ')).toThrow('超过 2 MB');
  });
});

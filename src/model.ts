import { MarkerType, type Edge, type Node } from '@xyflow/react';

export type NodeKind = 'topic' | 'process' | 'decision' | 'note' | 'text';

export type NodeData = {
  label: string;
  kind: NodeKind;
  color: string;
  description?: string;
  [key: string]: unknown;
};

export type BoardNode = Node<NodeData, 'boardNode'>;

export type Board = {
  id: string;
  name: string;
  kind: 'mindmap' | 'flow';
  nodes: BoardNode[];
  edges: Edge[];
  updatedAt: number;
};

export const PALETTE = ['#7765E8', '#5297DB', '#36A592', '#E1AA43', '#D47A9F', '#778597'] as const;
export const NODE_SIZES: Record<NodeKind, { width: number; height: number }> = {
  topic: { width: 180, height: 64 },
  process: { width: 180, height: 64 },
  decision: { width: 160, height: 100 },
  note: { width: 190, height: 140 },
  text: { width: 200, height: 56 },
};

export function nodeSize(kind: NodeKind) {
  return { ...NODE_SIZES[kind] };
}

export function makeId(prefix = 'id'): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function node(
  id: string,
  label: string,
  kind: NodeKind,
  color: string,
  description?: string,
): BoardNode {
  const size = nodeSize(kind);
  return {
    id,
    type: 'boardNode',
    position: { x: 0, y: 0 },
    ...size,
    style: size,
    data: { label, kind, color, ...(description ? { description } : {}) },
  };
}

function edge(source: string, target: string, color: string, label?: string): Edge {
  return {
    id: makeId('edge'),
    source,
    target,
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'smoothstep',
    style: { stroke: color, strokeWidth: 2 },
    ...(label ? { label } : {}),
  };
}

export function createBoard(kind: Board['kind'], name?: string): Board {
  const firstId = makeId('node');
  const board: Board = {
    id: makeId('board'),
    name: name?.trim() || (kind === 'mindmap' ? '未命名思维导图' : '未命名流程图'),
    kind,
    nodes: [node(firstId, kind === 'mindmap' ? '中心主题' : '开始', 'topic', PALETTE[0])],
    edges: [],
    updatedAt: Date.now(),
  };
  return layoutBoard(board);
}

export function createDemoBoards(): Board[] {
  const mindmap: Board = {
    id: makeId('board'),
    name: '个人成长计划',
    kind: 'mindmap',
    updatedAt: Date.now(),
    nodes: [
      node('growth', '个人成长计划', 'topic', PALETTE[0], '让每一点进步，都有迹可循'),
      node('learn', '阅读与学习', 'topic', PALETTE[1]),
      node('books', '每月读 2 本书', 'process', PALETTE[1], '记录一句启发与一个行动'),
      node('notes', '建立知识笔记', 'process', PALETTE[1], '每周整理，连接新的想法'),
      node('health', '身心健康', 'topic', PALETTE[2]),
      node('exercise', '每周运动 3 次', 'process', PALETTE[2], '跑步、瑜伽，或一次散步'),
      node('sleep', '保持规律作息', 'process', PALETTE[2], '给自己留出充足休息时间'),
      node('skills', '技能成长', 'topic', PALETTE[3]),
      node('practice', '完成一个小作品', 'process', PALETTE[3], '从想法出发，边做边学'),
      node('review', '每周回顾与复盘', 'process', PALETTE[3], '看见进步，调整下一步'),
      node('life', '生活与体验', 'topic', PALETTE[4]),
      node('travel', '探索一个新地方', 'process', PALETTE[4], '为日常留一点新鲜感'),
      node('connect', '与重要的人相聚', 'process', PALETTE[4], '认真倾听，好好陪伴'),
    ],
    edges: [],
  };
  const branches = [
    ['learn', 'books', 'notes'],
    ['health', 'exercise', 'sleep'],
    ['skills', 'practice', 'review'],
    ['life', 'travel', 'connect'],
  ];
  for (const [branch, ...children] of branches) {
    const color = mindmap.nodes.find((item) => item.id === branch)!.data.color;
    mindmap.edges.push(
      edge('growth', branch, color),
      ...children.map((child) => edge(branch, child, color)),
    );
  }

  const flow: Board = {
    id: makeId('board'),
    name: '灵感落地流程',
    kind: 'flow',
    updatedAt: Date.now(),
    nodes: [
      node('idea', '捕捉一个灵感', 'topic', PALETTE[0], '把脑海里的火花先写下来'),
      node('clarify', '明确问题与目标', 'process', PALETTE[1], '这件事能带来什么改变？'),
      node('worth', '值得现在投入？', 'decision', PALETTE[3]),
      node('prototype', '做一个最小原型', 'process', PALETTE[2], '先让核心想法可以被体验'),
      node('library', '存入灵感库', 'process', PALETTE[5], '保留想法，等待合适时机'),
      node('validate', '验证效果达标？', 'decision', PALETTE[3]),
      node('publish', '发布并收集反馈', 'process', PALETTE[2], '让真实反馈帮助它成长'),
      node('improve', '记录下一轮改进', 'process', PALETTE[4], '缩小范围，找到关键问题'),
      node('finish', '复盘与沉淀', 'topic', PALETTE[0], '把经验带进下一个灵感'),
    ],
    edges: [],
  };
  const links: [string, string, string?][] = [
    ['idea', 'clarify'],
    ['clarify', 'worth'],
    ['worth', 'prototype', '值得尝试'],
    ['worth', 'library', '暂时搁置'],
    ['prototype', 'validate'],
    ['validate', 'publish', '达到预期'],
    ['validate', 'improve', '继续打磨'],
    ['library', 'finish'],
    ['publish', 'finish'],
    ['improve', 'finish'],
  ];
  flow.edges = links.map(([source, target, label]) => {
    const color = flow.nodes.find((item) => item.id === target)!.data.color;
    return {
      ...edge(source, target, color, label),
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  });
  return [layoutBoard(mindmap), layoutBoard(flow)];
}

function dimensions(item: BoardNode) {
  const defaults = NODE_SIZES[item.data.kind];
  return {
    width: typeof item.width === 'number' && item.width > 0 ? item.width : defaults.width,
    height: typeof item.height === 'number' && item.height > 0 ? item.height : defaults.height,
  };
}

/** Mind maps grow rightward; flowcharts run downward with top/bottom connections. */
export function layoutBoard(board: Board): Board {
  if (board.kind === 'mindmap') return layoutHorizontal(board, 96, 36);
  const arranged = layoutHorizontal(
    {
      ...board,
      nodes: board.nodes.map((item) => {
        const size = dimensions(item);
        return { ...item, width: size.height, height: size.width };
      }),
    },
    56,
    52,
  );
  return {
    ...board,
    nodes: board.nodes.map((item, index) => ({
      ...item,
      position: { x: arranged.nodes[index].position.y, y: arranged.nodes[index].position.x },
    })),
    edges: board.edges.map((link) => ({ ...link, sourceHandle: 'bottom', targetHandle: 'top' })),
    updatedAt: arranged.updatedAt,
  };
}

/** Layer connected nodes left-to-right. Strongly connected components keep loops finite. */
function layoutHorizontal(board: Board, horizontalGap: number, verticalGap: number): Board {
  if (!board.nodes.length) return { ...board, nodes: [], updatedAt: Date.now() };
  const lookup = new Map(board.nodes.map((item) => [item.id, item]));
  const outgoing = new Map(board.nodes.map((item) => [item.id, [] as string[]]));
  for (const link of board.edges) {
    if (lookup.has(link.source) && lookup.has(link.target) && link.source !== link.target)
      outgoing.get(link.source)!.push(link.target);
  }

  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const components: string[][] = [];
  const traversal = new Map<string, number>();
  let counter = 0;
  function visit(id: string) {
    indices.set(id, counter);
    low.set(id, counter);
    traversal.set(id, counter++);
    stack.push(id);
    active.add(id);
    for (const target of outgoing.get(id)!) {
      if (!indices.has(target)) {
        visit(target);
        low.set(id, Math.min(low.get(id)!, low.get(target)!));
      } else if (active.has(target)) low.set(id, Math.min(low.get(id)!, indices.get(target)!));
    }
    if (low.get(id) === indices.get(id)) {
      const component: string[] = [];
      let current: string;
      do {
        current = stack.pop()!;
        active.delete(current);
        component.push(current);
      } while (current !== id);
      components.push(component);
    }
  }
  // Begin with roots so insertion order never places children ahead of their parents.
  const incomingIds = new Set(board.edges.map((link) => link.target));
  for (const item of [...board.nodes.filter((item) => !incomingIds.has(item.id)), ...board.nodes]) {
    if (!indices.has(item.id)) visit(item.id);
  }

  const membership = new Map<string, number>();
  components.forEach((group, index) => group.forEach((id) => membership.set(id, index)));
  const componentEdges = components.map(() => new Set<number>());
  const inDegree = components.map(() => 0);
  for (const [source, targets] of outgoing) {
    for (const target of targets) {
      const from = membership.get(source)!;
      const to = membership.get(target)!;
      if (from !== to && !componentEdges[from].has(to)) {
        componentEdges[from].add(to);
        inDegree[to]++;
      }
    }
  }
  const ranks = components.map(() => 0);
  const queue = inDegree.flatMap((degree, index) => (degree === 0 ? [index] : []));
  for (let index = 0; index < queue.length; index++) {
    const source = queue[index];
    for (const target of componentEdges[source]) {
      ranks[target] = Math.max(ranks[target], ranks[source] + 1);
      if (--inDegree[target] === 0) queue.push(target);
    }
  }

  const layers: BoardNode[][] = [];
  for (const item of board.nodes) {
    const rank = ranks[membership.get(item.id)!];
    (layers[rank] ??= []).push(item);
  }
  layers.forEach((layer) => layer.sort((a, b) => traversal.get(a.id)! - traversal.get(b.id)!));
  const positions = new Map<string, { x: number; y: number }>();
  const heights = layers.map(
    (layer) =>
      layer.reduce((sum, item) => sum + dimensions(item).height, 0) +
      (layer.length - 1) * verticalGap,
  );
  const fullHeight = Math.max(...heights);
  let x = 0;
  layers.forEach((layer, rank) => {
    let y = (fullHeight - heights[rank]) / 2;
    for (const item of layer) {
      positions.set(item.id, { x, y });
      y += dimensions(item).height + verticalGap;
    }
    x += Math.max(...layer.map((item) => dimensions(item).width)) + horizontalGap;
  });

  // Place each parent near the center of its children, then pack siblings without overlap.
  for (let rank = layers.length - 2; rank >= 0; rank--) {
    const layer = layers[rank];
    let cursor = -Infinity;
    let displacement = 0;
    for (const item of layer) {
      const targets = outgoing
        .get(item.id)!
        .filter((target) => ranks[membership.get(target)!] > rank);
      const desired = targets.length
        ? targets.reduce(
            (sum, target) =>
              sum + positions.get(target)!.y + dimensions(lookup.get(target)!).height / 2,
            0,
          ) /
            targets.length -
          dimensions(item).height / 2
        : positions.get(item.id)!.y;
      const y = Math.max(desired, cursor);
      displacement += y - desired;
      positions.get(item.id)!.y = y;
      cursor = y + dimensions(item).height + verticalGap;
    }
    const correction = displacement / layer.length;
    for (const item of layer) positions.get(item.id)!.y -= correction;
  }
  const minimumY = Math.min(...[...positions.values()].map((position) => position.y));
  return {
    ...board,
    nodes: board.nodes.map((item) => ({
      ...item,
      position: { x: positions.get(item.id)!.x, y: positions.get(item.id)!.y - minimumY },
    })),
    updatedAt: Date.now(),
  };
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_COORDINATE = 3_000_000;
const MAX_NODES = 1000;
const MAX_EDGES = 3000;
const COLOR = /^#[\da-f]{6}$/i;
const ID = /^[\w.:-]{1,120}$/;
const HANDLES = new Set(['left', 'right', 'top', 'bottom']);

function invalid(message: string): never {
  throw new Error(`无法导入白板：${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name}格式不正确。`);
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim()))
    invalid(`${name}为空或过长。`);
  return value;
}

function identifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !ID.test(value)) invalid(`${name}格式不正确。`);
  return value;
}

function number(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    invalid(`${name}超出允许范围。`);
  return value;
}

function color(value: unknown, name: string): string {
  if (typeof value !== 'string' || !COLOR.test(value)) invalid(`${name}必须为六位十六进制颜色。`);
  return value;
}

function parseMarker(value: unknown): Edge['markerEnd'] {
  if (value === undefined || value === null) return undefined;
  const marker = record(value, '箭头');
  if (marker.type !== 'arrow' && marker.type !== 'arrowclosed') invalid('箭头类型不受支持。');
  return {
    type: marker.type === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed,
    ...(marker.color !== undefined ? { color: color(marker.color, '箭头颜色') } : {}),
    ...(marker.width !== undefined ? { width: number(marker.width, '箭头宽度', 1, 100) } : {}),
    ...(marker.height !== undefined ? { height: number(marker.height, '箭头高度', 1, 100) } : {}),
  };
}

/** Save only document fields, excluding transient selection and React Flow measurements. */
export function exportBoard(board: Board): string {
  const saved = {
    ...board,
    nodes: board.nodes.map((item) => ({
      id: item.id,
      type: 'boardNode',
      position: item.position,
      data: {
        label: item.data.label,
        kind: item.data.kind,
        color: item.data.color,
        ...(item.data.description !== undefined ? { description: item.data.description } : {}),
      },
      ...dimensions(item),
    })),
    edges: board.edges.map((link) => ({
      id: link.id,
      source: link.source,
      target: link.target,
      type: 'smoothstep',
      sourceHandle: link.sourceHandle ?? 'right',
      targetHandle: link.targetHandle ?? 'left',
      ...(typeof link.label === 'string' ? { label: link.label } : {}),
      ...(link.style
        ? {
            style: {
              stroke: link.style.stroke,
              strokeWidth: link.style.strokeWidth,
              strokeDasharray: link.style.strokeDasharray,
            },
          }
        : {}),
      ...(typeof link.markerEnd === 'object' ? { markerEnd: link.markerEnd } : {}),
      ...(typeof link.markerStart === 'object' ? { markerStart: link.markerStart } : {}),
      ...(link.animated !== undefined ? { animated: link.animated } : {}),
    })),
  };
  // An exported document must always be readable by this same version of the app.
  // Prefer readable JSON, but remove whitespace before rejecting a large document.
  try {
    readPersistedBoard(saved);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message.replace('无法导入白板', '无法导出白板')
        : '无法导出白板：画布数据不正确。',
    );
  }
  const envelope = { schemaVersion: 1, board: saved };
  const readable = JSON.stringify(envelope, null, 2);
  if (new TextEncoder().encode(readable).byteLength <= MAX_FILE_BYTES) return readable;
  const compact = JSON.stringify(envelope);
  if (new TextEncoder().encode(compact).byteLength > MAX_FILE_BYTES)
    throw new Error('无法导出白板：文件超过 2 MB，请将画布拆分后再保存。');
  return compact;
}

/** Import a new document; invalid links and unsupported data are rejected, never partly loaded. */
export function parseBoard(text: string): Board {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES)
    invalid('文件超过 2 MB，请拆分后再试。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid('文件不是有效的 JSON。');
  }
  const envelope = record(parsed, '文件');
  if (envelope.schemaVersion !== 1) invalid('文件版本不受支持，请使用版本 1 的白板文件。');
  const board = readPersistedBoard(envelope.board);
  return { ...board, id: makeId('board'), updatedAt: Date.now() };
}

/** Validate saved content without applying the separate import-file size limit. */
export function readPersistedBoard(value: unknown): Board {
  const source = record(value, '白板');
  const id = identifier(source.id, '白板标识');
  const name = string(source.name, '白板名称', 120);
  if (source.kind !== 'mindmap' && source.kind !== 'flow') invalid('白板类型不受支持。');
  if (source.updatedAt !== undefined) number(source.updatedAt, '保存时间', 0, 8640000000000000);
  if (!Array.isArray(source.nodes) || source.nodes.length > MAX_NODES)
    invalid('节点格式不正确或超过 1000 个。');
  if (!Array.isArray(source.edges) || source.edges.length > MAX_EDGES)
    invalid('连线格式不正确或超过 3000 条。');

  const nodeIds = new Set<string>();
  const nodes: BoardNode[] = source.nodes.map((value) => {
    const item = record(value, '节点');
    const id = identifier(item.id, '节点标识');
    if (nodeIds.has(id)) invalid('存在重复的节点标识。');
    nodeIds.add(id);
    if (item.type !== 'boardNode') invalid('节点类型不受支持。');
    const position = record(item.position, '节点位置');
    const data = record(item.data, '节点内容');
    const kind = data.kind as NodeKind;
    if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(NODE_SIZES, kind))
      invalid('节点形状不受支持。');
    const label = string(data.label, '节点文字', 500, true);
    const nodeColor = color(data.color, '节点颜色');
    const description =
      data.description === undefined ? undefined : string(data.description, '节点说明', 5000, true);
    const size = {
      width:
        item.width === undefined
          ? NODE_SIZES[kind].width
          : number(item.width, '节点宽度', 40, 2000),
      height:
        item.height === undefined
          ? NODE_SIZES[kind].height
          : number(item.height, '节点高度', 24, 2000),
    };
    return {
      id,
      type: 'boardNode',
      position: {
        x: number(position.x, '横坐标', -MAX_COORDINATE, MAX_COORDINATE),
        y: number(position.y, '纵坐标', -MAX_COORDINATE, MAX_COORDINATE),
      },
      data: {
        label,
        kind,
        color: nodeColor,
        ...(description !== undefined ? { description } : {}),
      },
      ...size,
      style: size,
    };
  });
  const edgeIds = new Set<string>();
  const colors = new Map(nodes.map((item) => [item.id, item.data.color]));
  const edges: Edge[] = source.edges.map((value) => {
    const item = record(value, '连线');
    const id = identifier(item.id, '连线标识');
    if (edgeIds.has(id)) invalid('存在重复的连线标识。');
    edgeIds.add(id);
    const from = identifier(item.source, '连线起点');
    const to = identifier(item.target, '连线终点');
    if (!nodeIds.has(from) || !nodeIds.has(to)) invalid('连线引用了不存在的节点。');
    if (item.type !== undefined && item.type !== 'smoothstep') invalid('连线类型不受支持。');
    for (const handle of [item.sourceHandle, item.targetHandle]) {
      if (
        handle !== undefined &&
        handle !== null &&
        (typeof handle !== 'string' || !HANDLES.has(handle))
      )
        invalid('连接点类型不受支持。');
    }
    const style = item.style === undefined ? {} : record(item.style, '连线样式');
    const stroke = style.stroke === undefined ? colors.get(to)! : color(style.stroke, '连线颜色');
    const strokeWidth =
      style.strokeWidth === undefined ? 2 : number(style.strokeWidth, '连线粗细', 0.5, 12);
    let strokeDasharray: string | undefined;
    if (style.strokeDasharray !== undefined) {
      if (
        typeof style.strokeDasharray !== 'string' ||
        style.strokeDasharray.length > 100 ||
        !/^\d+(?:\.\d+)?(?:[ ,]+\d+(?:\.\d+)?)*$/.test(style.strokeDasharray)
      )
        invalid('连线虚线样式不正确。');
      strokeDasharray = style.strokeDasharray;
    }
    if (item.animated !== undefined && typeof item.animated !== 'boolean')
      invalid('连线动画格式不正确。');
    return {
      id,
      source: from,
      target: to,
      type: 'smoothstep',
      sourceHandle: (item.sourceHandle as string | undefined) ?? 'right',
      targetHandle: (item.targetHandle as string | undefined) ?? 'left',
      style: { stroke, strokeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) },
      ...(item.label !== undefined ? { label: string(item.label, '连线文字', 200, true) } : {}),
      ...(item.animated !== undefined ? { animated: item.animated as boolean } : {}),
      markerStart: parseMarker(item.markerStart),
      markerEnd: parseMarker(item.markerEnd),
    };
  });
  return {
    id,
    name,
    kind: source.kind,
    nodes,
    edges,
    updatedAt: (source.updatedAt as number | undefined) ?? Date.now(),
  };
}

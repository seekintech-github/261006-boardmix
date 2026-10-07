import type { Board, BoardNode } from './model';

type Point = { x: number; y: number };
type Side = 'left' | 'right' | 'top' | 'bottom';
type LayoutNode = { node: BoardNode; x: number; y: number; width: number; height: number };

const FONT = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif";
const DEFAULT_SIZES = {
  topic: [180, 64],
  process: [180, 64],
  decision: [160, 100],
  note: [190, 140],
  text: [200, 56],
} as const;
const DIRECTIONS: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function color(value: unknown, fallback = '#7772df'): string {
  return typeof value === 'string' &&
    /^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value)
    ? value
    : fallback;
}

function nodeLayout(node: BoardNode): LayoutNode {
  const size = DEFAULT_SIZES[node.data.kind] ?? DEFAULT_SIZES.process;
  return {
    node,
    x: finite(node.position.x, 0),
    y: finite(node.position.y, 0),
    width: Math.max(24, finite(node.measured?.width, finite(node.width, size[0]))),
    height: Math.max(24, finite(node.measured?.height, finite(node.height, size[1]))),
  };
}

function side(value: unknown, fallback: Side): Side {
  return typeof value === 'string' && Object.hasOwn(DIRECTIONS, value) ? (value as Side) : fallback;
}

function anchor(node: LayoutNode, at: Side): Point {
  return {
    x: node.x + (at === 'left' ? 0 : at === 'right' ? node.width : node.width / 2),
    y: node.y + (at === 'top' ? 0 : at === 'bottom' ? node.height : node.height / 2),
  };
}

function offset(point: Point, direction: Point, distance: number): Point {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance };
}

function route(
  source: LayoutNode,
  target: LayoutNode,
  sourceSide: Side,
  targetSide: Side,
): Point[] {
  const start = anchor(source, sourceSide);
  const end = anchor(target, targetSide);
  const sd = DIRECTIONS[sourceSide];
  const td = DIRECTIONS[targetSide];
  const a = offset(start, sd, 26);
  const b = offset(end, td, 26);
  let middle: Point[];
  if (sd.x && td.x) {
    const mid = (a.x + b.x) / 2;
    if ((mid - a.x) * sd.x >= 0 && (mid - b.x) * td.x >= 0) {
      middle = [
        { x: mid, y: a.y },
        { x: mid, y: b.y },
      ];
    } else {
      const y =
        Math.abs(a.y - b.y) > 100
          ? (a.y + b.y) / 2
          : Math.max(source.y + source.height, target.y + target.height) + 42;
      middle = [
        { x: a.x, y },
        { x: b.x, y },
      ];
    }
  } else if (sd.y && td.y) {
    const mid = (a.y + b.y) / 2;
    if ((mid - a.y) * sd.y >= 0 && (mid - b.y) * td.y >= 0) {
      middle = [
        { x: a.x, y: mid },
        { x: b.x, y: mid },
      ];
    } else {
      const x =
        Math.abs(a.x - b.x) > 100
          ? (a.x + b.x) / 2
          : Math.max(source.x + source.width, target.x + target.width) + 42;
      middle = [
        { x, y: a.y },
        { x, y: b.y },
      ];
    }
  } else {
    middle = sd.x ? [{ x: b.x, y: a.y }] : [{ x: a.x, y: b.y }];
  }
  const points = [start, a, ...middle, b, end].filter(
    (point, i, items) => i === 0 || point.x !== items[i - 1].x || point.y !== items[i - 1].y,
  );
  return points.filter((point, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const before = points[i - 1];
    const after = points[i + 1];
    return !(
      (before.x === point.x &&
        point.x === after.x &&
        (point.y - before.y) * (after.y - point.y) >= 0) ||
      (before.y === point.y &&
        point.y === after.y &&
        (point.x - before.x) * (after.x - point.x) >= 0)
    );
  });
}

function roundedPath(points: Point[]): string {
  const first = points[0];
  let result = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const point = points[i];
    const next = points[i + 1];
    const incoming = Math.hypot(point.x - prev.x, point.y - prev.y);
    const outgoing = Math.hypot(next.x - point.x, next.y - point.y);
    const radius = Math.min(12, incoming / 2, outgoing / 2);
    const a = {
      x: point.x + ((prev.x - point.x) * radius) / incoming,
      y: point.y + ((prev.y - point.y) * radius) / incoming,
    };
    const b = {
      x: point.x + ((next.x - point.x) * radius) / outgoing,
      y: point.y + ((next.y - point.y) * radius) / outgoing,
    };
    result += ` L ${a.x} ${a.y} Q ${point.x} ${point.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return `${result} L ${last.x} ${last.y}`;
}

function midpoint(points: Point[]): Point {
  const lengths = points
    .slice(1)
    .map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
  let remaining = lengths.reduce((total, length) => total + length, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 0;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    remaining -= lengths[i];
  }
  return points[0];
}

/** Character-based wrapping also works for Chinese text without whitespace. */
function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    let width = 0;
    for (const character of Array.from(paragraph)) {
      const charWidth = /\s/.test(character)
        ? fontSize * 0.32
        : /[\u0000-\u007f]/.test(character)
          ? fontSize * 0.58
          : fontSize;
      if (line && width + charWidth > maxWidth) {
        lines.push(line);
        line = '';
        width = 0;
      }
      line += character;
      width += charWidth;
    }
    lines.push(line);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${Array.from(lines[maxLines - 1])
      .slice(0, -1)
      .join('')}…`;
  }
  return lines;
}

function textSvg(
  label: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  options: { fill?: string; fontSize?: number; weight?: number; align?: 'middle' | 'start' } = {},
): string {
  const fontSize = options.fontSize ?? 14;
  const lineHeight = fontSize * 1.5;
  const lines = wrapText(
    label,
    Math.max(16, maxWidth),
    fontSize,
    Math.max(1, Math.floor(maxHeight / lineHeight)),
  );
  const baseline = y - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
  return `<text x="${x}" text-anchor="${options.align ?? 'middle'}" fill="${options.fill ?? '#303348'}" font-size="${fontSize}" font-weight="${options.weight ?? 500}">${lines.map((line, i) => `<tspan x="${x}" y="${baseline + i * lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

function renderNode(layout: LayoutNode): string {
  const { node, x, y, width: w, height: h } = layout;
  const kind = node.data.kind;
  const tone = color(node.data.color);
  const label = String(node.data.label ?? '');
  let shape = '';
  if (kind === 'decision') {
    shape = `<path d="M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z" fill="#fff" stroke="${tone}" stroke-width="1.8" stroke-linejoin="round"/>`;
  } else if (kind === 'note') {
    shape = `<rect width="${w}" height="${h}" rx="3" fill="#fff"/><rect width="${w}" height="${h}" rx="3" fill="${tone}" fill-opacity="0.16"/>`;
  } else if (kind !== 'text') {
    shape = `<rect width="${w}" height="${h}" rx="${kind === 'topic' ? 15 : 10}" fill="#fff" stroke="${tone}" stroke-width="1.6"/><rect width="${w}" height="${h}" rx="${kind === 'topic' ? 15 : 10}" fill="${tone}" fill-opacity="${kind === 'topic' ? '0.11' : '0.04'}"/>`;
  }
  const description = typeof node.data.description === 'string' ? node.data.description : '';
  const labelY = h / 2 - (description ? 9 : 0);
  const textWidth = kind === 'decision' ? w * 0.56 : w - 28;
  const textHeight = (kind === 'decision' ? h * 0.62 : h - 14) - (description ? 20 : 0);
  const content = textSvg(label, w / 2, labelY, textWidth, textHeight, {
    fontSize: kind === 'decision' ? 13 : kind === 'text' ? 17 : 14,
    weight: kind === 'note' ? 400 : 550,
    fill: ['topic', 'text', 'decision'].includes(kind) ? tone : '#5e6277',
  });
  const subtitle = description
    ? textSvg(description, w / 2, h / 2 + 14, textWidth, 16, {
        fontSize: 10,
        weight: 400,
        fill: '#979baa',
      })
    : '';
  return `<g transform="translate(${x} ${y})"><title>${escapeXml(label)}${description ? ` — ${escapeXml(description)}` : ''}</title>${shape}${content}${subtitle}</g>`;
}

/** An entirely self-contained SVG: no remote fonts, images, or DOM capture. */
export function exportSvg(board: Board): string {
  const nodes = board.nodes.filter((node) => !node.hidden).map(nodeLayout);
  const byId = new Map(nodes.map((node) => [node.node.id, node]));
  const arrows: string[] = [];
  const edgePaths: string[] = [];
  const edgePoints: Point[] = [];
  for (const [index, edge] of board.edges.entries()) {
    if (edge.hidden) continue;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const defaultSource: Side = source.x <= target.x ? 'right' : 'left';
    const defaultTarget: Side = source.x <= target.x ? 'left' : 'right';
    const points = route(
      source,
      target,
      side(edge.sourceHandle, defaultSource),
      side(edge.targetHandle, defaultTarget),
    );
    edgePoints.push(...points);
    const stroke = color(edge.style?.stroke, color(target.node.data.color));
    const thickness = Math.max(1, Math.min(6, finite(edge.style?.strokeWidth, 1.8)));
    arrows.push(
      `<marker id="arrow-${index}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`,
    );
    let path = `<path d="${roundedPath(points)}" fill="none" stroke="${stroke}" stroke-width="${thickness}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow-${index})"/>`;
    const label =
      typeof edge.label === 'string' || typeof edge.label === 'number' ? String(edge.label) : '';
    if (label) {
      const at = midpoint(points);
      const width = Math.min(200, Math.max(32, Array.from(label).length * 12 + 20));
      edgePoints.push({ x: at.x - width / 2, y: at.y - 13 }, { x: at.x + width / 2, y: at.y + 13 });
      path += `<rect x="${at.x - width / 2}" y="${at.y - 13}" width="${width}" height="26" rx="6" fill="#f8f9fc"/>${textSvg(label, at.x, at.y, width - 12, 22, { fontSize: 12, fill: '#74798c' })}`;
    }
    edgePaths.push(path);
  }
  const minX = nodes.length
    ? Math.min(...nodes.map((node) => node.x), ...edgePoints.map((point) => point.x))
    : 0;
  const minY = nodes.length
    ? Math.min(...nodes.map((node) => node.y), ...edgePoints.map((point) => point.y))
    : 0;
  const maxX = Math.max(
    ...nodes.map((node) => node.x + node.width),
    ...edgePoints.map((point) => point.x),
    minX + 320,
  );
  const maxY = Math.max(
    ...nodes.map((node) => node.y + node.height),
    ...edgePoints.map((point) => point.y),
    minY + 180,
  );
  const width = Math.ceil(Math.max(640, maxX - minX + 112));
  const height = Math.ceil(maxY - minY + 184);
  const title = escapeXml(board.name || '未命名画板');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="board-title"><title id="board-title">${title}</title><defs>${arrows.join('')}</defs><rect width="${width}" height="${height}" fill="#f8f9fc"/><g font-family="${escapeXml(FONT)}">${textSvg(board.name || '未命名画板', 56, 41, width - 112, 32, { fontSize: 21, weight: 700, fill: '#292d42', align: 'start' })}<text x="56" y="71" fill="#9297a9" font-size="11">${board.kind === 'mindmap' ? '思维导图' : '流程图'}</text><g transform="translate(${56 - minX} ${104 - minY})">${edgePaths.join('')}${nodes.map(renderNode).join('')}</g><line x1="56" y1="${height - 43}" x2="${width - 56}" y2="${height - 43}" stroke="#e7e9f1"/><text x="56" y="${height - 22}" fill="#989cae" font-size="10">知图 · 让想法清晰可见</text></g></svg>`;
}

/** Rasterize the same local SVG, retaining the diagram's aspect ratio. */
export async function exportPng(board: Board): Promise<Blob> {
  const svg = exportSvg(board);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('无法生成图片，请尝试导出 SVG。'));
      img.src = url;
    });
    // Limit allocation while rendering normal diagrams at double resolution.
    const scale = Math.min(
      2,
      16384 / img.naturalWidth,
      16384 / img.naturalHeight,
      Math.sqrt(32_000_000 / (img.naturalWidth * img.naturalHeight)),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前环境无法导出 PNG，请尝试导出 SVG。');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('图片导出失败，请尝试导出 SVG。'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(''));
}

/** Save through the native file dialog on Windows, or the browser download UI. */
export async function downloadFile(
  name: string,
  content: string | Blob,
  mime = 'application/octet-stream',
): Promise<boolean> {
  const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '知图导出';
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  if (blob.size > 64 * 1024 * 1024) throw new Error('导出文件超过 64 MB，请拆分画板后重试。');
  if (window.desktop?.saveFile) {
    const extension = safeName.split('.').pop()?.toLowerCase();
    const filterNames: Record<string, string> = {
      png: 'PNG 图片',
      svg: 'SVG 矢量图',
      json: '知图画板',
      zhitu: '知图画板',
    };
    const result = await window.desktop.saveFile({
      name: safeName,
      content:
        typeof content === 'string' ? content : base64(new Uint8Array(await content.arrayBuffer())),
      encoding: typeof content === 'string' ? 'utf8' : 'base64',
      filters:
        extension && filterNames[extension]
          ? [{ name: filterNames[extension], extensions: [extension] }]
          : undefined,
    });
    return result.saved;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Download streams may consume the object URL after the click returns.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return true;
}

import { describe, expect, it, vi } from 'vitest';
import { createBoard, createDemoBoards, MAX_FILE_BYTES } from './model';
import { loadWorkspace, STORAGE_KEY } from './storage';

function memoryStorage(raw: string | null) {
  const entries = new Map<string, string>(raw === null ? [] : [[STORAGE_KEY, raw]]);
  return {
    entries,
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
  };
}

describe('workspace recovery', () => {
  it('returns examples without writing storage when no saved workspace exists', () => {
    const storage = memoryStorage(null);
    const result = loadWorkspace(storage);
    expect(result.boards).toHaveLength(2);
    expect(result.activeId).toBe(result.boards[0].id);
    expect(result.warning).toBeUndefined();
    expect(result.blocked).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps valid document IDs, content, timestamps, and the active board without rewriting', () => {
    const boards = createDemoBoards();
    boards[0].updatedAt = 123456;
    const storage = memoryStorage(JSON.stringify({ boards, activeId: boards[1].id }));
    const result = loadWorkspace(storage);
    expect(result.boards.map((board) => board.id)).toEqual(boards.map((board) => board.id));
    expect(result.boards.map((board) => board.nodes.map((node) => node.data))).toEqual(
      boards.map((board) => board.nodes.map((node) => node.data)),
    );
    expect(result.boards[0].updatedAt).toBe(123456);
    expect(result.activeId).toBe(boards[1].id);
    expect(result.warning).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('preserves a valid saved board larger than the separate import-file limit', () => {
    const board = createBoard('mindmap');
    const original = board.nodes[0];
    board.nodes = Array.from({ length: 500 }, (_, index) => ({
      ...original,
      id: `node-${index}`,
      data: { ...original.data, description: '文'.repeat(1600) },
    }));
    const raw = JSON.stringify({ boards: [board], activeId: board.id });
    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(MAX_FILE_BYTES);
    const storage = memoryStorage(raw);
    const result = loadWorkspace(storage);
    expect(result.boards).toHaveLength(1);
    expect(result.boards[0].id).toBe(board.id);
    expect(result.boards[0].nodes.map((item) => item.data)).toEqual(
      board.nodes.map((item) => item.data),
    );
    expect(result.warning).toBeUndefined();
    expect(result.blocked).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('blocks automatic saving if getItem fails, without attempting a write', () => {
    const storage = memoryStorage(null);
    storage.getItem.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const result = loadWorkspace(storage);
    expect(result.blocked).toBe(true);
    expect(result.warning).toContain('无法读取');
    expect(result.boards).toHaveLength(2);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('backs up the exact raw data and preserves good boards when one document is corrupt', () => {
    const boards = createDemoBoards();
    const broken = structuredClone(boards[0]);
    broken.nodes[0].data.color = 'invalid-color';
    const raw = JSON.stringify({ boards: [boards[0], broken, boards[1]], activeId: boards[1].id });
    const storage = memoryStorage(raw);
    const result = loadWorkspace(storage);
    expect(result.boards.map((board) => board.id)).toEqual(boards.map((board) => board.id));
    expect(result.activeId).toBe(boards[1].id);
    expect(result.blocked).not.toBe(true);
    expect(result.warning).toContain('恢复 2 个有效画布');
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^zhitu\.workspace\.v1\.recovery\.\d+$/),
      raw,
    );
    expect(storage.entries.get(STORAGE_KEY)).toBe(raw);
  });

  it.each(['{broken', 'null', '[]', '{}', '{"boards":[]}'])(
    'backs up fully damaged content %s before returning examples',
    (raw) => {
      const storage = memoryStorage(raw);
      const result = loadWorkspace(storage);
      expect(result.boards).toHaveLength(2);
      expect(result.warning).toContain('恢复 0 个有效画布');
      expect(result.warning).toContain('示例画布');
      expect(result.blocked).not.toBe(true);
      expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(`${STORAGE_KEY}.recovery.`),
        raw,
      );
      expect(storage.entries.get(STORAGE_KEY)).toBe(raw);
    },
  );

  it('rejects damaged persisted node types instead of normalizing away corruption', () => {
    const [board] = createDemoBoards();
    const damaged = {
      ...board,
      nodes: board.nodes.map((node) => ({ ...node, type: 'unknown-node' })),
    };
    const storage = memoryStorage(JSON.stringify({ boards: [damaged], activeId: board.id }));
    const result = loadWorkspace(storage);
    expect(result.warning).toContain('恢复 0 个有效画布');
    expect(result.boards.every((item) => item.id !== board.id)).toBe(true);
  });

  it('safely assigns a new ID to duplicate boards and preserves both documents', () => {
    const [board] = createDemoBoards();
    const second = { ...board, name: '重名标识的另一个画布' };
    const storage = memoryStorage(JSON.stringify({ boards: [board, second], activeId: board.id }));
    const result = loadWorkspace(storage);
    expect(result.boards).toHaveLength(2);
    expect(result.boards[0].id).toBe(board.id);
    expect(result.boards[1].id).not.toBe(board.id);
    expect(result.boards[1].name).toBe(second.name);
    expect(result.activeId).toBe(board.id);
    expect(new Set(result.boards.map((item) => item.id)).size).toBe(2);
    expect(result.warning).toContain('已备份');
  });

  it('blocks saving when a recovery backup fails because storage is full', () => {
    const [board] = createDemoBoards();
    const raw = JSON.stringify({ boards: [board, { id: 'bad' }], activeId: board.id });
    const storage = memoryStorage(raw);
    storage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const result = loadWorkspace(storage);
    expect(result.boards).toHaveLength(1);
    expect(result.boards[0].id).toBe(board.id);
    expect(result.blocked).toBe(true);
    expect(result.warning).toContain('备份失败');
    expect(storage.entries.get(STORAGE_KEY)).toBe(raw);
    expect(storage.setItem.mock.calls.every(([key]) => key !== STORAGE_KEY)).toBe(true);
  });

  it('falls back to a valid active board and keeps a backup when the previous active ID is missing', () => {
    const boards = createDemoBoards();
    const storage = memoryStorage(JSON.stringify({ boards, activeId: 'missing-board' }));
    const result = loadWorkspace(storage);
    expect(result.activeId).toBe(boards[0].id);
    expect(result.warning).toContain('已备份');
  });

  it('preserves the first 100 valid boards and backs up an excessive board list', () => {
    const boards = Array.from({ length: 101 }, (_, index) =>
      createBoard('mindmap', `画布 ${index + 1}`),
    );
    const storage = memoryStorage(JSON.stringify({ boards, activeId: boards[0].id }));
    const result = loadWorkspace(storage);
    expect(result.boards).toHaveLength(100);
    expect(result.boards.map((board) => board.id)).toEqual(
      boards.slice(0, 100).map((board) => board.id),
    );
    expect(result.warning).toContain('恢复 100 个有效画布');
    expect(storage.setItem).toHaveBeenCalledOnce();
  });
});

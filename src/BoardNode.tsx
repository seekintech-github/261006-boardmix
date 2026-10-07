import { createContext, useContext, useEffect, useState, type CSSProperties } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { type BoardNode as BoardNodeType } from './model';

export const NodeEditorContext = createContext<(id: string, label: string) => void>(() => {});
export const NodeResizeContext = createContext<() => void>(() => {});

export function BoardNode({ id, data, selected }: NodeProps<BoardNodeType>) {
  const setLabel = useContext(NodeEditorContext);
  const checkpoint = useContext(NodeResizeContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  useEffect(() => setDraft(data.label), [data.label]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== data.label) setLabel(id, draft.trim());
    else setDraft(data.label);
  };
  return (
    <div
      className={`board-node kind-${data.kind} ${selected ? 'is-selected' : ''}`}
      style={{ '--node-color': data.color } as CSSProperties}
      onDoubleClick={() => setEditing(true)}
    >
      <NodeResizer
        isVisible={selected}
        color={data.color}
        minWidth={100}
        minHeight={48}
        maxWidth={2000}
        maxHeight={2000}
        onResizeStart={checkpoint}
      />
      <Handle id="left" type="target" position={Position.Left} />
      <Handle id="top" type="target" position={Position.Top} />
      <div className="node-surface" />
      <div className="node-content">
        {editing ? (
          <textarea
            className="node-editor nodrag nowheel"
            aria-label="编辑节点文字"
            value={draft}
            maxLength={500}
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                commit();
              }
              if (event.key === 'Escape') {
                setDraft(data.label);
                setEditing(false);
              }
            }}
          />
        ) : (
          <>
            <span className="node-label">{data.label}</span>
            {data.description && <span className="node-description">{data.description}</span>}
          </>
        )}
      </div>
      <Handle id="right" type="source" position={Position.Right} />
      <Handle id="bottom" type="source" position={Position.Bottom} />
    </div>
  );
}

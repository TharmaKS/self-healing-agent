import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play, Square, Table as TableIcon, Globe, Zap, XCircle } from 'lucide-react';

const KIND_STYLE: Record<
  string,
  { label: string; accent: string; ring: string; Icon: typeof Play }
> = {
  START: { label: 'Start', accent: 'text-emerald-300', ring: 'border-emerald-500/50', Icon: Play },
  END: { label: 'End', accent: 'text-slate-300', ring: 'border-slate-500/60', Icon: Square },
  CLOSE_BROWSER: { label: 'Close browser', accent: 'text-rose-300', ring: 'border-rose-500/50', Icon: XCircle },
  TABLE_PROCESS: { label: 'Table', accent: 'text-amber-300', ring: 'border-amber-500/50', Icon: TableIcon },
  CAPABILITY: { label: 'Capability', accent: 'text-indigo-300', ring: 'border-indigo-500/50', Icon: Zap },
  CONDITION: { label: 'Condition', accent: 'text-sky-300', ring: 'border-sky-500/50', Icon: Globe },
};

export const CustomWorkflowNode: React.FC<NodeProps> = ({ data, type }) => {
  const kind = String(type || (data as { kind?: string }).kind || 'CAPABILITY');
  const style = KIND_STYLE[kind] || KIND_STYLE.CAPABILITY;
  const Icon = style.Icon;
  const label = String((data as { label?: string }).label || style.label);
  const description = String((data as { description?: string }).description || '');
  const isStart = kind === 'START';
  const isEnd = kind === 'END';

  return (
    <div
      className={`min-w-[200px] max-w-[240px] rounded-xl border ${style.ring} bg-slate-900/95 shadow-lg shadow-black/40 px-3 py-2.5 text-slate-100`}
    >
      {!isStart && (
        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-indigo-400 !border-slate-900" />
      )}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`text-[9px] font-bold uppercase tracking-widest ${style.accent} flex items-center gap-1`}>
          <Icon className="w-3 h-3" />
          {style.label}
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      </div>
      <div className="text-xs font-semibold text-white leading-tight">{label}</div>
      {description ? <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{description}</div> : null}
      {!isEnd && (
        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-indigo-400 !border-slate-900" />
      )}
    </div>
  );
};

export const studioNodeTypes = {
  START: CustomWorkflowNode,
  END: CustomWorkflowNode,
  CAPABILITY: CustomWorkflowNode,
  TABLE_PROCESS: CustomWorkflowNode,
  CLOSE_BROWSER: CustomWorkflowNode,
  CONDITION: CustomWorkflowNode,
  LOOP: CustomWorkflowNode,
  APPROVAL: CustomWorkflowNode,
};

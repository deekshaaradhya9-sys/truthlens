import React, { useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { GitFork, Info } from 'lucide-react';
import type { GraphEdgeItem, GraphNodeItem } from '../types/forensics.ts';
import { useI18n } from '../i18n/translations.ts';

interface ContradictionGraphProps {
  nodes: GraphNodeItem[];
  edges: GraphEdgeItem[];
}

interface ForceNode {
  id: string;
  label: string;
  nodeType: string;
  modality: string;
  details: string;
  x?: number;
  y?: number;
}

interface ForceLink {
  id: string;
  source: string | ForceNode;
  target: string | ForceNode;
  relation: 'corroborates' | 'contradicts' | 'inconclusive';
  label: string;
  explanation: string;
  confidenceRange: string;
  limitation: string;
}

export const ContradictionGraph: React.FC<ContradictionGraphProps> = ({ nodes, edges }) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 720, height: 420 });
  const [selectedEdge, setSelectedEdge] = useState<ForceLink | null>(null);
  const [selectedNode, setSelectedNode] = useState<ForceNode | null>(null);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(300, Math.floor(rect.width)),
          height: 420,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const graphData = useMemo(() => {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const safeEdges = Array.isArray(edges) ? edges : [];
    const nodeIds = new Set(safeNodes.map((n) => n.nodeKey));
    const fNodes: ForceNode[] = safeNodes.map((n) => ({
      id: n.nodeKey,
      label: n.label,
      nodeType: n.nodeType,
      modality: n.modality,
      details: n.details,
    }));

    const fLinks: ForceLink[] = safeEdges
      .filter((e) => nodeIds.has(e.sourceKey) && nodeIds.has(e.targetKey))
      .map((e) => ({
        id: e.id,
        source: e.sourceKey,
        target: e.targetKey,
        relation: e.relation,
        label: e.label,
        explanation: e.explanation,
        confidenceRange: e.confidenceRange,
        limitation: e.limitation,
      }));

    return { nodes: fNodes, links: fLinks };
  }, [nodes, edges]);

  const edgeColor = (rel: string) => {
    if (rel === 'corroborates') return '#10B981';
    if (rel === 'contradicts') return '#EF4444';
    return '#F59E0B';
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-8 glass-panel rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">{t.navGraph}</h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-emerald-400">{t.graphCorroborates}</span>
            <span className="text-rose-400">{t.graphContradicts}</span>
            <span className="text-amber-400">{t.graphInconclusive}</span>
          </div>
        </div>

        <div ref={containerRef} className="relative w-full h-[420px] bg-[#050814]">
          {graphData.nodes.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 px-6 text-center">
              {t.findingsEmpty}
            </div>
          ) : (
            <ForceGraph2D
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              backgroundColor="#050814"
              linkDirectionalArrowLength={6}
              linkDirectionalArrowRelPos={0.85}
              linkWidth={2.6}
              linkColor={(link) => edgeColor((link as ForceLink).relation)}
              onLinkClick={(link) => {
                setSelectedNode(null);
                setSelectedEdge(link as ForceLink);
              }}
              onNodeClick={(node) => {
                setSelectedEdge(null);
                setSelectedNode(node as ForceNode);
              }}
              nodeCanvasObject={(nodeObj, ctx, globalScale) => {
                const node = nodeObj as ForceNode;
                const x = node.x ?? 0;
                const y = node.y ?? 0;
                const fontSize = Math.max(10, 12 / globalScale);

                const fill =
                  node.nodeType === 'evidence'
                    ? '#06B6D4'
                    : node.nodeType === 'claim'
                      ? '#8B5CF6'
                      : '#94A3B8';

                ctx.beginPath();
                ctx.arc(x, y, 7, 0, 2 * Math.PI, false);
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = '#050814';
                ctx.stroke();

                ctx.font = `500 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
                const textWidth = ctx.measureText(node.label).width;
                const padX = 6;
                const boxH = fontSize + 6;
                ctx.fillStyle = 'rgba(11, 17, 30, 0.9)';
                ctx.fillRect(x - textWidth / 2 - padX, y + 10, textWidth + padX * 2, boxH);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
                ctx.lineWidth = 0.8;
                ctx.strokeRect(x - textWidth / 2 - padX, y + 10, textWidth + padX * 2, boxH);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#E2E8F0';
                ctx.fillText(node.label, x, y + 10 + boxH / 2);
              }}
            />
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-800/90 text-xs text-slate-400">
          {t.graphHint}
        </div>
      </div>

      {/* Inspector Drawer */}
      <div className="lg:col-span-4 glass-panel rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Info className="w-4 h-4 text-violet-400" />
          <span>{t.graphInspectTitle}</span>
        </div>

        {selectedEdge ? (
          <div className="space-y-3 text-xs">
            <div
              className={`font-mono font-semibold ${
                selectedEdge.relation === 'contradicts'
                  ? 'text-rose-400'
                  : selectedEdge.relation === 'corroborates'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
              }`}
            >
              {selectedEdge.relation.toUpperCase()} · {selectedEdge.label}
            </div>
            <div className="text-slate-200 leading-relaxed">{selectedEdge.explanation}</div>
            <div className="pt-2 border-t border-slate-800 space-y-1.5 font-mono">
              <div className="text-slate-400">
                Confidence: <span className="text-cyan-300">{selectedEdge.confidenceRange}</span>
              </div>
              <div className="text-slate-400 font-sans">
                <span className="text-slate-500 font-mono">{t.limitationLabel}: </span>
                {selectedEdge.limitation}
              </div>
            </div>
          </div>
        ) : selectedNode ? (
          <div className="space-y-3 text-xs">
            <div className="font-mono text-cyan-300 uppercase">
              {selectedNode.nodeType} · {selectedNode.modality}
            </div>
            <div className="text-sm font-semibold text-white">{selectedNode.label}</div>
            <div className="text-slate-300 leading-relaxed">{selectedNode.details}</div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">{t.graphInspectPrompt}</p>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {graphData.links.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setSelectedEdge(link)}
                  className="w-full text-left p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 hover:border-cyan-500/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-mono font-semibold ${
                        link.relation === 'contradicts'
                          ? 'text-rose-400'
                          : link.relation === 'corroborates'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {link.relation.toUpperCase()}
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums">{link.confidenceRange}</span>
                  </div>
                  <div className="text-xs text-slate-200 mt-1">{link.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

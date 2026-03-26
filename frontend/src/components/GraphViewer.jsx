import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  useReactFlow,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import dagre from 'dagre';
import * as d3 from 'd3-force';
import { useTheme } from '../contexts/ThemeContext';

const API_URL = import.meta.env.VITE_API_URL;

const nodeColors = {
  Customer: '#3b82f6',
  Order: '#8b5cf6',
  Delivery: '#f59e0b',
  Invoice: '#ef4444',
  Payment: '#22c55e',
  Product: '#ec4899',
  Address: '#64748b',
};

// ─── Dagre Layout ─────────────────────────────────────────────────────────────
const getDagreLayout = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  const nodeWidth = 160;
  const nodeHeight = 60;
  dagreGraph.setGraph({ rankdir: direction, nodesep: 70, ranksep: 140 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      targetPosition: direction === 'LR' ? 'left' : 'top',
      sourcePosition: direction === 'LR' ? 'right' : 'bottom',
    };
  });
};

// ─── Force Layout ─────────────────────────────────────────────────────────────
const getForceLayout = (nodes, edges) => {
  const d3Nodes = nodes.map((n) => ({
    ...n,
    x: (Math.random() - 0.5) * 1000,
    y: (Math.random() - 0.5) * 1000,
  }));
  
  const d3Links = edges.map(e => ({ source: e.source, target: e.target }));

  const simulation = d3.forceSimulation(d3Nodes)
    .force('charge', d3.forceManyBody().strength(-2000))
    .force('link', d3.forceLink(d3Links).id(d => d.id).distance(250))
    .force('center', d3.forceCenter(0, 0))
    .force('collision', d3.forceCollide().radius(150))
    .stop();

  for (let i = 0; i < 300; i++) simulation.tick();

  return d3Nodes.map(node => ({
    ...nodes.find(n => n.id === node.id),
    position: { x: node.x, y: node.y }
  }));
};

// ─── Graph Component ──────────────────────────────────────────────────────────
function GraphContent({ highlightNodes = [], onReset }) {
  const { isDark } = useTheme();
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isQueryView, setIsQueryView] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  const fetchGraphData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/graph`);
      const nodeData = response.data.nodes || [];
      const edgeData = response.data.edges || [];

      const rfEdges = edgeData.map((edge) => ({
        id: edge._id,
        source: String(edge.source),
        target: String(edge.target),
        label: edge.relationship.replace(/_/g, ' '),
        animated: true,
        style: { stroke: isDark ? '#475569' : '#94a3b8', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#475569' : '#94a3b8' },
      }));

      const rfNodes = nodeData.map((node) => ({
        id: String(node.id),
        data: { label: `${node.type}\n${node.id}`, originalData: node },
        style: {
          background: nodeColors[node.type] || '#fff',
          color: '#fff',
          borderRadius: '12px',
          padding: '12px',
          fontWeight: 'bold',
          width: 160,
          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
        },
      }));

      setAllNodes(rfNodes);
      setAllEdges(rfEdges);

      const layouted = getDagreLayout(rfNodes, rfEdges, 'LR');
      setNodes(layouted);
      setEdges(rfEdges);
      setTimeout(() => fitView({ duration: 800 }), 100);
    } catch (err) {
      console.error('Failed to load graph data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, [isDark]);

  // ─── Robust Highlighting & Zoom ─────────────────────────────────────────────
  useEffect(() => {
    if (allNodes.length === 0) return;

    if (highlightNodes && highlightNodes.length > 0) {
      setIsQueryView(true);
      
      // Universal ID extraction: handles objects, strings, numbers
      const highlightIds = new Set(highlightNodes.map(n => {
        if (typeof n === 'string' || typeof n === 'number') return String(n);
        return String(n.id || n._id || n.metadata?.sapId || '');
      }).filter(id => id !== ''));
      
      const resultNodes = allNodes
        .filter(n => highlightIds.has(n.id))
        .map(n => ({ ...n })); 

      const resultEdges = allEdges.filter(e => highlightIds.has(e.source) && highlightIds.has(e.target));

      if (resultNodes.length > 0) {
        const scatteredNodes = getForceLayout(resultNodes, resultEdges);
        setNodes(scatteredNodes);
        setEdges(resultEdges);
        // Automatic Zoom to results
        setTimeout(() => fitView({ nodes: scatteredNodes, duration: 800, padding: 0.2 }), 50);
      } else {
        console.warn('No matching nodes found for highlight IDs:', Array.from(highlightIds));
      }
    } else if (isQueryView) {
      setIsQueryView(false);
      const layouted = getDagreLayout(allNodes, allEdges, 'LR');
      setNodes(layouted);
      setEdges(allEdges);
      setTimeout(() => fitView({ duration: 800 }), 50);
    }
  }, [highlightNodes, allNodes, allEdges, fitView]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node.data.originalData);
  }, []);
  
  const resetToGlobal = () => {
    if (onReset) onReset();
    setIsQueryView(false);
    const layouted = getDagreLayout(allNodes, allEdges, 'LR');
    setNodes(layouted);
    setEdges(allEdges);
    setTimeout(() => fitView({ duration: 800 }), 50);
  };

  if (loading) return null;

  return (
    <div className="flex flex-1 h-full w-full relative">
      <div className="flex-1 h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodesDraggable={true} 
          nodesConnectable={false}
          className={isDark ? "dark" : ""}
        >
          <Background color={isDark ? "#0f172a" : "#f1f5f9"} gap={16} variant="dots" />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      {isQueryView && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
          <button 
            onClick={resetToGlobal}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-full shadow-2xl hover:bg-indigo-700 transition-all flex items-center gap-2 text-sm font-bold border-2 border-white/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Restore Full Graph
          </button>
        </div>
      )}

      {selectedNode && (
        <div className="w-80 h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl border-l border-slate-200 dark:border-slate-800 absolute right-0 top-0 z-30 animate-in slide-in-from-right">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Details</h2>
            <button onClick={() => setSelectedNode(null)} className="text-slate-400 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <div className="p-6">
            <span className="px-3 py-1 rounded-full text-[10px] font-black text-white uppercase" style={{ backgroundColor: nodeColors[selectedNode.type] }}>{selectedNode.type}</span>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white mt-4">{selectedNode.id}</h1>
            <div className="space-y-4 mt-6">
              {selectedNode.metadata && Object.entries(selectedNode.metadata).map(([k, v]) => (
                <div key={k}>
                  <div className="text-[9px] text-slate-400 font-black uppercase">{k}</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{String(v)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GraphViewer(props) {
  return (
    <ReactFlowProvider>
      <GraphContent {...props} />
    </ReactFlowProvider>
  );
}

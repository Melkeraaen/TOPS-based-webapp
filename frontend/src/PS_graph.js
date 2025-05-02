import React, { useEffect, useRef, useState } from 'react';
import { 
  Box,
  Typography,
  Paper
} from '@mui/material';
import ForceGraph2D from 'react-force-graph-2d';

// Helper function to format complex numbers
const formatComplex = (value) => {
  if (value && typeof value === 'object' && 'real' in value && 'imag' in value) {
    const real = value.real.toFixed(3);
    const imag = Math.abs(value.imag).toFixed(3);
    const sign = value.imag >= 0 ? '+' : '-';
    return `${real} ${sign} ${imag}j`;
  }
  return typeof value === 'number' ? value.toFixed(3) : '0.000';
};

// Add getNodeColor function
const getNodeColor = (node, busPower, selectionMode, hovered = false, selectedComponent = null) => {
  if (selectedComponent && selectedComponent.id === node.id) {
    return node.type === 'generator' ? '#2ecc71' : 
           node.type === 'load' ? '#3498db' :
           node.type === 'shunt' ? '#9b59b6' :
           node.type === 'transformer' ? '#e74c3c' :
           node.id && node.id.startsWith('B') ? '#f1c40f' : '#f1c40f';
  }
  if (selectionMode && hovered) {
    return '#ff0000';
  }
  if (node.type === 'generator') return '#2ecc71';
  if (node.type === 'load') return '#3498db';
  if (node.type === 'shunt') return '#9b59b6';
  if (node.type === 'transformer') return '#e74c3c';
  if (node.id && node.id.startsWith('B')) return '#f1c40f';
  return '#f1c40f';
};

const getPowerFlowInfo = (link, powerFlows) => {
  if (!powerFlows || !powerFlows[link.id]) return null;
  const flow = powerFlows[link.id];
  const magnitude = Math.sqrt(flow.p_from * flow.p_from + flow.q_from * flow.q_from);
  const direction = flow.p_from >= 0 ? 1 : -1;
  return { magnitude, direction };
};

const isSelectable = (node) => {
  if (!node || node.type === 'shunt') return false;
  if (node.id) {
    return ['B', 'G', 'T', 'L'].some(prefix => node.id.startsWith(prefix));
  }
  return false;
};

const isLinkSelectable = () => false;

// Helper to extract transformer ID from a link
const getTransformerIdFromLink = (link) => {
  const ids = [link.source, link.target].map(x => typeof x === 'object' ? x.id : x);
  for (const id of ids) {
    if (typeof id === 'string' && id.startsWith('T')) return id;
  }
  return null;
};

const trafoMap = {
  T1: { busA: 'B1', busB: 'B5' },
  T2: { busA: 'B2', busB: 'B6' },
  T3: { busA: 'B3', busB: 'B11' },
  T4: { busA: 'B4', busB: 'B10' },
};

const PS_graph = ({ 
  graphRef,
  networkData, 
  busPower, 
  powerFlows, 
  initialNetworkData,
  graphWidth,
  getImprovedLineFlowDirection,
  parameters,
  selectionMode,
  onComponentSelect,
  selectedComponent,
  monitoredComponents
}) => {
  const [hoveredNode, setHoveredNode] = useState(null);
  const [initialZoomDone, setInitialZoomDone] = useState(false);
  const forceGraphRef = useRef();

  const selectedNode = selectedComponent?.type !== 'line' ? 
    networkData.nodes.find(node => node.id === selectedComponent?.id) : null;

  const isNodeMonitored = (node) => monitoredComponents?.some(comp => comp.id === node.id);
  const isLinkMonitored = (link) => monitoredComponents?.some(comp => comp.id === link.id);

  const processedLinks = networkData.links.map(link => {
    const fromId = typeof link.source === 'object' ? link.source.id : link.source;
    const toId = typeof link.target === 'object' ? link.target.id : link.target;
    const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
    const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
    // Only swap for lines, not transformers
    if (link.type === 'line') {
      const dir = getImprovedLineFlowDirection(fromIdx, toIdx);
      if (dir < 0) {
        return { ...link, source: link.target, target: link.source };
      }
    }
    return link;
  });

  // Cache transformer directions for this render
  const transformerDirections = React.useMemo(() => {
    const out = {};
    Object.entries(trafoMap).forEach(([trafoId, { busA, busB }]) => {
      const idxA = initialNetworkData.nodes.findIndex(n => n.id === busA);
      const idxB = initialNetworkData.nodes.findIndex(n => n.id === busB);
      out[trafoId] = getImprovedLineFlowDirection(idxA, idxB);
    });
    return out;
  }, [initialNetworkData, getImprovedLineFlowDirection, busPower]);

  useEffect(() => {
    if (!forceGraphRef.current) return;
    const fg = forceGraphRef.current;

    if (!initialZoomDone) {
      fg.zoom(1.05); // Set initial zoom level
      setInitialZoomDone(true);
    }

    if (selectionMode) {
      fg.d3Force('charge').strength(-300);
      setTimeout(() => {
        if (fg.d3Force('simulation')) {
          fg.d3Force('simulation').stop();
        }
      }, 500);
    } else {
      fg.d3Force('charge').strength(-100);
      if (fg.d3Force('simulation')) {
        fg.d3Force('simulation').alpha(0.3).restart();
      }
    }
  }, [selectionMode, initialZoomDone]);

  const handleNodeClick = (node) => {
    if (selectionMode && isSelectable(node)) {
      onComponentSelect({
        id: node.id,
        type: node.type || 
              (node.id.startsWith('B') ? 'bus' : 
              node.id.startsWith('G') ? 'generator' : 
              node.id.startsWith('L') ? 'load' : 
              node.id.startsWith('T') ? 'transformer' : 'unknown'),
        label: node.label || node.name || node.id,
        data: node
      });
    }
  };

  const renderSelectionModeHelper = () => {
    if (!selectionMode) return null;
    return (
      <Box sx={{ 
        position: 'absolute', 
        top: 10, 
        left: '50%', 
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: '4px 8px',
        borderRadius: '4px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        zIndex: 100
      }}>
        <Typography variant="body2" color="primary">
          Selection mode active - Click on buses, generators, transformers, or loads
        </Typography>
      </Box>
    );
  };

  return (
    <Paper elevation={2} sx={{ p: 2, bgcolor: 'background.default', height: '600px', width: '100%', mb: 4, position: 'relative' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" sx={{ color: 'primary.main' }}>K2A Power System</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Typography>🟡 Bus</Typography>
          <Typography>⚫ Line</Typography>
          <Typography>🔴 Transformer</Typography>
          <Typography>🟢 Generator</Typography>
          <Typography>🔵 Load</Typography>
          <Typography>🟣 Shunt</Typography>
        </Box>
      </Box>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        width: '100%', 
        height: 'calc(100% - 40px)',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {renderSelectionModeHelper()}
        <div 
          className="graph-container" 
          style={{ 
            width: '100%', 
            height: '100%', 
            position: 'relative',
            cursor: selectionMode ? 'pointer' : 'default'
          }}
        >
          <ForceGraph2D
            ref={(el) => {
              forceGraphRef.current = el;
              if (graphRef) {
                if (typeof graphRef === 'function') {
                  graphRef(el);
                } else {
                  graphRef.current = el;
                }
              }
            }}
            graphData={{ nodes: networkData.nodes, links: processedLinks }}
            nodeLabel={node => {
              if (selectionMode && isSelectable(node)) {
                return `Click to select: ${node.label || node.id}`;
              } else if (selectionMode) {
                return `${node.label || node.id} (not selectable)`;
              }
              return node.label;
            }}
            nodeColor={node => getNodeColor(node, busPower, selectionMode, hoveredNode === node && isSelectable(node), selectedComponent)}
            onNodeHover={node => selectionMode ? setHoveredNode(node) : null}
            onNodeClick={handleNodeClick}
            onLinkHover={null}
            onLinkClick={null}
            cooldownTicks={selectionMode ? 0 : Infinity}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const isSelected = selectedNode && node.id === selectedNode.id;
              const isMonitored = isNodeMonitored(node);
              const radius = (selectionMode && node === hoveredNode && isSelectable(node)) || isSelected ? 14 : 10;

              if (selectionMode && isSelectable(node)) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 2, 0, 2 * Math.PI, false);
                ctx.fillStyle = node === hoveredNode ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.1)';
                ctx.fill();
              }

              if (isMonitored) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 5, 0, 2 * Math.PI, false);
                ctx.strokeStyle = '#ff8800';
                ctx.lineWidth = 4;
                ctx.stroke();
              }

              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = getNodeColor(node, busPower, selectionMode, node === hoveredNode, selectedComponent);
              ctx.fill();
              ctx.strokeStyle = selectionMode && node === hoveredNode && isSelectable(node) ? '#ff0000' : '#333';
              ctx.lineWidth = selectionMode && node === hoveredNode && isSelectable(node) ? 2 : 1;
              ctx.stroke();

              const label = node.label;
              const fontSize = 16 / globalScale;
              ctx.font = `${fontSize}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = selectionMode && node === hoveredNode && isSelectable(node) ? '#cc0000' : '#222';
              ctx.fillText(label, node.x, node.y);
            }}
            linkColor={link => {
              if (isLinkMonitored(link)) return '#ff8800';
              const flowInfo = getPowerFlowInfo(link, powerFlows);
              if (flowInfo) {
                const intensity = Math.min(flowInfo.magnitude / 100, 1);
                return `rgba(255, ${Math.floor(255 * (1 - intensity))}, 0, 1)`;
              }
              return link.type === 'transformer' ? '#e74c3c' : '#95a5a6';
            }}
            linkWidth={link => {
              if (isLinkMonitored(link)) return 5;
              const flowInfo = getPowerFlowInfo(link, powerFlows);
              return flowInfo ? 1 + Math.min(flowInfo.magnitude / 50, 5) : 1;
            }}
            linkDirectionalParticles={link => {
              if (!busPower) return 0;
              if (["generator_connection", "shunt_connection", "load_connection"].includes(link.type)) return 0;
              if (link.type === 'transformer') {
                const trafoId = getTransformerIdFromLink(link);
                if (trafoId && trafoMap[trafoId]) {
                  const { busA, busB } = trafoMap[trafoId];
                  const idxA = initialNetworkData.nodes.findIndex(n => n.id === busA);
                  const idxB = initialNetworkData.nodes.findIndex(n => n.id === busB);
                  const dir = getImprovedLineFlowDirection(idxA, idxB);
                  return dir !== 0 ? 4 : 0;
                }
                return 0;
              }
              // Default for lines
              const fromId = typeof link.source === 'object' ? link.source.id : link.source;
              const toId = typeof link.target === 'object' ? link.target.id : link.target;
              const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
              const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
              const dir = getImprovedLineFlowDirection(fromIdx, toIdx);
              return dir !== 0 ? 4 : 0;
            }}
            linkDirectionalParticleWidth={3}
            linkDirectionalParticleSpeed={link => {
              if (!busPower) return 0;
              if (link.type === 'transformer') {
                const trafoId = getTransformerIdFromLink(link);
                if (trafoId && trafoMap[trafoId]) {
                  const { busA, busB } = trafoMap[trafoId];
                  const idxA = initialNetworkData.nodes.findIndex(n => n.id === busA);
                  const idxB = initialNetworkData.nodes.findIndex(n => n.id === busB);
                  const dir = getImprovedLineFlowDirection(idxA, idxB);
                  return dir > 0 ? 0.01 : dir < 0 ? -0.01 : 0;
                }
                return 0;
              }
              // Default for lines
              const fromId = typeof link.source === 'object' ? link.source.id : link.source;
              const toId = typeof link.target === 'object' ? link.target.id : link.target;
              const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
              const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
              if (fromIdx === -1 || toIdx === -1) return 0;
              const dir = getImprovedLineFlowDirection(fromIdx, toIdx);
              return dir > 0 ? 0.01 : dir < 0 ? -0.01 : 0;
            }}
            linkLabel={link => {
              if (selectionMode && isLinkSelectable(link)) return `Click to select: Line ${link.id}`;
              const flowInfo = getPowerFlowInfo(link, powerFlows);
              if (flowInfo) {
                const flow = powerFlows[link.id];
                return `P: ${flow.p_from.toFixed(2)} MW\nQ: ${flow.q_from.toFixed(2)} MVAr`;
              }
              return '';
            }}
            linkLineDash={link => {
              if (link.type === 'transformer') {
                const trafoIndex = parseInt(link.id.replace('T', '')) - 1;
                const hasChange = parameters.tapChanger.enabled && 
                  parameters.tapChanger.changes.some(
                    change => parseInt(change.transformerId) === trafoIndex && 
                    change.ratioChange !== 1.0
                  );
                return hasChange ? [3, 3] : [];
              }
              return link.dashed ? [5, 5] : [];
            }}
            linkCurvature={link => {
              const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
              const targetId = typeof link.target === 'object' ? link.target.id : link.target;
              const parallelLinks = networkData.links.filter(l => {
                const lSource = typeof l.source === 'object' ? l.source.id : l.source;
                const lTarget = typeof l.target === 'object' ? l.target.id : l.target;
                return (
                  (lSource === sourceId && lTarget === targetId) ||
                  (lSource === targetId && lTarget === sourceId)
                );
              });
              if (parallelLinks.length > 1 && link.type === 'line') {
                const lineNumber = link.id?.split('-').pop();
                return lineNumber === '1' ? 0.2 : -0.2;
              }
              return 0;
            }}
            width={graphWidth}
            height={500}
            backgroundColor="#ffffff"
          />
        </div>
      </Box>
    </Paper>
  );
};

export default PS_graph;

// Power system visualization component using force-directed graph
// Renders the network topology with interactive features and dynamic styling

import React, { useEffect, useRef, useState } from 'react';
import { 
  Box,
  Typography,
  Paper
} from '@mui/material';
import ForceGraph2D from 'react-force-graph-2d';

// Color interpolation utility for visual feedback
// Blends between two hex colors based on a ratio t (0-1)
function interpolateColor(color1, color2, t) {
  const c1 = color1.match(/\w\w/g).map(x => parseInt(x, 16));
  const c2 = color2.match(/\w\w/g).map(x => parseInt(x, 16));
  const c = c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  return `#${c.map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

// Blue: #3498db, Green: #4caf50, Red: #e74c3c
const getNodeColor = (node, busPower, selectionMode, hovered = false, selectedComponent = null, parameters = {}) => {
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
  if (node.type === 'load') {
    // Map L1/L2 to step1/step2
    let step = null;
    if (node.id === 'L1') step = parameters.step1;
    if (node.id === 'L2') step = parameters.step2;
    let change = 0;
    if (step) {
      // Assume base is 0, so change is just g_setp + b_setp
      change = (step.g_setp || 0) + (step.b_setp || 0);
      // Clamp to [-1, 1]
      if (change > 1) change = 1;
      if (change < -1) change = -1;
    }
    // Blue (0), red (+1), green (-1)
    if (change === 0) return '#3498db';
    if (change > 0) return interpolateColor('#3498db', '#e74c3c', change); // blue to red
    if (change < 0) return interpolateColor('#3498db', '#4caf50', -change); // blue to green
    return '#3498db';
  }
  if (node.type === 'generator') return '#2ecc71';
  if (node.type === 'shunt') return '#9b59b6';
  if (node.type === 'transformer') return '#e74c3c';
  if (node.id && node.id.startsWith('B')) return '#f1c40f';
  return '#f1c40f';
};

// Power flow calculation for transmission lines
// Returns magnitude and direction of power flow
const getPowerFlowInfo = (link, powerFlows) => {
  if (!powerFlows || !powerFlows[link.id]) return null;
  const flow = powerFlows[link.id];
  const magnitude = Math.sqrt(flow.p_from * flow.p_from + flow.q_from * flow.q_from);
  const direction = flow.p_from >= 0 ? 1 : -1;
  return { magnitude, direction };
};

// Component selection validation
// Determines if a node can be selected based on its type and ID
const isSelectable = (node) => {
  if (!node || node.type === 'shunt') return false;
  if (node.id) {
    return ['B', 'G', 'T', 'L'].some(prefix => node.id.startsWith(prefix));
  }
  return false;
};

// Main graph component with interactive features
// Handles visualization, selection, and monitoring of power system components
const PS_graph = ({
  graphRef,
  networkName,
  networkData,
  busPower,
  powerFlows,
  initialNetworkData,
  graphWidth,
  getLineFlowDirectionSimple,
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
  
  // Get the bus ID selected for short circuit (ensure it's a string like 'B8')
  let shortCircuitBusId = parameters.shortCircuit?.busId || null;
  if (typeof shortCircuitBusId === 'number') {
    shortCircuitBusId = `B${shortCircuitBusId}`;
  }

  const processedLinks = networkData.links.map(link => {
    const fromId = typeof link.source === 'object' ? link.source.id : link.source;
    const toId = typeof link.target === 'object' ? link.target.id : link.target;
    const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
    const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
    const dir = getLineFlowDirectionSimple(fromIdx, toIdx);
    if (dir < 0) {
      return { ...link, source: link.target, target: link.source };
    }
    return link;
  });

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
        <Typography variant="h5" sx={{ color: 'primary.main' }}>{networkName?.toUpperCase()} Power System</Typography>
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
            nodeColor={node => getNodeColor(node, busPower, selectionMode, hoveredNode === node && isSelectable(node), selectedComponent, parameters)}
            onNodeHover={node => selectionMode ? setHoveredNode(node) : null}
            onNodeClick={handleNodeClick}
            onLinkHover={null}
            onLinkClick={null}
            cooldownTicks={selectionMode ? 0 : Infinity}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const isSelected = selectedNode && node.id === selectedNode.id;
              const isMonitored = isNodeMonitored(node);
              // Ensure comparison is string vs string
              const isShortCircuitBus = shortCircuitBusId && node.id === shortCircuitBusId;
              const radius = (selectionMode && node === hoveredNode && isSelectable(node)) || isSelected ? 14 : 10;
              const fontSize = 16 / globalScale;

              // Check if this is the short-circuited bus
              if (isShortCircuitBus) {
                // Draw Warning Triangle
                const triangleHeight = radius * 1.7; // Adjust size as needed
                const triangleBase = radius * 2;
                ctx.beginPath();
                ctx.moveTo(node.x, node.y - triangleHeight / 2);
                ctx.lineTo(node.x - triangleBase / 2, node.y + triangleHeight / 2);
                ctx.lineTo(node.x + triangleBase / 2, node.y + triangleHeight / 2);
                ctx.closePath();

                ctx.fillStyle = '#ffcc00'; // Yellow warning color
                ctx.fill();
                ctx.strokeStyle = '#cc0000'; // Red border
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw Exclamation Mark
                ctx.font = `bold ${radius * 1.5 / globalScale}px Arial`; // Make it bold and larger
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#cc0000'; // Red exclamation mark
                ctx.fillText('!', node.x, node.y + radius * 0.1 / globalScale); // Adjust vertical position slightly

              } else {
                // --- Draw Regular Node --- 
                
                // Highlight selectable nodes on hover
                if (selectionMode && isSelectable(node) && node === hoveredNode) {
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, radius + 2, 0, 2 * Math.PI, false);
                  ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                  ctx.fill();
                }
                
                // Draw orange outline for monitored nodes
                if (isMonitored) {
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, radius + 5, 0, 2 * Math.PI, false);
                  ctx.strokeStyle = '#ff8800'; // Orange highlight
                  ctx.lineWidth = 4;
                  ctx.stroke();
                }

                // Draw the actual node circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                ctx.fillStyle = getNodeColor(node, busPower, selectionMode, node === hoveredNode, selectedComponent, parameters);
                ctx.fill();
                ctx.strokeStyle = selectionMode && node === hoveredNode && isSelectable(node) ? '#ff0000' : '#333';
                ctx.lineWidth = selectionMode && node === hoveredNode && isSelectable(node) ? 2 : 1;
                ctx.stroke();

                // Draw the label
                const label = node.label;
                ctx.font = `${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = selectionMode && node === hoveredNode && isSelectable(node) ? '#cc0000' : '#222';
                ctx.fillText(label, node.x, node.y);
              }
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
              if (['generator_connection', 'shunt_connection', 'load_connection'].includes(link.type)) return 0;
              const fromId = typeof link.source === 'object' ? link.source.id : link.source;
              const toId = typeof link.target === 'object' ? link.target.id : link.target;
              const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
              const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
              const dir = getLineFlowDirectionSimple(fromIdx, toIdx);
              return dir !== 0 ? 4 : 0;
            }}
            linkDirectionalParticleWidth={3}
            linkDirectionalParticleSpeed={link => {
              if (!busPower) return 0;
              const fromId = typeof link.source === 'object' ? link.source.id : link.source;
              const toId = typeof link.target === 'object' ? link.target.id : link.target;
              const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
              const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
              if (fromIdx === -1 || toIdx === -1) return 0;
              const dir = getLineFlowDirectionSimple(fromIdx, toIdx);
              return dir > 0 ? 0.01 : dir < 0 ? -0.01 : 0;
            }}
            linkLabel={link => {
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

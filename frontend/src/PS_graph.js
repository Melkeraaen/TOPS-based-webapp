import React from 'react';
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
const getNodeColor = (node, busPower) => {
  // fallback to type-based coloring only
  if (node.type === 'generator') return '#2ecc71';
  if (node.type === 'load') return '#3498db';
  if (node.type === 'shunt') return '#9b59b6';
  if (node.type === 'transformer') return '#e74c3c';
  if (node.id && node.id.startsWith('B')) return '#f1c40f'; // always yellow for buses
  return '#f1c40f';
};

// Add helper function to calculate power flow magnitude and direction
const getPowerFlowInfo = (link, powerFlows) => {
  if (!powerFlows || !powerFlows[link.id]) return null;
  const flow = powerFlows[link.id];
  const magnitude = Math.sqrt(flow.p_from * flow.p_from + flow.q_from * flow.q_from);
  const direction = flow.p_from >= 0 ? 1 : -1; // Flow direction based on real power
  return { magnitude, direction };
};

const PS_graph = ({ 
  graphRef,
  networkData, 
  busPower, 
  powerFlows, 
  initialNetworkData,
  graphWidth,
  getLineFlowDirectionSimple,
  parameters 
}) => {
  // Process links so that for dir < 0, source and target are swapped
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

  return (
    <Paper elevation={2} sx={{ p: 2, bgcolor: 'background.default', height: '600px', width: '100%', mb: 4 }}>
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
        overflow: 'hidden'
      }}>
        <div className="graph-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
          <ForceGraph2D
            ref={graphRef}
            graphData={{ nodes: networkData.nodes, links: processedLinks }}
            nodeLabel={node => node.label}
            nodeColor={node => getNodeColor(node, busPower)}
            nodeCanvasObject={(node, ctx, globalScale) => {
              // Draw the node as a circle with the correct color
              const label = node.label;
              const fontSize = 16 / globalScale;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI, false);
              ctx.fillStyle = getNodeColor(node, busPower);
              ctx.fill();
              ctx.strokeStyle = '#333';
              ctx.lineWidth = 1;
              ctx.stroke();
              // Draw the label
              ctx.font = `${fontSize}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#222';
              ctx.fillText(label, node.x, node.y);
            }}
            linkColor={link => {
              const flowInfo = getPowerFlowInfo(link, powerFlows);
              if (flowInfo) {
                // Color based on power flow magnitude
                const intensity = Math.min(flowInfo.magnitude / 100, 1); // Normalize to [0,1]
                return `rgba(255, ${Math.floor(255 * (1 - intensity))}, 0, 1)`; // Red to Yellow gradient
              }
              return link.type === 'transformer' ? '#e74c3c' : '#95a5a6';
            }}
            linkWidth={link => {
              const flowInfo = getPowerFlowInfo(link, powerFlows);
              return flowInfo ? 1 + Math.min(flowInfo.magnitude / 50, 5) : 1;
            }}
            linkDirectionalParticles={link => {
              if (!busPower) return 0;
              // No particles for generator, shunt, or load connections
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
            linkCurvature={(link) => {
              // Check if this is a parallel line by looking at the source and target
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
                // If this is a parallel line, curve it
                // First parallel line curves up, second curves down
                const lineNumber = link.id?.split('-').pop();
                return lineNumber === '1' ? 0.2 : -0.2;
              }
              return 0; // No curve for single lines or non-line links
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
import React from 'react';
import { 
  Grid, 
  Paper, 
  Typography, 
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Select,
  MenuItem
} from '@mui/material';
import Plot from 'react-plotly.js';
import FocusedComponentPlots from './FocusedComponentPlots';


// Default plot layout configuration
const defaultPlotLayout = {
  height: 400,
  margin: { t: 50, r: 50, l: 50, b: 50 },
  plot_bgcolor: '#ffffff',
  paper_bgcolor: '#ffffff',
  showlegend: true,
  legend: { x: 1.05, y: 1 },
  font: { family: 'Arial, sans-serif' },
  xaxis: {
    gridcolor: '#e0e0e0',
    zerolinecolor: '#808080',
    zerolinewidth: 1
  },
  yaxis: {
    gridcolor: '#e0e0e0',
    zerolinecolor: '#808080',
    zerolinewidth: 1
  }
};

// Helper function to get magnitude of complex value
const getMagnitude = (value, isPhasor = false) => {
  if (value && typeof value === 'object' && 'real' in value && 'imag' in value) {
    const magnitude = Math.sqrt(value.real * value.real + value.imag * value.imag);
    if (isPhasor) {
      return magnitude;
    }
    return value.real >= 0 ? magnitude : -magnitude;
  }
  
  if (typeof value === 'number') {
    if (isPhasor) {
      return Math.abs(value);
    }
    return value;
  }
  
  return 0;
};

// Helper function to detect islands in the network
const detectIslands = (networkData, lineOutage) => {
  const busNodes = networkData.nodes.filter(node => node.id?.toString().startsWith('B'));
  const visited = new Set();
  const islands = [];

  // DFS to find connected components
  const dfs = (nodeId, currentIsland) => {
    visited.add(nodeId);
    currentIsland.add(nodeId);

    // Find all connected nodes through non-cut lines and transformers
    networkData.links.forEach(link => {
      // Only consider lines and transformers
      if (link.type !== 'line' && link.type !== 'transformer') return;
      
      // Skip if this line is in the outage list
      let isOutaged = false;
      if (lineOutage?.enabled && lineOutage?.outages) {
        isOutaged = lineOutage.outages.some(outage => outage.lineId === link.id);
      }
      if (isOutaged) return;

      // Get source and target IDs, handling both object and string formats
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      // Check if this link connects to our current node
      const nextNode = sourceId === nodeId ? targetId : 
                      targetId === nodeId ? sourceId : null;
      
      if (nextNode && !visited.has(nextNode)) {
        dfs(nextNode, currentIsland);
      }
    });
  };

  // Start DFS from each unvisited bus
  busNodes.forEach(node => {
    if (!visited.has(node.id)) {
      const currentIsland = new Set();
      dfs(node.id, currentIsland);
      if (currentIsland.size > 0) {
        islands.push(currentIsland);
      }
    }
  });

  // If no islands were found, create one island with all buses
  if (islands.length === 0 && busNodes.length > 0) {
    islands.push(new Set(busNodes.map(node => node.id)));
  }

  return islands;
};

// Helper function to map generators to islands
const mapGeneratorsToIslands = (islands, networkData) => {
  const genMapping = {};
  
  networkData.links.forEach(link => {
    if (link.type === 'generator_connection') {
      // Handle link.source being either an object or a string
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const genId = sourceId.replace('G', '');
      
      // Handle link.target being either an object or a string
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
      islands.forEach((island, idx) => {
        if (island.has(targetId)) {
          genMapping[parseInt(genId) - 1] = idx;
        }
      });
    }
  });
  
  return genMapping;
};

// Helper function to calculate island frequencies
const calculateIslandFrequencies = (islands, genMapping, genSpeeds) => {
  return islands.map(island => {
    const islandGens = Object.entries(genMapping)
      .filter(([_, islandId]) => islandId === islands.indexOf(island))
      .map(([genId]) => parseInt(genId));
    
    const avgSpeed = islandGens.reduce((sum, genId) => {
      return sum + genSpeeds[genId];
    }, 0) / islandGens.length;
    
    return 50 * (1 + avgSpeed);
  });
};

// Power Injections Plot Component
const PowerInjectionsPlot = ({ 
  results,
  busPower,
  initialNetworkData,
  defaultPlotLayout
}) => {
  const [selectedBus, setSelectedBus] = React.useState('all');
  const [plotKey, setPlotKey] = React.useState(0); // Key for forcing re-render with transitions
  
  // Handle bus selection change
  const handleBusChange = (event) => {
    setSelectedBus(event.target.value);
    setPlotKey(prevKey => prevKey + 1); // Change key to force re-render with animation
  };
  
  // Parse raw power injections strings into complex numbers
  const rawInjections = results.bus_power_raw.map(val => {
    const match = val.match(/\(([-+]?\d+\.?\d*)([-+]\d+\.?\d*)j\)/);
    if (match) {
      return {
        real: parseFloat(match[1]),
        imag: parseFloat(match[2])
      };
    }
    return { real: 0, imag: 0 };
  });

  // Define a color palette for the 11 buses
  const busColors = [
    '#e41a1c', // red
    '#377eb8', // blue
    '#4daf4a', // green
    '#984ea3', // purple
    '#ff7f00', // orange
    '#a65628', // brown
    '#f781bf', // pink
    '#ffff33', // yellow
    '#999999', // grey
    '#a6cee3', // light blue
    '#fb9a99'  // light red
  ];

  // Create filtered list of bus nodes (B1-B11)
  const busNodes = initialNetworkData.nodes.filter(node => 
    node.id && node.id.startsWith('B')
  ).slice(0, 11);
  
  // Filter bus nodes based on selection
  const filteredBusNodes = selectedBus === 'all' 
    ? busNodes 
    : busNodes.filter(node => node.id === selectedBus);
    
  // Create arrows connecting initial to final positions
  const arrowData = filteredBusNodes.map((node) => {
    const idx = initialNetworkData.nodes.findIndex(n => n.id === node.id);
    const originalIndex = busNodes.findIndex(n => n.id === node.id);
    if (idx === -1 || !rawInjections[idx] || !busPower[idx]) return null;
    
    const initial = rawInjections[idx];
    const final = busPower[idx];
    
    return {
      x: [initial.real, final.p],
      y: [initial.imag, final.q],
      mode: 'lines',
      line: {
        color: 'rgba(0, 0, 0, 0.3)',
        width: 1,
        dash: 'dot'
      },
      showlegend: false,
      hoverinfo: 'none'
    };
  }).filter(Boolean);

  // Create data for initial power injections (hollow circles)
  const initialData = filteredBusNodes.map((node) => {
    const idx = initialNetworkData.nodes.findIndex(n => n.id === node.id);
    const originalIndex = busNodes.findIndex(n => n.id === node.id);
    if (idx === -1 || !rawInjections[idx]) return null;
    
    const val = rawInjections[idx];
    return {
      x: [val.real],
      y: [val.imag],
      name: `${node.id} (Initial)`,
      type: 'scatter',
      mode: 'markers',
      marker: {
        size: 12,
        symbol: 'circle-open',
        color: busColors[originalIndex % busColors.length],
        line: {
          width: 2,
          color: busColors[originalIndex % busColors.length]
        }
      },
      text: node.id,
      hovertemplate: '%{text} (Initial): %{x:.3f} + %{y:.3f}j<extra></extra>'
    };
  }).filter(Boolean);

  // Create data for final power injections (filled circles)
  const finalData = filteredBusNodes.map((node) => {
    const idx = initialNetworkData.nodes.findIndex(n => n.id === node.id);
    const originalIndex = busNodes.findIndex(n => n.id === node.id);
    if (idx === -1 || !busPower[idx]) return null;
    
    const val = busPower[idx];
    return {
      x: [val.p],
      y: [val.q],
      name: `${node.id} (Final)`,
      type: 'scatter',
      mode: 'markers',
      marker: {
        size: 12,
        symbol: 'circle',
        color: busColors[originalIndex % busColors.length]
      },
      text: node.id,
      hovertemplate: '%{text} (Final): %{x:.3f} + %{y:.3f}j<extra></extra>'
    };
  }).filter(Boolean);

  // Create legend-only entries for explaining markers
  const legendData = [
    {
      x: [null],
      y: [null],
      mode: 'markers',
      marker: { 
        size: 12, 
        symbol: 'circle-open',
        line: { width: 2, color: 'black' }
      },
      name: 'Initial State (t=0)',
      showlegend: true
    },
    {
      x: [null],
      y: [null],
      mode: 'markers',
      marker: { 
        size: 12, 
        symbol: 'circle',
        color: 'black'
      },
      name: 'Final State',
      showlegend: true
    }
  ];

  // Configure axis ranges
  let axisConfig = {};
  
  if (selectedBus === 'all') {
    // Calculate symmetric axes for all buses view
    const allX = [
      ...initialData.map(d => d.x[0] || 0),
      ...finalData.map(d => d.x[0] || 0)
    ];
    const allY = [
      ...initialData.map(d => d.y[0] || 0),
      ...finalData.map(d => d.y[0] || 0)
    ];
    
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const yMin = Math.min(...allY);
    const yMax = Math.max(...allY);
    
    // Create symmetrical axes for all buses view
    const axisMax = Math.max(Math.abs(xMin), Math.abs(xMax), Math.abs(yMin), Math.abs(yMax)) * 1.1;
    
    axisConfig = {
      xaxis: { 
        autorange: false,
        range: [-axisMax, axisMax]
      },
      yaxis: { 
        autorange: false,
        range: [-axisMax, axisMax],
        scaleanchor: 'x',
        scaleratio: 1
      }
    };
  } else {
    // For single bus view, use autorange with padding
    axisConfig = {
      xaxis: { 
        autorange: true
      },
      yaxis: { 
        autorange: true
      }
    };
  }

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
        <Typography variant="body1" sx={{ mr: 2 }}>
          Select Bus:
        </Typography>
        <Select
          value={selectedBus}
          onChange={handleBusChange}
          size="small"
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="all">All Buses</MenuItem>
          {busNodes.map(node => (
            <MenuItem key={node.id} value={node.id}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: 1
              }}>
                <Box sx={{ 
                  width: 12, 
                  height: 12, 
                  borderRadius: '50%', 
                  bgcolor: busColors[busNodes.findIndex(n => n.id === node.id)] 
                }}/>
                {node.id}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </Box>
    
      <div className="plot-for-export" data-title="Power Injections Comparison" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
        <Plot
          key={plotKey}
          data={[
            ...arrowData,
            ...initialData,
            ...finalData,
            ...legendData
          ]}
          layout={{
            ...defaultPlotLayout,
            title: {
              text: selectedBus === 'all' 
                ? 'Power Injections in Complex Plane' 
                : `Power Injection for ${selectedBus}`,
              font: { size: 24 },
              y: 0.95
            },
            xaxis: { 
              title: 'Real Power (MW)',
              zeroline: true,
              zerolinecolor: '#000000',
              zerolinewidth: 1,
              gridcolor: '#e0e0e0',
              ...axisConfig.xaxis
            },
            yaxis: { 
              title: 'Reactive Power (MVAr)',
              zeroline: true,
              zerolinecolor: '#000000',
              zerolinewidth: 1,
              gridcolor: '#e0e0e0',
              ...axisConfig.yaxis
            },
            height: 600,
            showlegend: true,
            legend: {
              orientation: 'h',
              y: -0.15
            },
            hovermode: 'closest',
            // Add transition for smoother changes
            transition: {
              duration: 400,
              easing: 'cubic-in-out'
            }
          }}
          config={{
            responsive: true,
            displayModeBar: true,
            displaylogo: false
          }}
          style={{ width: '100%', height: '600px' }}
        />
      </div>
    </>
  );
};

const ResultsSection = ({ 
  results, 
  parameters, 
  initialNetworkData, 
  busPower,
  getImprovedLineFlowDirection,
  monitoredComponents,
  onRemoveComponent
}) => {
  // Add logging effect at top level
  React.useEffect(() => {
    if (results?.gen_speed && results.gen_speed[0]) {
      const latestSpeeds = results.gen_speed[results.gen_speed.length - 1];
      const islands = detectIslands(initialNetworkData, parameters.lineOutage || []);
      const genMapping = mapGeneratorsToIslands(islands, initialNetworkData);
      const frequencies = calculateIslandFrequencies(islands, genMapping, latestSpeeds);

      console.log('System state:', {
        islands: islands.map((island, idx) => ({
          buses: Array.from(island),
          generators: Object.entries(genMapping)
            .filter(([_, islandId]) => islandId === idx)
            .map(([genId]) => `G${parseInt(genId) + 1}`),
          frequency: frequencies[idx].toFixed(3)
        }))
      });
    }
  }, [results?.gen_speed, parameters?.lineOutage, initialNetworkData]);

  // Merge links and transformers into a single array (do not mutate props)
  const mergedLinks = React.useMemo(() => {
    const links = initialNetworkData.links ? [...initialNetworkData.links] : [];
    if (initialNetworkData.transformers) {
      initialNetworkData.transformers.slice(1).forEach(row => {
        links.push({
          id: row[0],
          type: 'transformer',
          source: row[1],
          target: row[2],
          S_n: row[3],
          V_n_from: row[4],
          V_n_to: row[5],
          R: row[6],
          X: row[7]
        });
      });
    }
    return links;
  }, [initialNetworkData]);

  if (!results) return null;

  return (
    <>
      {/* Add the FocusedComponentPlots at the top if there are monitored components */}
      {monitoredComponents && monitoredComponents.length > 0 && (
        <FocusedComponentPlots 
          results={results} 
          monitoredComponents={monitoredComponents} 
          initialNetworkData={initialNetworkData}
          onRemoveComponent={onRemoveComponent}
        />
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom sx={{ 
          borderBottom: '2px solid #e0e0e0', 
          pb: 1, 
          color: '#3f51b5',
          fontWeight: 'bold'
        }}>
          Real-Time Simulation Results
        </Typography>
        <Grid container spacing={3}>
          {/* Bus Voltage Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="Bus Voltage" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results && results.v && results.v[0] ? (
                <Plot
                  data={results.v[0].map((_, idx) => ({
                    x: results.t,
                    y: results.v.map(v => {
                      const value = v[idx];
                      return typeof value === 'object' ? Math.sqrt(value.real**2 + value.imag**2) : Math.abs(value);
                    }),
                    type: 'scatter',
                    mode: 'lines',
                    name: `Bus ${idx + 1}`,
                    line: { simplify: true }
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Bus Voltages',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'Voltage [pu]' },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No voltage data available</div>
              )}
            </div>
          </Grid>

          {/* Voltage Angle Time Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="Bus Voltage Angles" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results?.v_angle && Array.isArray(results.v_angle) && results.v_angle.length > 0 && Array.isArray(results.v_angle[0]) ? (
                <Plot
                  data={results.v_angle[0].map((_, busIdx) => ({
                    type: 'scatter',
                    mode: 'lines',
                    name: `Bus ${busIdx + 1}`,
                    x: results.t,
                    y: results.v_angle.map(angles => angles[busIdx]),
                    line: { 
                      color: [
                        '#e41a1c',  // red
                        '#377eb8',  // blue
                        '#4daf4a',  // green
                        '#984ea3',  // purple
                        '#ff7f00',  // orange
                        '#a65628',  // brown
                        '#f781bf',  // pink
                        '#999999'   // grey
                      ][busIdx % 8],
                      width: 2
                    }
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Bus Voltage Angles',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'Angle [degrees]' },
                    showlegend: true,
                    legend: {
                      x: 1.1,
                      y: 1
                    },
                    margin: { t: 50, r: 100, b: 50 }
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No voltage angle data available</div>
              )}
            </div>
          </Grid>

          {/* Voltage Phasor Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="Bus Voltage Phasors" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results?.v && results.v[0] ? (
                <Plot
                  data={results.v[0].map((_, busIdx) => {
                    const lastIdx = results.v.length - 1;
                    const magnitude = getMagnitude(results.v[lastIdx][busIdx], true);
                    const angle = Math.atan2(
                      results.v[lastIdx][busIdx].imag,
                      results.v[lastIdx][busIdx].real
                    );  // Keep in radians like TOPS
                    return {
                      type: 'scatterpolar',
                      mode: 'lines+markers',
                      name: `Bus ${busIdx + 1}`,
                      r: [0, magnitude],
                      theta: [0, angle * 180 / Math.PI],  // Convert to degrees for plotly
                      marker: { size: 8 },
                      line: { 
                        color: [
                          '#e41a1c',  // red
                          '#377eb8',  // blue
                          '#4daf4a',  // green
                          '#984ea3',  // purple
                          '#ff7f00',  // orange
                          '#a65628',  // brown
                          '#f781bf',  // pink
                          '#999999'   // grey
                        ][busIdx % 8],
                        width: 2
                      }
                    };
                  })}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Bus Voltage Phasors',
                      font: { size: 24 },
                      y: 0.95
                    },
                    showlegend: true,
                    legend: {
                      x: 1.1,
                      y: 1
                    },
                    polar: {
                      radialaxis: {
                        showticklabels: true,
                        ticks: '',
                        range: [0, Math.max(...results.v.map(v => Math.max(...v.map(val => getMagnitude(val, true))))) * 1.1],
                        title: 'Voltage [p.u.]',
                        gridcolor: '#e0e0e0'
                      },
                      angularaxis: {
                        tickmode: 'array',
                        tickvals: [-180, -90, 0, 90, 180],
                        ticktext: ['180°', '270°', '0°', '90°', '180°'],
                        direction: 'clockwise',
                        period: 360,
                        gridcolor: '#e0e0e0'
                      },
                      bgcolor: '#ffffff'
                    },
                    width: 500,
                    height: 500,
                    margin: { t: 50, r: 100, b: 50, l: 50 }
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  useResizeHandler={true}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No voltage phasor data available</div>
              )}
            </div>
          </Grid>

          {/* Generator Current Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="Generator Current" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results && results.gen_I && results.gen_I[0] ? (
                <Plot
                  data={results.gen_I[0].map((_, idx) => ({
                    x: results.t,
                    y: results.gen_I.map(i => getMagnitude(i[idx], true)),
                    type: 'scatter',
                    mode: 'lines',
                    name: `Generator current ${idx + 1}`
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Generator Current',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'Generator current [A]' },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No generator current data available</div>
              )}
            </div>
          </Grid>

          {/* Load Current Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="Load Current" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results && results.load_I && results.load_I[0] ? (
                <Plot
                  data={results.load_I[0].map((_, idx) => ({
                    x: results.t,
                    y: results.load_I.map(i => getMagnitude(i[idx], true)),
                    type: 'scatter',
                    mode: 'lines',
                    name: `Load current ${idx + 1}`
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Load Current',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'Load current [A]' },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No load current data available</div>
              )}
            </div>
          </Grid>

          {/* Active Power Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="Load Active Power" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results && results.load_P && results.load_P[0] ? (
                <Plot
                  data={results.load_P[0].map((_, idx) => ({
                    x: results.t,
                    y: results.load_P.map(p => getMagnitude(p[idx], false)),
                    type: 'scatter',
                    mode: 'lines',
                    name: `Load ${idx + 1}`,
                    line: { simplify: true }
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Load Active Power',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'Active Power [MW]' },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No active power data available</div>
              )}
            </div>
          </Grid>

          {/* Reactive Power Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="Load Reactive Power" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results && results.load_Q && results.load_Q[0] ? (
                <Plot
                  data={results.load_Q[0].map((_, idx) => ({
                    x: results.t,
                    y: results.load_Q.map(q => getMagnitude(q[idx], false)),
                    type: 'scatter',
                    mode: 'lines',
                    name: `Reactive power ${idx + 1}`
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Load Reactive Power',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'MVAr' },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No reactive power data available</div>
              )}
            </div>
          </Grid>

          {/* Generator Speed Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="Generator Speeds" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results?.gen_speed && results.gen_speed[0] ? (
                <Plot
                  data={[
                    ...results.gen_speed[0].map((_, idx) => ({
                      x: results.t,
                      y: results.gen_speed.map(speeds => speeds[idx]),
                      type: 'scatter',
                      mode: 'lines',
                      name: `Generator ${idx + 1}`,
                      line: { simplify: true }
                    }))
                  ]}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Generator Speeds',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'Speed [pu]' }
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No generator speed data available</div>
              )}
            </div>
          </Grid>

          {/* Frequency Gauge Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="System Frequency" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results?.gen_speed && results.gen_speed[0] ? (() => {
                // Get latest generator speeds
                const latestSpeeds = results.gen_speed[results.gen_speed.length - 1];
                
                // Detect islands
                const islands = detectIslands(initialNetworkData, parameters.lineOutage || []);
                const genMapping = mapGeneratorsToIslands(islands, initialNetworkData);

                // Calculate current frequencies for each island
                const frequencies = calculateIslandFrequencies(islands, genMapping, latestSpeeds);

                // Define colors for gauge zones
                const colors = {
                  normal: 'rgb(46, 213, 115)',     // Green
                  warning: 'rgb(255, 165, 2)',     // Orange
                  danger: 'rgb(235, 77, 75)',      // Red
                  background: '#f5f6fa',           // Light gray
                  text: '#2f3640'                  // Dark gray
                };

                // Calculate layout dimensions based on number of islands
                const numIslands = frequencies.length;
                const isHorizontal = numIslands <= 3; // Stack horizontally if 3 or fewer islands
                
                // Calculate domains for each gauge
                const domains = frequencies.map((_, idx) => {
                  if (isHorizontal) {
                    // Arrange horizontally
                    const width = 1 / numIslands;
                    return {
                      x: [idx * width, (idx + 1) * width - 0.05], // Leave small gap between gauges
                      y: [0, 0.85] // Leave room for title at top
                    };
                  } else {
                    // Arrange vertically
                    const height = 1 / numIslands;
                    return {
                      x: [0, 1],
                      y: [idx * height, (idx + 1) * height - 0.05] // Leave small gap between gauges
                    };
                  }
                });

                // Create gauge traces
                const gaugeTraces = frequencies.map((freq, idx) => {
                  // Get list of generators for this island
                  const islandGens = Object.entries(genMapping)
                    .filter(([_, id]) => id === idx)
                    .map(([genId]) => parseInt(genId) + 1)
                    .join(', ');

                  return {
                    type: 'indicator',
                    mode: 'gauge+number',
                    value: freq,
                    title: {
                      text: `Island ${idx + 1}<br>Generators: ${islandGens}`,
                      font: { size: 16, color: colors.text }
                    },
                    gauge: {
                      axis: {
                        range: [49, 51],
                        tickwidth: 2,
                        tickcolor: colors.text,
                        tickmode: 'linear',
                        dtick: 0.2,
                        tickfont: { size: 12 }
                      },
                      bar: { color: colors.text },
                      bgcolor: colors.background,
                      borderwidth: 2,
                      bordercolor: colors.text,
                      steps: [
                        // Red zones
                        { range: [49, 49.8], color: colors.danger },
                        { range: [50.2, 51], color: colors.danger },
                        // Orange zones
                        { range: [49.8, 49.9], color: colors.warning },
                        { range: [50.1, 50.2], color: colors.warning },
                        // Green zone
                        { range: [49.9, 50.1], color: colors.normal }
                      ],
                      threshold: {
                        line: { color: colors.text, width: 4 },
                        thickness: 0.75,
                        value: freq
                      }
                    },
                    domain: domains[idx]
                  };
                });

                // Layout configuration
                const layout = {
                  title: {
                    text: 'System Frequencies',
                    font: { size: 24, color: colors.text },
                    y: 0.95,
                    yanchor: 'top'
                  },
                  height: isHorizontal ? 400 : Math.max(300, numIslands * 250),
                  margin: { t: 60, r: 25, l: 25, b: 25 },
                  paper_bgcolor: '#ffffff',
                  font: { family: 'Arial, sans-serif' },
                  showlegend: false
                };

                // Render the gauges
                return (
                  <Plot
                    data={gaugeTraces}
                    layout={layout}
                    config={{
                      responsive: true,
                      displayModeBar: false
                    }}
                    style={{ 
                      width: '100%',
                      minWidth: '400px',
                      maxWidth: isHorizontal ? '1200px' : '600px'
                    }}
                    useResizeHandler={true}
                  />
                );
              })() : (
                <div>No frequency data available</div>
              )}
            </div>
          </Grid>

          {/* PLL Plots */}
          {parameters.pllParams.enabled && (
            <>
              {/* PLL Angle Plot */}
              <Grid item xs={12} md={6}>
                <div className="plot-for-export" data-title="PLL Angles" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
                  {Array.isArray(results.v_angle) && Array.isArray(results.pll1_angle) && Array.isArray(results.pll2_angle) && results.v_angle.length > 0 ? (
                    <Plot
                      data={[
                        {
                          x: results.t,
                          y: results.v_angle.map(angles => Array.isArray(angles) ? angles[0] * (180/Math.PI) : angles * (180/Math.PI)),
                          type: 'scatter',
                          mode: 'lines',
                          name: 'Voltage Angle',
                          line: { color: '#2196f3' }
                        },
                        {
                          x: results.t,
                          y: results.pll1_angle.map(angles => Array.isArray(angles) ? angles[0] * (180/Math.PI) : angles * (180/Math.PI)),
                          type: 'scatter',
                          mode: 'lines',
                          name: 'PLL1 Angle',
                          line: { color: '#4caf50' }
                        },
                        {
                          x: results.t,
                          y: results.pll2_angle.map(angles => Array.isArray(angles) ? angles[0] * (180/Math.PI) : angles * (180/Math.PI)),
                          type: 'scatter',
                          mode: 'lines',
                          name: 'PLL2 Angle',
                          line: { color: '#ff9800' }
                        }
                      ]}
                      layout={{
                        ...defaultPlotLayout,
                        title: {
                          text: 'PLL Angles',
                          font: { size: 24 },
                          y: 0.95
                        },
                        xaxis: { title: 'Time [s]' },
                        yaxis: { 
                          title: 'Angle [deg]',
                          range: [-180, 180],
                          tickmode: 'linear',
                          dtick: 45
                        },
                      }}
                      config={{
                        responsive: true,
                        displayModeBar: false
                      }}
                      style={{ width: '100%', height: '400px' }}
                    />
                  ) : (
                    <Typography>Waiting for PLL angle data...</Typography>
                  )}
                </div>
              </Grid>

              {/* PLL Frequency Plot */}
              <Grid item xs={12} md={6}>
                <div className="plot-for-export" data-title="PLL Frequencies" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
                  {Array.isArray(results.pll1_freq) && Array.isArray(results.pll2_freq) && results.pll1_freq.length > 0 ? (
                    <Plot
                      data={[
                        {
                          x: results.t,
                          y: results.pll1_freq.map(f => Array.isArray(f) ? f[0] : f),
                          type: 'scatter',
                          mode: 'lines',
                          name: 'PLL1 Frequency',
                          line: { color: '#4caf50' }
                        },
                        {
                          x: results.t,
                          y: results.pll2_freq.map(f => Array.isArray(f) ? f[0] : f),
                          type: 'scatter',
                          mode: 'lines',
                          name: 'PLL2 Frequency',
                          line: { color: '#ff9800' }
                        }
                      ]}
                      layout={{
                        ...defaultPlotLayout,
                        title: {
                          text: 'PLL Frequencies',
                          font: { size: 24 },
                          y: 0.95
                        },
                        xaxis: { title: 'Time [s]' },
                        yaxis: { 
                          title: 'Frequency [Hz]',
                          range: [45, 55],
                          tickmode: 'linear',
                          dtick: 1
                        },
                      }}
                      config={{
                        responsive: true,
                        displayModeBar: false
                      }}
                      style={{ width: '100%', height: '400px' }}
                    />
                  ) : (
                    <Typography>Waiting for PLL frequency data...</Typography>
                  )}
                </div>
              </Grid>
            </>
          )}

          {/* Combined Transformer Current Plot */}
          <Grid item xs={12}>
            <div className="plot-for-export" data-title="Transformer Currents" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results && results.trafo_current_from && results.trafo_current_from[0] && 
               results.trafo_current_to && results.trafo_current_to[0] ? (
                <Plot
                  data={[
                    ...results.trafo_current_from[0].map((_, idx) => ({
                      x: results.t,
                      y: results.trafo_current_from.map(i => getMagnitude(i[idx], true)),
                      type: 'scatter',
                      mode: 'lines',
                      name: `Transformer ${idx + 1} (From)`,
                      line: { dash: 'solid' }
                    })),
                    ...results.trafo_current_to[0].map((_, idx) => ({
                      x: results.t,
                      y: results.trafo_current_to.map(i => getMagnitude(i[idx], true)),
                      type: 'scatter',
                      mode: 'lines',
                      name: `Transformer ${idx + 1} (To)`,
                      line: { dash: 'dot' }
                    }))
                  ]}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Transformer Currents',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'Current [pu]' },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  style={{ width: '100%', height: '500px' }}
                />
              ) : (
                <div>No transformer current data available</div>
              )}
            </div>
          </Grid>
        </Grid>
      </Paper>

      {/* Post-Simulation Analysis Section */}
      <Paper sx={{ p: 3, mb: 3, mt: 5, borderTop: '4px solid #3f51b5' }}>
        <Typography variant="h5" gutterBottom sx={{ 
          borderBottom: '2px solid #e0e0e0', 
          pb: 1, 
          color: '#3f51b5',
          fontWeight: 'bold'
        }}>
          Post-Simulation Analysis
        </Typography>
        
        <Grid container spacing={3}>
          {/* Eigenvalue Plot */}
          <Grid item xs={12} md={6}>
            <div className="plot-for-export" data-title="System Eigenvalues" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results?.eigenvalues?.real && results.eigenvalues.real.length > 0 ? (
                <Plot
                  data={[{
                    x: results.eigenvalues.real,
                    y: results.eigenvalues.imag,
                    type: 'scatter',
                    mode: 'markers',
                    marker: {
                      size: 10,
                      symbol: 'x',
                      color: '#2ecc71'
                    },
                    name: 'Eigenvalues',
                    hovertemplate: 'λ = %{x:.3f} + j%{y:.3f}<br>' +
                                 'f = %{customdata[0]:.2f} Hz<br>' +
                                 'ζ = %{customdata[1]:.1f}%<extra></extra>',
                    customdata: results.eigenvalues.real.map((_, i) => [
                      results.eigenvalues.frequency[i],
                      results.eigenvalues.damping[i]
                    ])
                  }]}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'System Eigenvalues',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { 
                      title: 'Real Part',
                      zeroline: true,
                      zerolinecolor: '#000000',
                      zerolinewidth: 2,
                      gridcolor: '#e0e0e0'
                    },
                    yaxis: { 
                      title: 'Imaginary Part',
                      scaleanchor: 'x',
                      scaleratio: 1,
                      zeroline: true,
                      zerolinecolor: '#000000',
                      zerolinewidth: 2,
                      gridcolor: '#e0e0e0'
                    },
                    showlegend: false,
                    hovermode: 'closest'
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <Typography>No eigenvalue data available</Typography>
              )}
            </div>
          </Grid>

          {/* Mode Shape Plots */}
          {results?.eigenvalues?.mode_shapes && results.eigenvalues.electromechanical_modes?.length > 0 && (
            <Grid item xs={12}>
              <div className="plot-for-export" data-title="Electromechanical Mode Shapes" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
                <Typography variant="h6" gutterBottom>Electromechanical Mode Shapes</Typography>
                <Grid container spacing={2}>
                  {/* Only plot unique modes (skip conjugate pairs) */}
                  {Array.from({ length: results.eigenvalues.mode_shapes.magnitude[0].length / 2 }, (_, i) => i * 2).map(modeIdx => {
                    const freq = results.eigenvalues.frequency[results.eigenvalues.electromechanical_modes[modeIdx]];
                    const damp = results.eigenvalues.damping[results.eigenvalues.electromechanical_modes[modeIdx]];
                    
                    // Get magnitude and angle for all generators for this mode
                    const magnitudes = results.eigenvalues.mode_shapes.magnitude.map(row => row[modeIdx]);
                    const angles = results.eigenvalues.mode_shapes.angle.map(row => row[modeIdx]);
                    
                    return (
                      <Grid item xs={12} md={4} key={modeIdx}>
                        <Plot
                          data={magnitudes.map((mag, genIdx) => ({
                            type: 'scatterpolar',
                            r: [0, mag],  // Start from origin
                            theta: [0, angles[genIdx]],  // Start from origin
                            mode: 'lines+markers',
                            marker: { size: 8 },
                            line: { 
                              // Use TOPS' Set1 colormap colors
                              color: [
                                '#e41a1c',  // red
                                '#377eb8',  // blue
                                '#4daf4a',  // green
                                '#984ea3',  // purple
                              ][genIdx],
                              width: 2
                            },
                            name: `Gen ${genIdx + 1}`,
                            showlegend: true
                          }))}
                          layout={{
                            ...defaultPlotLayout,
                            title: {
                              text: `Mode ${modeIdx/2 + 1}<br>f = ${freq.toFixed(2)} Hz, ζ = ${damp.toFixed(1)}%`,
                              font: { size: 16 }
                            },
                            showlegend: true,
                            legend: {
                              x: 1.1,
                              y: 1
                            },
                            polar: {
                              radialaxis: {
                                showticklabels: false,
                                ticks: '',
                                range: [0, 1.1],  // Add some padding
                                showgrid: true,
                                gridcolor: '#e0e0e0'
                              },
                              angularaxis: {
                                tickmode: 'array',
                                tickvals: [-180, -90, 0, 90, 180],
                                ticktext: ['180°', '270°', '0°', '90°', '180°'],
                                direction: 'clockwise',
                                period: 360,
                                gridcolor: '#e0e0e0'
                              },
                              bgcolor: '#ffffff'
                            },
                            width: 400,
                            height: 400,
                            margin: { t: 50, r: 100, b: 50, l: 50 }  // Increased right margin for legend
                          }}
                          config={{
                            responsive: true,
                            displayModeBar: false
                          }}
                        />
                      </Grid>
                    );
                  })}
                </Grid>
              </div>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* Power Injections Comparison Plot */}
      {results && results.bus_power_raw && busPower && busPower.length > 0 && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Power Injections Comparison (Initial vs Final)</Typography>
            <PowerInjectionsPlot 
              results={results}
              busPower={busPower}
              initialNetworkData={initialNetworkData}
              defaultPlotLayout={defaultPlotLayout}
            />
          </Paper>
        )}

      {/* Bus Power Injection Table */}
      {busPower && busPower.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Power Injections</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell>Bus</TableCell>
                  <TableCell align="right">P (MW)</TableCell>
                  <TableCell align="right">Q (MVAr)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {busPower.map((bp, idx) => (
                  <TableRow key={idx} sx={{ '&:nth-of-type(odd)': { backgroundColor: '#fafafa' } }}>
                    <TableCell>{initialNetworkData.nodes[idx]?.id || idx + 1}</TableCell>
                    <TableCell align="right">{bp.p.toFixed(3)}</TableCell>
                    <TableCell align="right">{bp.q.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Line Power Flow Table */}
      {busPower && busPower.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Power Flow Directions</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell>Line</TableCell>
                  <TableCell>From Bus</TableCell>
                  <TableCell>To Bus</TableCell>
                  <TableCell align="right">From Bus P (MW)</TableCell>
                  <TableCell align="right">To Bus P (MW)</TableCell>
                  <TableCell align="center">Flow Direction</TableCell>
                  <TableCell align="center">Strongest Influences</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Collect unique transformer connections */}
                {(() => {
                  const transformerRows = [];
                  // Manually define transformer connections
                  const transformerDefs = [
                    { label: 'T1-5', busA: 'B1', busB: 'B5' },
                    { label: 'T2-6', busA: 'B2', busB: 'B6' },
                    { label: 'T3-11', busA: 'B3', busB: 'B11' },
                    { label: 'T4-10', busA: 'B4', busB: 'B10' },
                  ];
                  transformerDefs.forEach(({ label, busA, busB }) => {
                    const idxA = initialNetworkData.nodes.findIndex(n => n.id === busA);
                    const idxB = initialNetworkData.nodes.findIndex(n => n.id === busB);
                    if (idxA === -1 || idxB === -1) return;
                    const fromP = busPower[idxA]?.p ?? 0;
                    const toP = busPower[idxB]?.p ?? 0;
                    // Use simulation-based (particle) flow direction logic
                    const dir = getImprovedLineFlowDirection(idxA, idxB);
                    let dirText = '-';
                    let dirArrow = '⇌';
                    if (dir > 0) {
                      dirText = `${busA.replace('B','')} → ${busB.replace('B','')}`;
                      dirArrow = '→';
                    } else if (dir < 0) {
                      dirText = `${busB.replace('B','')} → ${busA.replace('B','')}`;
                      dirArrow = '←';
                    }
                    // Find significant injections
                    const sourcesAndSinks = [];
                    busPower.forEach((power, bIdx) => {
                      if (power && Math.abs(power.p) > 0.1) {
                        const busId = initialNetworkData.nodes[bIdx]?.id;
                        if (busId && busId.startsWith('B')) {
                          const type = power.p > 0 ? 'Source' : 'Sink';
                          sourcesAndSinks.push({
                            id: busId.replace('B',''),
                            value: power.p.toFixed(1),
                            type
                          });
                        }
                      }
                    });
                    sourcesAndSinks.sort((a, b) => Math.abs(parseFloat(b.value)) - Math.abs(parseFloat(a.value)));
                    const topInfluencers = sourcesAndSinks.slice(0, 3);
                    transformerRows.push(
                      <TableRow key={label} sx={{ '&:nth-of-type(odd)': { backgroundColor: '#fafafa' }, '&:hover': { backgroundColor: '#f0f0f0' } }}>
                        <TableCell>{label}</TableCell>
                        <TableCell>{busA.replace('B','')}</TableCell>
                        <TableCell>{busB.replace('B','')}</TableCell>
                        <TableCell align="right">{fromP.toFixed(3)}</TableCell>
                        <TableCell align="right">{toP.toFixed(3)}</TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography fontSize="1.2rem" fontWeight="bold" color="primary">
                              {dirArrow}
                            </Typography>
                            <Typography variant="body2" sx={{ ml: 1 }}>
                              {dirText}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Box>
                            {topInfluencers.map((inf, i) => (
                              <Typography 
                                key={i} 
                                variant="body2" 
                                color={inf.type === 'Source' ? 'success.main' : 'error.main'}
                                sx={{ fontSize: '0.8rem' }}
                              >
                                {inf.id}: {inf.value} MW ({inf.type})
                              </Typography>
                            ))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  });
                  // Existing line logic
                  const lineRows = [];
                  mergedLinks.forEach((link, idx) => {
                    if (link.type === 'line') {
                      const fromId = typeof link.source === 'object' ? link.source.id : link.source;
                      const toId = typeof link.target === 'object' ? link.target.id : link.target;
                      if (fromId.startsWith('B') && toId.startsWith('B')) {
                        const sorted = [fromId.replace('B',''), toId.replace('B','')].sort((a,b)=>a-b);
                        const label = `L${sorted[0]}-${sorted[1]}`;
                        const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
                        const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
                        const dir = getImprovedLineFlowDirection(fromIdx, toIdx);
                        let dirText = '-';
                        let dirArrow = '⇌';
                        if (dir > 0) {
                          dirText = `${sorted[0]} → ${sorted[1]}`;
                          dirArrow = '→';
                        } else if (dir < 0) {
                          dirText = `${sorted[1]} → ${sorted[0]}`;
                          dirArrow = '←';
                        }
                        const fromP = busPower[fromIdx]?.p ?? 0;
                        const toP = busPower[toIdx]?.p ?? 0;
                        // Find significant injections
                        const sourcesAndSinks = [];
                        busPower.forEach((power, bIdx) => {
                          if (power && Math.abs(power.p) > 0.1) {
                            const busId = initialNetworkData.nodes[bIdx]?.id;
                            if (busId && busId.startsWith('B')) {
                              const type = power.p > 0 ? 'Source' : 'Sink';
                              sourcesAndSinks.push({
                                id: busId.replace('B',''),
                                value: power.p.toFixed(1),
                                type
                              });
                            }
                          }
                        });
                        sourcesAndSinks.sort((a, b) => Math.abs(parseFloat(b.value)) - Math.abs(parseFloat(a.value)));
                        const topInfluencers = sourcesAndSinks.slice(0, 3);
                        lineRows.push(
                          <TableRow key={label} sx={{ '&:nth-of-type(odd)': { backgroundColor: '#fafafa' }, '&:hover': { backgroundColor: '#f0f0f0' } }}>
                            <TableCell>{label}</TableCell>
                            <TableCell>{sorted[0]}</TableCell>
                            <TableCell>{sorted[1]}</TableCell>
                            <TableCell align="right">{fromP.toFixed(3)}</TableCell>
                            <TableCell align="right">{toP.toFixed(3)}</TableCell>
                            <TableCell align="center">
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography fontSize="1.2rem" fontWeight="bold" color="primary">
                                  {dirArrow}
                                </Typography>
                                <Typography variant="body2" sx={{ ml: 1 }}>
                                  {dirText}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell align="center">
                              <Box>
                                {topInfluencers.map((inf, i) => (
                                  <Typography 
                                    key={i} 
                                    variant="body2" 
                                    color={inf.type === 'Source' ? 'success.main' : 'error.main'}
                                    sx={{ fontSize: '0.8rem' }}
                                  >
                                    {inf.id}: {inf.value} MW ({inf.type})
                                  </Typography>
                                ))}
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      }
                    }
                  });
                  return [...transformerRows, ...lineRows];
                })()}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Raw Bus Power Data */}
      {results && results.bus_power_raw && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Bus Power Injections (Raw)</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell>Bus</TableCell>
                  <TableCell>Injection (complex)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.bus_power_raw.map((val, idx) => (
                  <TableRow key={idx} sx={{ '&:nth-of-type(odd)': { backgroundColor: '#fafafa' } }}>
                    <TableCell>{initialNetworkData.nodes[idx]?.id || idx + 1}</TableCell>
                    <TableCell>{val}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </>
  );
};

export default ResultsSection; 
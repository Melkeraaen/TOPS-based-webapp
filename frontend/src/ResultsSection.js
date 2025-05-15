// Results visualization component for power system simulation
// Displays plots, tables, and analysis of simulation results

import React, { useState, useEffect } from 'react';
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
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput,
  FormControl,
  InputLabel
} from '@mui/material';
import Plot from 'react-plotly.js';
import FocusedComponentPlots from './FocusedComponentPlots';

// Color scheme for visualization components
// Defines consistent colors for buses, gauges, and status indicators
const plotColors = {
  buses: [
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
  ],
  gauge: {
    normal: 'rgb(46, 213, 115)',     // Green
    warning: 'rgb(255, 165, 2)',     // Orange
    danger: 'rgb(235, 77, 75)',      // Red
    background: '#f5f6fa',           // Light gray
    text: '#2f3640'                  // Dark gray
  }
};

// Default configuration for plot layouts
// Sets consistent styling and dimensions for all plots
const defaultPlotLayout = {
  height: 400,
  margin: { t: 80, r: 120, l: 100, b: 100 },
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

// Complex number magnitude calculation
// Handles both phasor quantities and power values
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

// Network topology analysis
// Identifies electrically isolated sections of the power system
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

// Generator mapping utility
// Associates generators with their respective electrical islands
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

// Frequency calculation for islanded systems
// Computes average frequency for each electrical island
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

// Power injection visualization
// Plots active and reactive power at selected buses
const PowerInjectionsPlot = ({ 
  results,
  busPower,
  initialNetworkData,
  defaultPlotLayout
}) => {
  const [selectedBuses, setSelectedBuses] = useState([]); 
  const [plotKey, setPlotKey] = useState(0);
  
  const handleBusChange = (event) => {
    const { target: { value } } = event;
    setSelectedBuses(
      // On autofill we get a stringified value.
      typeof value === 'string' ? value.split(',') : value,
    );
    setPlotKey(prevKey => prevKey + 1);
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

  // Create filtered list of bus nodes (B1-B11)
  const busNodes = initialNetworkData.nodes.filter(node => 
    node.id && node.id.startsWith('B')
  ).slice(0, 11);
  
  // Filter bus nodes based on selection
  const filteredBusNodes = selectedBuses.length > 0 ? 
    busNodes.filter(node => selectedBuses.includes(node.id))
    : busNodes;
    
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
        color: plotColors.buses[originalIndex % plotColors.buses.length],
        line: {
          width: 2,
          color: plotColors.buses[originalIndex % plotColors.buses.length]
        }
      },
      text: node.id,
      hovertemplate: '%{text} (Initial): %{x:.2f} + %{y:.2f}j<extra></extra>'
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
        color: plotColors.buses[originalIndex % plotColors.buses.length]
      },
      text: node.id,
      hovertemplate: '%{text} (Final): %{x:.2f} + %{y:.2f}j<extra></extra>'
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
  
  if (selectedBuses.length === 0) { // Show all buses if selection is empty
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
      xaxis: { autorange: false, range: [-axisMax, axisMax] },
      yaxis: { autorange: false, range: [-axisMax, axisMax], scaleanchor: 'x', scaleratio: 1 }
    };
  } else {
    // For selected bus(es) view, use autorange
    axisConfig = {
      xaxis: { autorange: true },
      yaxis: { autorange: true }
    };
  }

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
        <Typography variant="body1" sx={{ mr: 2 }}>
          Select Bus(es):
        </Typography>
        <FormControl sx={{ minWidth: 150, maxWidth: 300 }} size="small">
          <InputLabel>Buses</InputLabel>
          <Select
            multiple
            value={selectedBuses}
            onChange={handleBusChange}
            input={<OutlinedInput label="Buses" />}
            renderValue={(selected) => selected.join(', ')}
          >
            {busNodes.map(node => (
              <MenuItem key={node.id} value={node.id}>
                <Checkbox checked={selectedBuses.indexOf(node.id) > -1} />
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: 1
                }}>
                  <Box sx={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    bgcolor: plotColors.buses[busNodes.findIndex(n => n.id === node.id)] 
                  }}/>
                  <ListItemText primary={node.id} />
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
              text: selectedBuses.length === 0 
                ? 'Power Injections in Complex Plane (All Buses)' 
                : `Power Injection for ${selectedBuses.join(', ')}`,
              font: { size: 24 },
              y: 0.95
            },
            xaxis: { 
              title: { text: 'P [MW]' },
              zeroline: true,
              zerolinecolor: '#000000',
              zerolinewidth: 1,
              gridcolor: '#e0e0e0',
              ...axisConfig.xaxis
            },
            yaxis: { 
              title: { text: 'Q [MVAr]' },
              zeroline: true,
              zerolinecolor: '#000000',
              zerolinewidth: 1,
              gridcolor: '#e0e0e0',
              scaleanchor: selectedBuses.length === 0 ? 'x' : undefined,
              scaleratio: selectedBuses.length === 0 ? 1 : undefined,
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
  monitoredComponents,
  onRemoveComponent,
  exportIslandData
}) => {
  const [islandFrequencyTimeSeries, setIslandFrequencyTimeSeries] = useState(null);
  const [islandInfo, setIslandInfo] = useState([]); // To store island details for legend/labels

  // Effect to calculate island frequency time series
  useEffect(() => {
    if (results?.gen_speed && Array.isArray(results.gen_speed) && results.gen_speed.length > 0 && initialNetworkData) {
      const islands = detectIslands(initialNetworkData, parameters.lineOutage || null);
      const genMapping = mapGeneratorsToIslands(islands, initialNetworkData);
      
      // Make island data available for App.js when needed
      if (exportIslandData && typeof exportIslandData === 'function') {
        const latestSpeeds = results.gen_speed[results.gen_speed.length - 1];
        const frequencies = calculateIslandFrequencies(islands, genMapping, latestSpeeds);
        exportIslandData({
          islands,
          genMapping,
          frequencies
        });
      }
      
      const timeSeries = islands.map(() => []); // Initialize an array for each island
      
      results.gen_speed.forEach(speedsAtTimeT => {
        if (!Array.isArray(speedsAtTimeT)) return; // Skip if data for this timestep is invalid
        
        const frequenciesAtTimeT = calculateIslandFrequencies(islands, genMapping, speedsAtTimeT);
        
        frequenciesAtTimeT.forEach((freq, islandIndex) => {
          if (timeSeries[islandIndex]) { // Ensure the island index is valid
             timeSeries[islandIndex].push(freq);
          }
        });
      });
      
      setIslandFrequencyTimeSeries(timeSeries);
      
      // Store island info for labels
      setIslandInfo(islands.map((island, idx) => ({
        id: idx + 1,
        buses: Array.from(island),
        generators: Object.entries(genMapping)
          .filter(([_, islandId]) => islandId === idx)
          .map(([genId]) => `G${parseInt(genId) + 1}`)
      })));
      
    } else {
      // Reset if results are not available
      setIslandFrequencyTimeSeries(null);
      setIslandInfo([]);
    }
  }, [results?.gen_speed, initialNetworkData, parameters.lineOutage, exportIslandData]);

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
          defaultPlotLayout={defaultPlotLayout}
        />
      )}

      {/* Real-Time Simulation Results Section */}
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

          {/* === NEW ORDERING STARTS HERE === */}

          {/* 1. Frequency Gauge Plot */}
          <Grid item xs={12} md={6}>
            <div style={{
              backgroundColor: '#ffffff',
              padding: '30px 30px 40px 30px', // top, right, bottom, left
              margin: '0 20px 30px 20px',     // top, right, bottom, left
              borderRadius: '16px'            // optional: makes it look nicer
            }}>
              {results?.gen_speed && results.gen_speed[0] ? (() => {
                // Get latest generator speeds
                const latestSpeeds = results.gen_speed[results.gen_speed.length - 1];
                
                // Detect islands
                const islands = detectIslands(initialNetworkData, parameters.lineOutage || []);
                const genMapping = mapGeneratorsToIslands(islands, initialNetworkData);

                // Calculate current frequencies for each island
                const frequencies = calculateIslandFrequencies(islands, genMapping, latestSpeeds);

                // Calculate layout dimensions based on number of islands
                const numIslands = frequencies.length;
                const isHorizontal = numIslands <= 3; // Stack horizontally if 3 or fewer islands
                
                // Calculate domains for each gauge
                const domains = frequencies.map((_, idx) => {
                  if (isHorizontal) {
                    // Arrange horizontally
                    const width = 1 / numIslands;
                    const gap = 0.12; // try 0.08 for a bigger gap
                    return {
                      x: [idx * width, (idx + 1) * width - gap],
                      y: [0, 0.85]
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

                // Calculate maxAbsDev for symmetric scaling around 50 Hz
                let maxAbsDev = 0.2;
                let showFineTicks = true; // default value
                if (results?.gen_speed && Array.isArray(results.gen_speed)) {
                  const allFreqs = results.gen_speed.flat().map(s => 50 * (1 + s));
                  const maxFreqEver = Math.max(...allFreqs);
                  const minFreqEver = Math.min(...allFreqs);
                  showFineTicks = !(maxFreqEver > 50.3 || minFreqEver < 49.7);
                  maxAbsDev = Math.max(0.2, ...allFreqs.map(f => Math.abs(f - 50)));
                }
                const tempMinFreq = 50 - maxAbsDev;
                const tempMaxFreq = 50 + maxAbsDev;

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
                      font: { size: 16, color: plotColors.gauge.text }
                    },
                    gauge: {
                      axis: {
                        range: [tempMinFreq, tempMaxFreq],
                        tickwidth: 2,
                        tickcolor: plotColors.gauge.text,
                        tickmode: 'array',
                        tickvals: showFineTicks
                          ? [tempMinFreq, 49.9, 50, 50.1, tempMaxFreq]
                          : [tempMinFreq, 50, tempMaxFreq],
                        ticktext: showFineTicks
                          ? [tempMinFreq.toFixed(1), '49.9', '50.0', '50.1', tempMaxFreq.toFixed(1)]
                          : [tempMinFreq.toFixed(1), '50.0', tempMaxFreq.toFixed(1)],
                        tickfont: { size: 12 }
                      },
                      bar: { color: plotColors.gauge.text },
                      bgcolor: plotColors.gauge.background,
                      borderwidth: 2,
                      bordercolor: plotColors.gauge.text,
                      steps: [
                        { range: [tempMinFreq, 49.9], color: plotColors.gauge.danger },
                        { range: [49.9, 49.91], color: plotColors.gauge.warning },
                        { range: [49.91, 50.09], color: plotColors.gauge.normal },
                        { range: [50.09, 50.1], color: plotColors.gauge.warning },
                        { range: [50.1, tempMaxFreq], color: plotColors.gauge.danger }
                      ],
                      threshold: {
                        line: { color: plotColors.gauge.text, width: 4 },
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
                    font: { size: 24, color: plotColors.gauge.text },
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
                      displayModeBar: true,
                      displaylogo: false
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
          
          {/* 2. Frequency Over Time Plot */}
          <Grid item xs={12} md={6}>
            <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {islandFrequencyTimeSeries && islandFrequencyTimeSeries.length > 0 ? (
                <Plot
                  data={islandFrequencyTimeSeries.map((freqData, index) => ({
                    x: results.t,
                    y: freqData,
                    type: 'scatter',
                    mode: 'lines',
                    name: `Island ${islandInfo[index]?.id || index + 1}` + 
                          (islandInfo[index]?.generators.length > 0 ? ` (Gens: ${islandInfo[index].generators.join(', ')})` : ''),
                    line: { width: 2 }
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'System Frequency Over Time',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { ...defaultPlotLayout.xaxis, title: { text: 't [s]' }, autorange: true },
                    yaxis: { ...defaultPlotLayout.yaxis, title: { text: 'f [Hz]' }, range: [49, 51] }, // Set a typical range
                    showlegend: true,
                    legend: { x: 1.05, y: 1 }
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                results && <Typography>Calculating frequency data...</Typography> // Show message while calculating
              )}
            </div>
          </Grid>
          
          {/* 3. Bus Voltage (Magnitude) Plot */}
          <Grid item xs={12} md={6}>
            <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                    xaxis: { ...defaultPlotLayout.xaxis, title: { text: 't [s]' }, autorange: true },
                    yaxis: { ...defaultPlotLayout.yaxis, title: { text: 'V [p.u.]' }, autorange: true },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No voltage data available</div>
              )}
            </div>
          </Grid>

          {/* 4. Bus Voltage Phasors Plot */}
          <Grid item xs={12} md={6}>
            <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                        color: plotColors.buses[busIdx % plotColors.buses.length],
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
                        autorange: true,
                        title: 'V [p.u.]',
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
                    displayModeBar: true,
                    displaylogo: false
                  }}
                  useResizeHandler={true}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No voltage phasor data available</div>
              )}
            </div>
          </Grid>
          
          {/* 5. Generator Speeds Plot */}
          <Grid item xs={12} md={6}>
            <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                    xaxis: { ...defaultPlotLayout.xaxis, title: { text: 't [s]' }, autorange: true },
                    yaxis: { ...defaultPlotLayout.yaxis, title: { text: 'ω [p.u.]' }, autorange: true }
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No generator speed data available</div>
              )}
            </div>
          </Grid>
          
          {/* 6. Generator Current Plot */}
          <Grid item xs={12} md={6}>
            <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                    xaxis: { ...defaultPlotLayout.xaxis, title: { text: 't [s]' }, autorange: true },
                    yaxis: { ...defaultPlotLayout.yaxis, title: { text: 'I [A]' }, autorange: true },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No generator current data available</div>
              )}
            </div>
          </Grid>

          {/* 7. Load Active Power Plot */}
          <Grid item xs={12} md={6}>
            <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                    xaxis: { ...defaultPlotLayout.xaxis, title: { text: 't [s]' }, autorange: true },
                    yaxis: { ...defaultPlotLayout.yaxis, title: { text: 'P [MW]' }, autorange: true },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No active power data available</div>
              )}
            </div>
          </Grid>

          {/* 8. Load Reactive Power Plot */}
          <Grid item xs={12} md={6}>
            <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results && results.load_Q && results.load_Q[0] ? (
                <Plot
                  data={results.load_Q[0].map((_, idx) => ({
                    x: results.t,
                    // Correctly extract the imaginary part for Reactive Power (Q)
                    y: results.load_Q.map(q => {
                      const qValue = q[idx];
                      // Check if qValue is a complex object, otherwise use the number directly or default to 0
                      return (qValue && typeof qValue === 'object' && 'imag' in qValue) ? qValue.imag : (typeof qValue === 'number' ? qValue : 0);
                    }),
                    type: 'scatter',
                    mode: 'lines',
                    name: `Load ${idx + 1} Q` // Changed name for clarity
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Load Reactive Power',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { ...defaultPlotLayout.xaxis, title: { text: 't [s]' }, autorange: true },
                    yaxis: { ...defaultPlotLayout.yaxis, title: { text: 'Q [MVAr]' }, autorange: true }, // Ensure unit is correct
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false
                  }}
                  style={{ width: '100%', height: '400px' }}
                />
              ) : (
                <div>No reactive power data available</div>
              )}
            </div>
          </Grid>

          {/* 9. Load Current Plot */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                      xaxis: { ...defaultPlotLayout.xaxis, title: { text: 't [s]' }, autorange: true },
                      yaxis: { ...defaultPlotLayout.yaxis, title: { text: 'I [A]' }, autorange: true },
                    }}
                    config={{
                      responsive: true,
                      displayModeBar: true,
                      displaylogo: false
                    }}
                    style={{ width: '100%', height: '400px' }}
                  />
                ) : (
                  <div>No load current data available</div>
                )}
              </div>
            </Grid>
            <Grid item xs={12} md={6}>
              <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                      xaxis: { ...defaultPlotLayout.xaxis, title: { text: 't [s]' }, autorange: true },
                      yaxis: { ...defaultPlotLayout.yaxis, title: { text: 'I [p.u.]' }, autorange: true },
                    }}
                    config={{
                      responsive: true,
                      displayModeBar: true,
                      displaylogo: false
                    }}
                    style={{ width: '100%', height: '400px' }}
                  />
                ) : (
                  <div>No transformer current data available</div>
                )}
              </div>
            </Grid>
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
            <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                    hovertemplate: 'λ = %{x:.2f} + j%{y:.2f}<br>' +
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
                      title: { text: 'Real Part' },
                      zeroline: true,
                      zerolinecolor: '#000000',
                      zerolinewidth: 2,
                      gridcolor: '#e0e0e0',
                      autorange: true
                    },
                    yaxis: { 
                      title: { text: 'Imaginary Part' },
                      scaleanchor: 'x',
                      scaleratio: 1,
                      zeroline: true,
                      zerolinecolor: '#000000',
                      zerolinewidth: 2,
                      gridcolor: '#e0e0e0',
                      autorange: true
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
              <div style={{ backgroundColor: '#ffffff', padding: '10px' }}>
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
                              color: plotColors.buses[genIdx % 4], // Use first 4 colors
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
                                autorange: true,
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
                            displayModeBar: true,
                            displaylogo: false
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


    </>
  );
};

export default ResultsSection; 
// Detailed component monitoring visualization
// Displays time-series plots for selected power system components

import React from 'react';
import { 
  Grid, 
  Paper, 
  Typography, 
  Box,
  IconButton
} from '@mui/material';
import Plot from 'react-plotly.js';
import CloseIcon from '@mui/icons-material/Close';

// Standard plot configuration
// Defines consistent styling for all component plots
const defaultPlotLayout = {
  height: 350,
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

// Component to bus connection mapping
// Defines the electrical connections between components and buses
const componentBusMapping = {
  generator: {
    'G1': 'B1',
    'G2': 'B2',
    'G3': 'B3',
    'G4': 'B4'
  },
  transformer: {
    'T1': { input: 'B1', output: 'B5' },
    'T2': { input: 'B2', output: 'B6' },
    'T3': { input: 'B3', output: 'B11' },
    'T4': { input: 'B4', output: 'B10' }
  }
};

// Bus index lookup utility
// Finds the array index of a bus in the network data
const findBusIndex = (busId, initialNetworkData) => {
  return initialNetworkData.nodes.findIndex(n => n.id === busId);
};

// Main component monitoring interface
// Renders detailed plots for selected generators, transformers, and other components
const FocusedComponentPlots = ({ results, monitoredComponents, initialNetworkData, onRemoveComponent }) => {
  if (!results || !monitoredComponents || monitoredComponents.length === 0) return null;

  // No data case
  if (!results.t || !Array.isArray(results.t) || results.t.length === 0) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Monitored Components ({monitoredComponents.length})</Typography>
        <Typography>No simulation data available yet. Run the simulation to see component plots.</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" gutterBottom>Monitored Components ({monitoredComponents.length})</Typography>
      </Box>
      
      <Grid container spacing={3}>
        {monitoredComponents.map((component, idx) => {
          // Render different plots based on component type
          if (component.type === 'generator') {
            // Find generator index
            const genIdx = parseInt(component.id.replace('G', '')) - 1;
            
            // Find associated bus index
            const busId = componentBusMapping.generator[component.id];
            const busIdx = findBusIndex(busId, initialNetworkData);
            
            // Check if we have data for this generator
            const hasGenSpeedData = results.gen_speed && 
                                   Array.isArray(results.gen_speed) && 
                                   results.gen_speed.length > 0 && 
                                   Array.isArray(results.gen_speed[0]) && 
                                   genIdx >= 0 && 
                                   genIdx < results.gen_speed[0].length;
            
            const hasGenCurrentData = results.gen_I && 
                                     Array.isArray(results.gen_I) && 
                                     results.gen_I.length > 0 && 
                                     Array.isArray(results.gen_I[0]) && 
                                     genIdx >= 0 && 
                                     genIdx < results.gen_I[0].length;
            
            const hasVoltageData = results.v && 
                                  Array.isArray(results.v) && 
                                  results.v.length > 0 && 
                                  Array.isArray(results.v[0]) &&
                                  busIdx >= 0 && 
                                  busIdx < results.v[0].length;
            
            const hasVoltageAngleData = results.v_angle && 
                                      Array.isArray(results.v_angle) && 
                                      results.v_angle.length > 0 && 
                                      Array.isArray(results.v_angle[0]) &&
                                      busIdx >= 0 && 
                                      busIdx < results.v_angle[0].length;
            
            return (
              <Grid item xs={12} key={component.id}>
                <Paper elevation={2} sx={{ p: 2, position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1">{component.label}</Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => onRemoveComponent(component.id)}
                      aria-label={`Remove ${component.label} from monitoring`}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  
                  <Grid container spacing={2}>
                    {/* Generator Speed Plot */}
                    <Grid item xs={12} md={6}>
                      {hasGenSpeedData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.gen_speed.map(speeds => speeds[genIdx]),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${component.label} Speed`,
                              line: { color: '#2ecc71', width: 2 }
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: 'Generator Speed' },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'ω [p.u.]' }, autorange: true }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No speed data available for this generator</Typography>
                      )}
                    </Grid>
                    
                    {/* Generator Current Plot */}
                    <Grid item xs={12} md={6}>
                      {hasGenCurrentData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.gen_I.map(currents => getMagnitude(currents[genIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${component.label} Current Magnitude`,
                              line: { color: '#e74c3c', width: 2 }
                            },
                            {
                              x: results.t,
                              y: results.gen_I.map(currents => {
                                const current = currents[genIdx];
                                if (current && typeof current === 'object' && 'real' in current && 'imag' in current) {
                                  return Math.atan2(current.imag, current.real) * 180 / Math.PI;
                                }
                                return 0;
                              }),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${component.label} Current Angle`,
                              line: { color: '#f39c12', width: 2, dash: 'dash' },
                              yaxis: 'y2'
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: 'Generator Current' },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'I [A]' }, autorange: true },
                            yaxis2: {
                              title: { text: 'θ [°]' },
                              titlefont: { color: '#f39c12' },
                              tickfont: { color: '#f39c12' },
                              overlaying: 'y',
                              side: 'right',
                              autorange: true
                            }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No current data available for this generator</Typography>
                      )}
                    </Grid>
                    
                    {/* Terminal Voltage Plot */}
                    <Grid item xs={12} md={6}>
                      {hasVoltageData && hasVoltageAngleData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.v.map(voltages => getMagnitude(voltages[busIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${busId} Voltage Magnitude`,
                              line: { color: '#3498db', width: 2 }
                            },
                            {
                              x: results.t,
                              y: results.v_angle.map(angles => angles[busIdx] * 180 / Math.PI),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${busId} Voltage Angle`,
                              line: { color: '#9b59b6', width: 2, dash: 'dash' },
                              yaxis: 'y2'
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: `Terminal Voltage (${busId})` },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'V [p.u.]' }, autorange: true },
                            yaxis2: {
                              title: { text: 'θ [°]' },
                              titlefont: { color: '#9b59b6' },
                              tickfont: { color: '#9b59b6' },
                              overlaying: 'y',
                              side: 'right',
                              autorange: true
                            }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No voltage data available for this generator's terminal</Typography>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            );
          } else if (component.type === 'bus') {
            // Find bus index
            const busIdx = initialNetworkData.nodes.findIndex(n => n.id === component.id);
            
            // Check if we have data for this bus
            const hasVoltageData = results.v && 
                                  Array.isArray(results.v) && 
                                  results.v.length > 0 && 
                                  Array.isArray(results.v[0]) &&
                                  busIdx >= 0 && 
                                  busIdx < results.v[0].length;
            
            const hasVoltageAngleData = results.v_angle && 
                                      Array.isArray(results.v_angle) && 
                                      results.v_angle.length > 0 && 
                                      Array.isArray(results.v_angle[0]) &&
                                      busIdx >= 0 && 
                                      busIdx < results.v_angle[0].length;
            
            return (
              <Grid item xs={12} key={component.id}>
                <Paper elevation={2} sx={{ p: 2, position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1">{component.label}</Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => onRemoveComponent(component.id)}
                      aria-label={`Remove ${component.label} from monitoring`}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  
                  <Grid container spacing={2}>
                    {/* Bus Voltage Plot */}
                    <Grid item xs={12} md={6}>
                      {hasVoltageData && hasVoltageAngleData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.v.map(v => getMagnitude(v[busIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${component.label} Voltage Magnitude`,
                              line: { color: '#f1c40f', width: 2 }
                            },
                            {
                              x: results.t,
                              y: results.v_angle.map(angles => angles[busIdx] * 180 / Math.PI),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${component.label} Voltage Angle`,
                              line: { color: '#e67e22', width: 2, dash: 'dash' },
                              yaxis: 'y2'
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: 'Bus Voltage' },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'V [p.u.]' }, autorange: true },
                            yaxis2: {
                              title: { text: 'θ [°]' },
                              titlefont: { color: '#e67e22' },
                              tickfont: { color: '#e67e22' },
                              overlaying: 'y',
                              side: 'right',
                              autorange: true
                            }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No voltage data available for this bus</Typography>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            );
          } else if (component.type === 'load') {
            // Find load index
            const loadIdx = parseInt(component.id.replace('L', '')) - 1;
            
            // Find connected bus (loads are on B7 and B9)
            const busId = component.id === 'L1' ? 'B7' : 'B9';
            const busIdx = findBusIndex(busId, initialNetworkData);
            
            // Check if we have data for this load
            const hasLoadPowerData = results.load_P && 
                                    Array.isArray(results.load_P) && 
                                    results.load_P.length > 0 && 
                                    Array.isArray(results.load_P[0]) &&
                                    results.load_Q && 
                                    Array.isArray(results.load_Q) && 
                                    results.load_Q.length > 0 && 
                                    Array.isArray(results.load_Q[0]) &&
                                    loadIdx >= 0 && 
                                    loadIdx < results.load_P[0].length &&
                                    loadIdx < results.load_Q[0].length;
            
            const hasLoadCurrentData = results.load_I && 
                                      Array.isArray(results.load_I) && 
                                      results.load_I.length > 0 && 
                                      Array.isArray(results.load_I[0]) &&
                                      loadIdx >= 0 && 
                                      loadIdx < results.load_I[0].length;
            
            const hasVoltageData = results.v && 
                                  Array.isArray(results.v) && 
                                  results.v.length > 0 && 
                                  Array.isArray(results.v[0]) &&
                                  busIdx >= 0 && 
                                  busIdx < results.v[0].length;
            
            return (
              <Grid item xs={12} key={component.id}>
                <Paper elevation={2} sx={{ p: 2, position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1">{component.label}</Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => onRemoveComponent(component.id)}
                      aria-label={`Remove ${component.label} from monitoring`}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  
                  <Grid container spacing={2}>
                    {/* Load Power Plot */}
                    <Grid item xs={12} md={6}>
                      {hasLoadPowerData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.load_P.map(p => getMagnitude(p[loadIdx], false)),
                              type: 'scatter',
                              mode: 'lines',
                              name: 'Active Power',
                              line: { color: '#3498db', width: 2 }
                            },
                            {
                              x: results.t,
                              y: results.load_Q.map(q => getMagnitude(q[loadIdx], false)),
                              type: 'scatter',
                              mode: 'lines',
                              name: 'Reactive Power',
                              line: { color: '#9b59b6', width: 2, dash: 'dash' }
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: 'Load Power' },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'P/Q [MW/MVAr]' }, autorange: true }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No power data available for this load</Typography>
                      )}
                    </Grid>
                    
                    {/* Load Current Plot */}
                    <Grid item xs={12} md={6}>
                      {hasLoadCurrentData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.load_I.map(i => getMagnitude(i[loadIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: 'Current Magnitude',
                              line: { color: '#e74c3c', width: 2 }
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: 'Load Current' },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'I [A]' }, autorange: true }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No current data available for this load</Typography>
                      )}
                    </Grid>
                    
                    {/* Connected Bus Voltage Plot */}
                    <Grid item xs={12} md={6}>
                      {hasVoltageData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.v.map(v => getMagnitude(v[busIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${busId} Voltage`,
                              line: { color: '#f1c40f', width: 2 }
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: `Connected Bus Voltage (${busId})` },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'V [p.u.]' }, autorange: true }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No voltage data available for the connected bus</Typography>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            );
          } else if (component.type === 'transformer') {
            // Find transformer index
            const trafoIdx = parseInt(component.id.replace('T', '')) - 1;
            
            // Find associated buses
            const busMapping = componentBusMapping.transformer[component.id];
            const inputBusIdx = findBusIndex(busMapping.input, initialNetworkData);
            const outputBusIdx = findBusIndex(busMapping.output, initialNetworkData);
            
            // Check if we have data for this transformer
            const hasTrafoCurrentData = results.trafo_current_from && 
                                       Array.isArray(results.trafo_current_from) && 
                                       results.trafo_current_from.length > 0 && 
                                       Array.isArray(results.trafo_current_from[0]) &&
                                       results.trafo_current_to && 
                                       Array.isArray(results.trafo_current_to) && 
                                       results.trafo_current_to.length > 0 && 
                                       Array.isArray(results.trafo_current_to[0]) &&
                                       trafoIdx >= 0 && 
                                       trafoIdx < results.trafo_current_from[0].length &&
                                       trafoIdx < results.trafo_current_to[0].length;
            
            const hasInputVoltageData = results.v && 
                                       Array.isArray(results.v) && 
                                       results.v.length > 0 && 
                                       Array.isArray(results.v[0]) &&
                                       inputBusIdx >= 0 && 
                                       inputBusIdx < results.v[0].length;
            
            const hasOutputVoltageData = results.v && 
                                        Array.isArray(results.v) && 
                                        results.v.length > 0 && 
                                        Array.isArray(results.v[0]) &&
                                        outputBusIdx >= 0 && 
                                        outputBusIdx < results.v[0].length;
            
            return (
              <Grid item xs={12} key={component.id}>
                <Paper elevation={2} sx={{ p: 2, position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1">{component.label}</Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => onRemoveComponent(component.id)}
                      aria-label={`Remove ${component.label} from monitoring`}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  
                  <Grid container spacing={2}>
                    {/* Transformer Current Plot */}
                    <Grid item xs={12} md={6}>
                      {hasTrafoCurrentData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.trafo_current_from.map(i => getMagnitude(i[trafoIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: 'From Side',
                              line: { color: '#e74c3c', width: 2 }
                            },
                            {
                              x: results.t,
                              y: results.trafo_current_to.map(i => getMagnitude(i[trafoIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: 'To Side',
                              line: { color: '#e67e22', width: 2, dash: 'dash' }
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: 'Transformer Current' },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'I [A]' }, autorange: true }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No current data available for this transformer</Typography>
                      )}
                    </Grid>
                    
                    {/* Input Bus Voltage Plot */}
                    <Grid item xs={12} md={6}>
                      {hasInputVoltageData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.v.map(v => getMagnitude(v[inputBusIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${busMapping.input} Voltage`,
                              line: { color: '#2ecc71', width: 2 }
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: `Input Bus Voltage (${busMapping.input})` },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'V [p.u.]' }, autorange: true }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No voltage data available for input bus</Typography>
                      )}
                    </Grid>
                    
                    {/* Output Bus Voltage Plot */}
                    <Grid item xs={12} md={6}>
                      {hasOutputVoltageData ? (
                        <Plot
                          data={[
                            {
                              x: results.t,
                              y: results.v.map(v => getMagnitude(v[outputBusIdx], true)),
                              type: 'scatter',
                              mode: 'lines',
                              name: `${busMapping.output} Voltage`,
                              line: { color: '#3498db', width: 2 }
                            }
                          ]}
                          layout={{
                            ...defaultPlotLayout,
                            title: { text: `Output Bus Voltage (${busMapping.output})` },
                            xaxis: { title: { text: 't [s]' }, autorange: true },
                            yaxis: { title: { text: 'V [p.u.]' }, autorange: true }
                          }}
                          config={{ responsive: true, displaylogo: false }}
                          style={{ width: '100%', height: '300px' }}
                        />
                      ) : (
                        <Typography>No voltage data available for output bus</Typography>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            );
          } else {
            // Default for other component types
            return (
              <Grid item xs={12} md={6} key={idx}>
                <Paper elevation={2} sx={{ p: 2, position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1">{component.label || `Component ${idx + 1}`}</Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => onRemoveComponent(component.id)}
                      aria-label={`Remove ${component.label} from monitoring`}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Typography>No specific data visualization available for this component type</Typography>
                </Paper>
              </Grid>
            );
          }
        })}
      </Grid>
    </Paper>
  );
};

export default FocusedComponentPlots; 
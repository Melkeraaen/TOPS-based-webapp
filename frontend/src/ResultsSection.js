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
  TableRow
} from '@mui/material';
import Plot from 'react-plotly.js';

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

const ResultsSection = ({ 
  results, 
  parameters, 
  initialNetworkData, 
  busPower,
  getLineFlowDirectionSimple 
}) => {
  if (!results) return null;

  return (
    <>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Simulation Plots</Typography>
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
            <div className="plot-for-export" data-title="Generator Speed" style={{ backgroundColor: '#ffffff', padding: '10px' }}>
              {results && results.gen_speed && results.gen_speed[0] ? (
                <Plot
                  data={results.gen_speed[0].map((_, idx) => ({
                    x: results.t,
                    y: results.gen_speed.map(speed => getMagnitude(speed[idx], false)),
                    type: 'scatter',
                    mode: 'lines',
                    name: `Generator ${idx + 1}`,
                    line: { simplify: true }
                  }))}
                  layout={{
                    ...defaultPlotLayout,
                    title: {
                      text: 'Generator Speed',
                      font: { size: 24 },
                      y: 0.95
                    },
                    xaxis: { title: 'Time [s]' },
                    yaxis: { title: 'Speed [pu]' },
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

      {/* Bus Power Injection Table */}
      {busPower && busPower.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Bus Power Injections (Final)</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Bus</TableCell>
                  <TableCell align="right">P (MW)</TableCell>
                  <TableCell align="right">Q (MVAr)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {busPower.map((bp, idx) => (
                  <TableRow key={idx}>
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

      {/* Line Power Flow Checklist Table */}
      {busPower && busPower.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Line Power Flow Checklist</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Line</TableCell>
                  <TableCell>From Bus</TableCell>
                  <TableCell>To Bus</TableCell>
                  <TableCell align="right">From Bus P (MW)</TableCell>
                  <TableCell align="right">To Bus P (MW)</TableCell>
                  <TableCell align="center">Direction</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {initialNetworkData.links.filter(l => l.type === 'line' || l.type === 'transformer').map((link, idx) => {
                  const fromId = typeof link.source === 'object' ? link.source.id : link.source;
                  const toId = typeof link.target === 'object' ? link.target.id : link.target;
                  const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
                  const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
                  const fromP = busPower[fromIdx]?.p ?? 0;
                  const toP = busPower[toIdx]?.p ?? 0;
                  const dir = getLineFlowDirectionSimple(fromIdx, toIdx);
                  let dirText = '-';
                  if (dir > 0) dirText = `towards bus ${toId}`;
                  else if (dir < 0) dirText = `towards bus ${fromId}`;
                  return (
                    <TableRow key={link.id || idx}>
                      <TableCell>{link.id || `${fromId}-${toId}`}</TableCell>
                      <TableCell>{fromId}</TableCell>
                      <TableCell>{toId}</TableCell>
                      <TableCell align="right">{fromP.toFixed(3)}</TableCell>
                      <TableCell align="right">{toP.toFixed(3)}</TableCell>
                      <TableCell align="center">{dirText}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Raw Bus Power Data */}
      {results && results.bus_power_raw && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Bus Power Injections (Raw)</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Bus</TableCell>
                  <TableCell>Injection (complex)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.bus_power_raw.map((val, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{initialNetworkData.nodes[idx]?.id || idx + 1}</TableCell>
                    <TableCell>{val}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Detailed Results Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Detailed Results</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Time [s]</TableCell>
                <TableCell>Generator Speed [pu]</TableCell>
                <TableCell>Bus Voltage [pu]</TableCell>
                <TableCell>Generator Current [A]</TableCell>
                <TableCell>Load Current [A]</TableCell>
                <TableCell>Load Active Power [MW]</TableCell>
                <TableCell>Load Reactive Power [MVAr]</TableCell>
                <TableCell>Transformer Current From [A]</TableCell>
                <TableCell>Transformer Current To [A]</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.t.map((time, index) => (
                <TableRow key={index}>
                  <TableCell>{time.toFixed(3)}</TableCell>
                  <TableCell>
                    {results.gen_speed[index].map(val => getMagnitude(val, false).toFixed(3)).join(', ')}
                  </TableCell>
                  <TableCell>
                    {results.v[index].map(val => getMagnitude(val, true).toFixed(3)).join(', ')}
                  </TableCell>
                  <TableCell>
                    {results.gen_I[index].map(val => getMagnitude(val, true).toFixed(3)).join(', ')}
                  </TableCell>
                  <TableCell>
                    {results.load_I[index].map(val => getMagnitude(val, true).toFixed(3)).join(', ')}
                  </TableCell>
                  <TableCell>
                    {results.load_P[index].map(val => getMagnitude(val, false).toFixed(3)).join(', ')}
                  </TableCell>
                  <TableCell>
                    {results.load_Q[index].map(val => getMagnitude(val, false).toFixed(3)).join(', ')}
                  </TableCell>
                  <TableCell>
                    {results.trafo_current_from[index].map(val => getMagnitude(val, true).toFixed(3)).join(', ')}
                  </TableCell>
                  <TableCell>
                    {results.trafo_current_to[index].map(val => getMagnitude(val, true).toFixed(3)).join(', ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );
};

export default ResultsSection; 
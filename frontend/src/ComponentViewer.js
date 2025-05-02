import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Paper,
  Typography,
  Box,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ClearIcon from '@mui/icons-material/Clear';
import Plot from 'react-plotly.js';

const ComponentViewer = ({ 
  open, 
  onClose, 
  results, 
  selectedComponent,
  setSelectedComponent,
  monitoredComponents,
  setMonitoredComponents,
  initialNetworkData
}) => {
  // Helper to check if the current component is already monitored
  const isMonitored = selectedComponent ? 
    monitoredComponents.some(comp => comp.id === selectedComponent.id) : false;

  // Add the current component to the monitored components list
  const addToMonitored = () => {
    // Don't add duplicates
    if (!selectedComponent) return;
    
    if (!monitoredComponents.some(comp => comp.id === selectedComponent.id)) {
      setMonitoredComponents(prev => [...prev, selectedComponent]);
    }
  };

  // Remove a component from monitored list
  const removeFromMonitored = (id) => {
    setMonitoredComponents(prev => prev.filter(comp => comp.id !== id));
  };

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

  // Get the index of a component based on type and id
  const getComponentIndex = (type, id) => {
    switch (type) {
      case 'bus':
        return initialNetworkData.nodes.findIndex(node => node.id === id);
        
      case 'generator': {
        const idx = id.replace('G', '') - 1;
        return idx >= 0 ? idx : -1;
      }
        
      case 'load': {
        const idx = id.replace('L', '') - 1;
        return idx >= 0 ? idx : -1;
      }
        
      case 'transformer': {
        const idx = id.replace('T', '') - 1;
        return idx >= 0 ? idx : -1;
      }
        
      case 'line': {
        return initialNetworkData.links.findIndex(link => link.id === id);
      }
        
      default:
        return -1;
    }
  };

  // Render component details and plots based on the selected component
  const renderComponentPlot = () => {
    if (!selectedComponent) return null;

    const { type, id } = selectedComponent;
    const componentIndex = getComponentIndex(type, id);
    if (componentIndex === -1) return <Typography>Component not found</Typography>;

    switch (type) {
      case 'bus':
        return renderBusPlots(componentIndex);
        
      case 'generator':
        return renderGeneratorPlots(componentIndex);
        
      case 'load':
        return renderLoadPlots(componentIndex);
        
      case 'transformer':
        return renderTransformerPlots(componentIndex);
        
      case 'line':
        return renderLinePlots(id);
        
      default:
        return <Typography>Unknown component type</Typography>;
    }
  };

  // Render bus plots
  const renderBusPlots = (busIdx) => {
    // If no results, show static information
    if (!results || !results.v || !results.v[0]) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Bus Information</Typography>
            <Typography>Voltage Level: {initialNetworkData.nodes[busIdx].voltage} kV</Typography>
            <Typography>
              Waiting for simulation results to show voltage and angle data...
            </Typography>
          </Paper>
        </Box>
      );
    }

    // With results, show dynamic plots
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Voltage Magnitude</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.v_magnitude.map(v => v[busIdx]),
              type: 'scatter',
              mode: 'lines',
              name: 'Voltage Magnitude [pu]'
            }]}
            layout={{
              title: `Bus ${busIdx + 1} Voltage Magnitude`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Voltage [pu]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Voltage Angle</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.v_angle.map(v => v[busIdx] * 180/Math.PI),
              type: 'scatter',
              mode: 'lines',
              name: 'Voltage Angle [deg]'
            }]}
            layout={{
              title: `Bus ${busIdx + 1} Voltage Angle`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Angle [deg]' },
              height: 300
            }}
          />
        </Paper>
      </Box>
    );
  };

  // Render generator plots
  const renderGeneratorPlots = (genIdx) => {
    // If no results, show static information
    if (!results || !results.gen_speed || !results.gen_speed[0]) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Generator Information</Typography>
            <Typography>
              Waiting for simulation results to show generator data...
            </Typography>
          </Paper>
        </Box>
      );
    }

    // With results, show dynamic plots
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Generator Speed</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.gen_speed.map(s => s[genIdx]),
              type: 'scatter',
              mode: 'lines',
              name: 'Speed [pu]'
            }]}
            layout={{
              title: `Generator ${genIdx + 1} Speed`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Speed [pu]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Generator Current</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.gen_I.map(i => getMagnitude(i[genIdx], true)),
              type: 'scatter',
              mode: 'lines',
              name: 'Current [A]'
            }]}
            layout={{
              title: `Generator ${genIdx + 1} Current`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Current [A]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Generator Terminal Voltage</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.v_magnitude.map(v => v[genIdx]),
              type: 'scatter',
              mode: 'lines',
              name: 'Voltage [pu]'
            }]}
            layout={{
              title: `Generator ${genIdx + 1} Terminal Voltage`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Voltage [pu]' },
              height: 300
            }}
          />
        </Paper>
      </Box>
    );
  };

  // Render load plots
  const renderLoadPlots = (loadIdx) => {
    // If no results, show static information
    if (!results || !results.load_I || !results.load_I[0]) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Load Information</Typography>
            <Typography>
              Waiting for simulation results to show load data...
            </Typography>
          </Paper>
        </Box>
      );
    }

    // With results, show dynamic plots
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Load Current</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.load_I.map(i => getMagnitude(i[loadIdx], true)),
              type: 'scatter',
              mode: 'lines',
              name: 'Current [A]'
            }]}
            layout={{
              title: `Load ${loadIdx + 1} Current`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Current [A]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Active Power</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.load_P.map(p => getMagnitude(p[loadIdx], false)),
              type: 'scatter',
              mode: 'lines',
              name: 'Active Power [MW]'
            }]}
            layout={{
              title: `Load ${loadIdx + 1} Active Power`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Active Power [MW]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Reactive Power</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.load_Q.map(q => getMagnitude(q[loadIdx], false)),
              type: 'scatter',
              mode: 'lines',
              name: 'Reactive Power [MVAr]'
            }]}
            layout={{
              title: `Load ${loadIdx + 1} Reactive Power`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Reactive Power [MVAr]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Load Bus Voltage</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.v_magnitude.map(v => v[loadIdx + 6]), // L1 is at B7, L2 is at B9
              type: 'scatter',
              mode: 'lines',
              name: 'Voltage [pu]'
            }]}
            layout={{
              title: `Load ${loadIdx + 1} Bus Voltage`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Voltage [pu]' },
              height: 300
            }}
          />
        </Paper>
      </Box>
    );
  };

  // Render transformer plots
  const renderTransformerPlots = (trafoIdx) => {
    // If no results, show static information
    if (!results || !results.trafo_current_from || !results.trafo_current_from[0]) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Transformer Information</Typography>
            <Typography>
              Waiting for simulation results to show transformer data...
            </Typography>
          </Paper>
        </Box>
      );
    }

    // With results, show dynamic plots
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Current From Side</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.trafo_current_from.map(i => getMagnitude(i[trafoIdx], true)),
              type: 'scatter',
              mode: 'lines',
              name: 'Current From [A]'
            }]}
            layout={{
              title: `Transformer ${trafoIdx + 1} Current (From Side)`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Current [A]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Current To Side</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.trafo_current_to.map(i => getMagnitude(i[trafoIdx], true)),
              type: 'scatter',
              mode: 'lines',
              name: 'Current To [A]'
            }]}
            layout={{
              title: `Transformer ${trafoIdx + 1} Current (To Side)`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Current [A]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">From Side Voltage</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.v_magnitude.map(v => v[trafoIdx]), // T1-T4 are connected to B1-B4
              type: 'scatter',
              mode: 'lines',
              name: 'Voltage [pu]'
            }]}
            layout={{
              title: `Transformer ${trafoIdx + 1} From Side Voltage`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Voltage [pu]' },
              height: 300
            }}
          />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">To Side Voltage</Typography>
          <Plot
            data={[{
              x: results.t,
              y: results.v_magnitude.map(v => v[trafoIdx + 4]), // T1-T4 are connected to B5, B6, B11, B10
              type: 'scatter',
              mode: 'lines',
              name: 'Voltage [pu]'
            }]}
            layout={{
              title: `Transformer ${trafoIdx + 1} To Side Voltage`,
              xaxis: { title: 'Time [s]' },
              yaxis: { title: 'Voltage [pu]' },
              height: 300
            }}
          />
        </Paper>
      </Box>
    );
  };

  // Render line plots
  const renderLinePlots = (lineId) => {
    // Find the line in the network data
    const line = initialNetworkData.links.find(link => link.id === lineId);
    if (!line) return <Typography>Line not found</Typography>;
    
    // If no results or no line power flow data, show static information
    if (!results || !results.lines || !results.lines[lineId]) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Line Information</Typography>
            <Typography>Line ID: {lineId}</Typography>
            <Typography>
              From Bus: {typeof line.source === 'object' ? line.source.id : line.source}
            </Typography>
            <Typography>
              To Bus: {typeof line.target === 'object' ? line.target.id : line.target}
            </Typography>
            <Typography>
              Waiting for simulation results to show line power flow data...
            </Typography>
          </Paper>
        </Box>
      );
    }

    // With results, show dynamic data (power flow values)
    const lineData = results.lines[lineId];
    
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Line Information</Typography>
          <Typography>Line ID: {lineId}</Typography>
          <Typography>
            From Bus: {typeof line.source === 'object' ? line.source.id : line.source}
          </Typography>
          <Typography>
            To Bus: {typeof line.target === 'object' ? line.target.id : line.target}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Power Flow Data</Typography>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1">From Side:</Typography>
            <Typography>Active Power (P): {lineData.p_from.toFixed(3)} MW</Typography>
            <Typography>Reactive Power (Q): {lineData.q_from.toFixed(3)} MVAr</Typography>
          </Box>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1">To Side:</Typography>
            <Typography>Active Power (P): {lineData.p_to.toFixed(3)} MW</Typography>
            <Typography>Reactive Power (Q): {lineData.q_to.toFixed(3)} MVAr</Typography>
          </Box>
        </Paper>
      </Box>
    );
  };

  // Render monitored components list
  const renderMonitoredComponentsList = () => {
    if (monitoredComponents.length === 0) {
      return (
        <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic', mt: 1 }}>
          No components are being monitored. Select components to monitor during simulation.
        </Typography>
      );
    }

    return (
      <List dense sx={{ width: '100%', maxHeight: '200px', overflow: 'auto' }}>
        {monitoredComponents.map((component) => (
          <ListItem key={component.id}>
            <ListItemText 
              primary={component.label} 
              secondary={`Type: ${component.type}`} 
            />
            <ListItemSecondaryAction>
              <IconButton 
                edge="end" 
                aria-label="delete" 
                onClick={() => removeFromMonitored(component.id)}
              >
                <DeleteIcon />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth={false}
      disableEscapeKeyDown={false}
      hideBackdrop={true}
      style={{ 
        pointerEvents: 'none',
        position: 'fixed',
        right: 0,
        top: 60
      }} 
      PaperProps={{
        style: { 
          pointerEvents: 'auto',
          position: 'absolute',
          right: 20,
          width: 450,
          maxHeight: '90vh',
          overflowY: 'auto'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          Component Viewer
          {selectedComponent && (
            <Chip 
              label={selectedComponent.label}
              color="primary" 
              sx={{ ml: 2 }}
            />
          )}
        </Box>
        <IconButton onClick={() => setSelectedComponent(null)} disabled={!selectedComponent}>
          <ClearIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {!selectedComponent ? (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <Typography variant="h6" gutterBottom color="textSecondary">
              No component selected
            </Typography>
            <Typography color="textSecondary">
              Click on a component in the graph to view details
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" gutterBottom>Selected Component</Typography>
              <Button 
                variant="contained" 
                color={isMonitored ? "error" : "primary"}
                onClick={isMonitored ? () => removeFromMonitored(selectedComponent.id) : addToMonitored}
              >
                {isMonitored ? "Remove from Monitoring" : "Monitor During Simulation"}
              </Button>
            </Box>

            {/* Component Details */}
            <Box sx={{ mb: 3 }}>
              <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">Component Info</Typography>
                <Typography>Type: {selectedComponent.type.charAt(0).toUpperCase() + selectedComponent.type.slice(1)}</Typography>
                <Typography>ID: {selectedComponent.id}</Typography>
              </Paper>

              {/* Component plots */}
              {renderComponentPlot()}
            </Box>
          </>
        )}
        
        <Divider sx={{ my: 3 }} />
        
        {/* Monitored Components Section */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" gutterBottom>Monitored Components ({monitoredComponents.length})</Typography>
            {monitoredComponents.length > 0 && (
              <Button 
                variant="outlined" 
                color="error" 
                size="small"
                onClick={() => setMonitoredComponents([])}
              >
                Clear All
              </Button>
            )}
          </Box>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            These components will have detailed plots during simulation:
          </Typography>
          {renderMonitoredComponentsList()}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ComponentViewer; 
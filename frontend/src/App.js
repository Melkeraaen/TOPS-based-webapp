import React, { useState, useEffect, useRef } from 'react';
import { 
  Container, 
  Paper, 
  Typography,
  CircularProgress,
  Button,
  Box,
  Grid,
  Select,
  MenuItem
} from '@mui/material';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import PS_graph from './PS_graph';
import ResultsSection from './ResultsSection';
import ParameterControls from './ParameterControls';
import ComponentViewer from './ComponentViewer';

// Add a new ButtonPanel component right after PS_graph import
const ButtonPanel = ({ 
  saveParameters,
  handleStartSimulation,
  downloadExcel,
  loading,
  results,
  error,
  selectionMode,
  setSelectionMode,
  selectedComponent,
  monitoredComponents
}) => (
  <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
    <Button
      variant="contained"
      color="secondary"
      onClick={saveParameters}
      size="large"
    >
      Save Parameters
    </Button>
    <Button
      variant="contained"
      color="primary"
      onClick={handleStartSimulation}
      disabled={loading}
      size="large"
    >
      {loading ? <CircularProgress size={24} /> : 'Run Simulation'}
    </Button>
    {!loading && (
      <>
        <Button
          variant="outlined"
          color="primary"
          onClick={downloadExcel}
          disabled={!results}
          size="large"
        >
          Download Excel
        </Button>
        <Button
          variant={selectionMode ? "contained" : "outlined"}
          color={selectionMode ? "success" : "primary"}
          onClick={() => setSelectionMode(!selectionMode)}
          size="large"
        >
          {selectionMode ? "Exit Selection Mode" : "Component Selection"}
        </Button>
        {monitoredComponents.length > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Monitoring: {monitoredComponents.length} component{monitoredComponents.length !== 1 ? 's' : ''}
          </Typography>
        )}
      </>
    )}
    {error && (
      <Typography color="error">
        {error}
      </Typography>
    )}
  </Box>
);

const API_BASE_URL = 'http://127.0.0.1:8000/api';

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

// Power system network data
const initialNetworkData = {
  nodes: [
    // 20kV buses with generators
    { id: 'B1', name: 'B1', voltage: 20, group: 1, label: 'B1' },
    { id: 'B2', name: 'B2', voltage: 20, group: 1, label: 'B2' },
    { id: 'B3', name: 'B3', voltage: 20, group: 1, label: 'B3' },
    { id: 'B4', name: 'B4', voltage: 20, group: 1, label: 'B4' },
    // 230kV buses
    { id: 'B5', name: 'B5', voltage: 230, group: 2, label: 'B5' },
    { id: 'B6', name: 'B6', voltage: 230, group: 2, label: 'B6' },
    { id: 'B7', name: 'B7', voltage: 230, group: 2, label: 'B7' },
    { id: 'B8', name: 'B8', voltage: 230, group: 2, label: 'B8' },
    { id: 'B9', name: 'B9', voltage: 230, group: 2, label: 'B9' },
    { id: 'B10', name: 'B10', voltage: 230, group: 2, label: 'B10' },
    { id: 'B11', name: 'B11', voltage: 230, group: 2, label: 'B11' },
    // Generators
    { id: 'G1', name: 'G1', type: 'generator', label: 'G1' },
    { id: 'G2', name: 'G2', type: 'generator', label: 'G2' },
    { id: 'G3', name: 'G3', type: 'generator', label: 'G3' },
    { id: 'G4', name: 'G4', type: 'generator', label: 'G4' },
    // Loads
    { id: 'L1', name: 'L1', type: 'load', label: 'L1' },
    { id: 'L2', name: 'L2', type: 'load', label: 'L2' },
    // Shunts
    { id: 'C1', name: 'C1', type: 'shunt', label: 'C1' },
    { id: 'C2', name: 'C2', type: 'shunt', label: 'C2' },
    // Transformers as nodes
    { id: 'T1', name: 'T1', type: 'transformer', label: 'T1' },
    { id: 'T2', name: 'T2', type: 'transformer', label: 'T2' },
    { id: 'T3', name: 'T3', type: 'transformer', label: 'T3' },
    { id: 'T4', name: 'T4', type: 'transformer', label: 'T4' }
  ],
  links: [
    // Generators to buses
    { source: 'G1', target: 'B1', type: 'generator_connection' },
    { source: 'G2', target: 'B2', type: 'generator_connection' },
    { source: 'G3', target: 'B3', type: 'generator_connection' },
    { source: 'G4', target: 'B4', type: 'generator_connection' },
    // Loads to buses
    { source: 'L1', target: 'B7', type: 'load_connection' },
    { source: 'L2', target: 'B9', type: 'load_connection' },
    // Shunts to buses
    { source: 'C1', target: 'B7', type: 'shunt_connection' },
    { source: 'C2', target: 'B9', type: 'shunt_connection' },
    // Transformers connections (now through transformer nodes)
    { source: 'B1', target: 'T1', type: 'transformer', id: 'T1-1' },
    { source: 'T1', target: 'B5', type: 'transformer', id: 'T1-2' },
    { source: 'B2', target: 'T2', type: 'transformer', id: 'T2-1' },
    { source: 'T2', target: 'B6', type: 'transformer', id: 'T2-2' },
    { source: 'B3', target: 'T3', type: 'transformer', id: 'T3-1' },
    { source: 'T3', target: 'B11', type: 'transformer', id: 'T3-2' },
    { source: 'B4', target: 'T4', type: 'transformer', id: 'T4-1' },
    { source: 'T4', target: 'B10', type: 'transformer', id: 'T4-2' },
    // Lines (shown as black lines)
    { source: 'B5', target: 'B6', type: 'line', id: 'L5-6' },
    { source: 'B6', target: 'B7', type: 'line', id: 'L6-7' },
    { source: 'B7', target: 'B8', type: 'line', id: 'L7-8-1' },
    { source: 'B7', target: 'B8', type: 'line', id: 'L7-8-2' },
    { source: 'B8', target: 'B9', type: 'line', id: 'L8-9-1' },
    { source: 'B8', target: 'B9', type: 'line', id: 'L8-9-2' },
    { source: 'B9', target: 'B10', type: 'line', id: 'L9-10' },
    { source: 'B10', target: 'B11', type: 'line', id: 'L10-11' }
  ]
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
    // For complex numbers, calculate magnitude
    const magnitude = Math.sqrt(value.real * value.real + value.imag * value.imag);
    
    // For phasor quantities (voltages and currents), always return positive magnitude
    if (isPhasor) {
      return magnitude;
    }
    
    // For power and speed, preserve the sign based on the real part
    return value.real >= 0 ? magnitude : -magnitude;
  }
  
  // For real numbers
  if (typeof value === 'number') {
    // For phasor quantities, return absolute value
    if (isPhasor) {
      return Math.abs(value);
    }
    // For power and speed, preserve the sign
    return value;
  }
  
  return 0;
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

// Helper function to determine line flow direction
function getLineFlowDirectionSimple(busPower, fromIdx, toIdx) {
  // Guard for missing data
  if (!busPower || !Array.isArray(busPower) || fromIdx === -1 || toIdx === -1) return 0;

  // Find the index for Bus B8
  const bus8Idx = initialNetworkData.nodes.findIndex(n => n.id === 'B8');

  // Helper: is this bus neutral?
  const isNeutral = (p) => Math.abs(p) < 1e-4;
  
  // Helper function to find the deepest sink/weakest source using BFS
  function findDeepestSinkP(startIdx, excludeIdx) {
    const visited = new Set([excludeIdx]);
    const queue = [startIdx];
    let minP = Infinity; // Initialize minimum P found so far
    let foundNonNeutral = false;

    while (queue.length > 0) {
      const idx = queue.shift();
      if (visited.has(idx)) continue;
      visited.add(idx);
      
      const p = busPower[idx]?.p ?? 0;
      
      if (!isNeutral(p)) {
        minP = Math.min(minP, p); // Track the minimum P found
        foundNonNeutral = true;
      }
      
      // Add neighbors
      const nodeId = initialNetworkData.nodes[idx].id;
      const neighbors = initialNetworkData.links
        .filter(l => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          // Only consider neighbors that haven't been visited and are not the excluded node
          return (
            (sourceId === nodeId && !visited.has(initialNetworkData.nodes.findIndex(n => n.id === targetId))) || 
            (targetId === nodeId && !visited.has(initialNetworkData.nodes.findIndex(n => n.id === sourceId)))
          );
        })
        .map(l =>
          (typeof l.source === 'object' ? l.source.id : l.source) === nodeId
            ? initialNetworkData.nodes.findIndex(n => n.id === (typeof l.target === 'object' ? l.target.id : l.target))
            : initialNetworkData.nodes.findIndex(n => n.id === (typeof l.source === 'object' ? l.source.id : l.source))
        )
        .filter(i => i !== -1);
      
      queue.push(...neighbors);
    }
    return foundNonNeutral ? minP : null; // Return min P found, or null if no non-neutral node
  }

  // Function to determine direction using BFS
  const determineDirectionFromBFS = () => {
    const pFromSink = findDeepestSinkP(fromIdx, toIdx);
    const pToSink = findDeepestSinkP(toIdx, fromIdx);

    if (pFromSink !== null && pToSink !== null) {
      if (pFromSink < pToSink) return -1; // Flow toward fromIdx (deeper sink)
      if (pToSink < pFromSink) return 1;  // Flow toward toIdx (deeper sink)
      return 0;
    }
    if (pFromSink !== null) return -1; // Only from side found a sink/source
    if (pToSink !== null) return 1;  // Only to side found a sink/source
    return 0;
  };

  // --- Main Logic --- 
  
  // Special Case: If B8 is involved, always use BFS
  if (fromIdx === bus8Idx || toIdx === bus8Idx) {
    return determineDirectionFromBFS();
  }
  
  // --- Original Logic for non-B8 lines --- 
  const pFrom = busPower[fromIdx]?.p ?? 0;
  const pTo = busPower[toIdx]?.p ?? 0;

  // Case 1: Both are not neutral
  if (!isNeutral(pFrom) && !isNeutral(pTo)) {
    if (pFrom < pTo) return -1;
    if (pTo < pFrom) return 1;
    return 0;
  }

  // Case 2: One is neutral (and we know it's not B8 from the check above)
  if (isNeutral(pFrom) && !isNeutral(pTo)) {
    return pTo < 0 ? 1 : -1;
  }
  if (!isNeutral(pFrom) && isNeutral(pTo)) {
    return pFrom < 0 ? -1 : 1;
  }

  // Case 3: Both are neutral (and neither is B8)
  return determineDirectionFromBFS();
}

function App() {
  const graphRef = useRef();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [networkData, setNetworkData] = useState(initialNetworkData);
  const [simulationId, setSimulationId] = useState(null);
  const [graphWidth, setGraphWidth] = useState(window.innerWidth * 0.8);
  const [parameters, setParameters] = useState({
    step1: { time: 1.0, load_index: 0, g_setp: 0, b_setp: 0 },
    step2: { time: 2.0, load_index: 0, g_setp: 0, b_setp: 0 },
    lineOutage: { 
      enabled: true,
      outages: [
        { 
          lineId: '', 
          time: 1.0,
          reconnect: {
            enabled: false,
            time: 5.0
          }
        }
      ]
    },
    shortCircuit: { busId: '', startTime: 1.0, duration: 0.1, admittance: 1000000 },
    tapChanger: { 
      enabled: true,
      changes: [
        { transformerId: '0', time: 0, ratioChange: 1.0 }
      ]
    },
    noiseParams: {
      loads: {
        enabled: false,
        magnitude: 0.1,
        filter_time: 0.1
      },
      generators: {
        enabled: false,
        magnitude: 0.1,
        filter_time: 0.1
      }
    },
    pllParams: {
      enabled: false,
      pll1: {
        T_filter: 0.01
      },
      pll2: {
        K_p: 100,
        K_i: 100
      }
    }
  });
  const [loadChanges, setLoadChanges] = useState([]);
  const [simulationParams, setSimulationParams] = useState({
    t_end: 20,
    dt: 5e-3,
    line_outage: parameters.lineOutage,
    tap_changes: parameters.tapChanger.changes,
    load_changes: [parameters.step1, parameters.step2],
    noiseParams: parameters.noiseParams,
    pllParams: parameters.pllParams
  });
  const [powerFlows, setPowerFlows] = useState({});
  const [busPower, setBusPower] = useState(null);
  const [componentViewerOpen, setComponentViewerOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [monitoredComponents, setMonitoredComponents] = useState([]);

  // Update network data when line outage parameters change
  useEffect(() => {
    console.log('Line outages:', parameters.lineOutage.outages); // Debug log
    
    // Create new links array with fresh objects to avoid reference issues
    const currentLinks = initialNetworkData.links.map(link => ({ ...link }));

    // Reset all lines initially
    currentLinks.forEach(link => {
      link.dashed = false;
      link.selected = false;
    });

    // Mark outaged lines
    if (parameters.lineOutage.enabled && parameters.lineOutage.outages.length > 0) {
      parameters.lineOutage.outages.forEach(outage => {
        if (outage.lineId && outage.lineId !== '') {
          const lineLink = currentLinks.find(link => link.id === outage.lineId);
          if (lineLink) {
            lineLink.dashed = true;  // Mark the line as dashed
            lineLink.selected = true;  // Mark the line as selected
          }
        }
      });
    }

    setNetworkData({
      nodes: initialNetworkData.nodes,
      links: currentLinks
    });
  }, [parameters.lineOutage]);

  // Add useEffect to update graph width based on container size
  useEffect(() => {
    const updateWidth = () => {
      const container = document.querySelector('.graph-container');
      if (container) {
        setGraphWidth(container.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const handleParameterChange = (step, field, value) => {
    setParameters(prev => ({
      ...prev,
      [step]: {
        ...prev[step],
        [field]: field === 'lineId' ? value : (typeof value === 'string' ? parseFloat(value) || 0 : value)
      }
    }));
  };

  const saveParameters = async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/set_parameters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parameters)
      });

      if (!response.ok) {
        throw new Error('Failed to save parameters');
      }

      const data = await response.json();
      console.log('Parameters saved:', data);
    } catch (err) {
      setError('Failed to save parameters: ' + err.message);
    }
  };

  const downloadExcel = () => {
    if (!results) return;

    // Prepare data for Excel
    const data = results.t.map((time, index) => {
      const baseData = {
        'Time [s]': time.toFixed(3),
      };

      // Add individual bus voltage measurements
      results.v[index].forEach((v, busIdx) => {
        baseData[`Bus ${busIdx + 1} Voltage [pu]`] = formatComplex(v);
        baseData[`Bus ${busIdx + 1} Voltage Magnitude [pu]`] = results.v_magnitude[index][busIdx].toFixed(3);
        baseData[`Bus ${busIdx + 1} Voltage Angle [deg]`] = (results.v_angle[index][busIdx] * 180/Math.PI).toFixed(3);
      });

      // Add individual generator measurements
      results.gen_speed[index].forEach((speed, genIdx) => {
        baseData[`Generator ${genIdx + 1} Speed [pu]`] = speed.toFixed(3);
        baseData[`Generator ${genIdx + 1} Current [A]`] = formatComplex(results.gen_I[index][genIdx]);
      });

      // Add individual load measurements
      results.load_I[index].forEach((current, loadIdx) => {
        baseData[`Load ${loadIdx + 1} Current [A]`] = formatComplex(current);
        baseData[`Load ${loadIdx + 1} Active Power [MW]`] = formatComplex(results.load_P[index][loadIdx]);
        baseData[`Load ${loadIdx + 1} Reactive Power [MVAr]`] = formatComplex(results.load_Q[index][loadIdx]);
      });

      // Add individual transformer measurements
      results.trafo_current_from[index].forEach((current, trafoIdx) => {
        baseData[`Transformer ${trafoIdx + 1} Current From [A]`] = formatComplex(current);
        baseData[`Transformer ${trafoIdx + 1} Current To [A]`] = formatComplex(results.trafo_current_to[index][trafoIdx]);
      });

      // Add PLL data if available
      if (parameters.pllParams.enabled && results.pll1_angle && results.pll2_angle) {
        results.pll1_angle[index].forEach((angle, pllIdx) => {
          baseData[`PLL1 Bus ${pllIdx + 1} Angle [deg]`] = (angle * 180/Math.PI).toFixed(3);
          baseData[`PLL2 Bus ${pllIdx + 1} Angle [deg]`] = (results.pll2_angle[index][pllIdx] * 180/Math.PI).toFixed(3);
          baseData[`PLL1 Bus ${pllIdx + 1} Frequency [Hz]`] = results.pll1_freq[index][pllIdx].toFixed(3);
          baseData[`PLL2 Bus ${pllIdx + 1} Frequency [Hz]`] = results.pll2_freq[index][pllIdx].toFixed(3);
        });
      }

      return baseData;
    });

    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Simulation Results');

    // Auto-adjust column widths
    const max_width = 100; // Maximum column width in characters
    const min_width = 10;  // Minimum column width in characters
    const colWidths = {};
    
    // Calculate maximum width for each column
    Object.keys(data[0]).forEach((key, index) => {
      // Get the column letter (A, B, C, etc.)
      const colLetter = XLSX.utils.encode_col(index);
      
      // Calculate width based on header and data
      const headerWidth = key.length;
      const dataWidth = Math.max(...data.map(row => {
        const value = row[key];
        return value ? value.toString().length : 0;
      }));
      
      // Set column width (add some padding)
      const width = Math.min(Math.max(headerWidth, dataWidth) + 2, max_width);
      colWidths[colLetter] = { wch: Math.max(width, min_width) };
    });

    // Apply column widths
    ws['!cols'] = Object.values(colWidths);

    // Save file
    XLSX.writeFile(wb, 'simulation_results.xlsx');
  };

  const handleStartSimulation = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Prepare simulation parameters
      const simulationParamsToSend = {
        ...parameters,  // Send all parameters directly
        t_end: 20,
        dt: 5e-3
      };

      console.log('Starting simulation with parameters:', simulationParamsToSend);

      // Start the simulation
      const response = await fetch(`${API_BASE_URL}/start_simulation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(simulationParamsToSend),
      });

      const data = await response.json();
      
      if (!response.ok) {
        // Handle validation errors from the backend with specific messages
        throw new Error(data.message || 'Failed to start simulation. Please check your parameters.');
      }

      console.log('Simulation started with ID:', data.simulation_id);
      setSimulationId(data.simulation_id);

      // Initialize empty results
      setResults({
        t: [],
        x: [],
        v: [],
        gen_speed: [],
        gen_I: [],
        load_I: [],
        load_P: [],
        load_Q: [],
        trafo_current_from: [],
        trafo_current_to: [],
        v_angle: [],
        pll1_angle: [],
        pll2_angle: [],
        pll1_freq: [],
        pll2_freq: [],
        eigenvalues: {
          real: [],
          imag: [],
          mode_shape: {
            magnitude: [],
            angle: []
          }
        }
      });

      // Set up SSE connection for real-time updates
      const eventSource = new EventSource(`${API_BASE_URL}/simulation_updates`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'init') {
          console.log('Simulation initialized:', data.data);
        } 
        else if (data.type === 'step') {
          // Log all step data when PLL is enabled
          if (parameters.pllParams.enabled) {
            console.log('Step data received:', {
              time: data.data.t,
              data_keys: Object.keys(data.data),
              pll_data: {
                v_angle: data.data.v_angle,
                pll1_angle: data.data.pll1_angle,
                pll2_angle: data.data.pll2_angle,
                pll1_freq: data.data.pll1_freq,
                pll2_freq: data.data.pll2_freq
              }
            });
          }
          
          // Update results with new step data
          setResults(prevResults => {
            const newResults = { ...prevResults };
            
            // Initialize arrays if they don't exist
            if (parameters.pllParams.enabled) {
              ['v_angle', 'pll1_angle', 'pll2_angle', 'pll1_freq', 'pll2_freq'].forEach(key => {
                if (!Array.isArray(newResults[key])) {
                  newResults[key] = [];
                }
              });
            }
            
            // Check if this time point already exists
            const timePoint = data.data.t;
            const existingTimeIndex = newResults.t ? newResults.t.indexOf(timePoint) : -1;
            
            if (existingTimeIndex !== -1) {
              // Skip this update as we already have data for this time point
              return newResults;
            }
            
            // Append new data to each array
            for (const key in data.data) {
              // Skip undefined or null values
              if (data.data[key] === undefined || data.data[key] === null) {
                console.warn(`Missing data for '${key}'`);
                continue;
              }
              
              if (Array.isArray(newResults[key])) {
                newResults[key].push(data.data[key]);
              } else if (key === 't') {
                // Special handling for time array
                if (!Array.isArray(newResults[key])) {
                  newResults[key] = [];
                }
                newResults[key].push(data.data[key]);
              } else {
                newResults[key] = data.data[key];
              }
            }
            
            // Sort data by time to ensure correct plotting
            if (newResults.t && newResults.t.length > 1) {
              const indices = Array.from(newResults.t.keys()).sort((a, b) => newResults.t[a] - newResults.t[b]);
              
              // Reorder all arrays based on sorted time
              for (const key in newResults) {
                if (Array.isArray(newResults[key]) && key !== 't') {
                  newResults[key] = indices.map(i => newResults[key][i]);
                }
              }
              // Sort time array last
              newResults.t = indices.map(i => newResults.t[i]);
            }
            
            return newResults;
          });
        } 
        else if (data.type === 'error') {
          console.error('Simulation error:', data.data);
          setError(data.data);
          eventSource.close();
          setLoading(false);
        }
        else if (data.type === 'complete') {
          console.log('Simulation completed! Final results:', data.data);
          eventSource.close();
          setLoading(false);
          setResults(data.data); // <-- Add this line to update results immediately
          // Remove the outaged line after simulation completes
          if (parameters.lineOutage.outages.length > 0) {
            setNetworkData(prev => ({
              ...prev,
              links: prev.links.filter(link => !parameters.lineOutage.outages.some(outage => link.id === outage.lineId))
            }));
          }
          // Trigger a final fetch of results
          if (simulationId) {
            console.log('Triggering final fetch of results after completion...');
            fetchResultsForDebug(simulationId);
          }
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        setError('Connection to simulation server lost');
        eventSource.close();
        setLoading(false);
      };
      
    } catch (err) {
      console.error('Simulation error:', err);
      setError(err.message || 'Failed to run simulation. Please check your parameters.');
      setLoading(false);
    }
  };

  const handleTapChangerChange = (index, field, value) => {
    setParameters(prev => ({
      ...prev,
      tapChanger: {
        ...prev.tapChanger,
        changes: prev.tapChanger.changes.map((change, i) =>
          i === index ? { ...change, [field]: value } : change
        )
      }
    }));
  };

  const handleLineOutageChange = (index, field, value) => {
    setParameters(prev => ({
      ...prev,
      lineOutage: {
        ...prev.lineOutage,
        outages: prev.lineOutage.outages.map((outage, i) =>
          i === index ? { ...outage, [field]: value } : outage
        )
      }
    }));
  };

  // Add new handler for reconnection settings
  const handleReconnectChange = (index, field, value) => {
    setParameters(prev => ({
      ...prev,
      lineOutage: {
        ...prev.lineOutage,
        outages: prev.lineOutage.outages.map((outage, i) =>
          i === index ? { 
            ...outage, 
            reconnect: { 
              ...outage.reconnect, 
              [field]: value 
            } 
          } : outage
        )
      }
    }));
  };

  const handleRemoveLineOutage = (index) => {
    setParameters(prev => ({
      ...prev,
      lineOutage: {
        ...prev.lineOutage,
        outages: prev.lineOutage.outages.filter((_, i) => i !== index)
      }
    }));
  };

  const handleAddLineOutage = () => {
    setParameters(prev => ({
      ...prev,
      lineOutage: {
        ...prev.lineOutage,
        outages: [...prev.lineOutage.outages, { lineId: '', time: 1.0, reconnect: { enabled: false, time: 5.0 } }]
      }
    }));
  };

  const handleRemoveTapChange = (index) => {
    setParameters(prev => ({
      ...prev,
      tapChanger: {
        ...prev.tapChanger,
        changes: prev.tapChanger.changes.filter((_, i) => i !== index)
      }
    }));
  };

  const handleAddTapChange = () => {
    setParameters(prev => ({
      ...prev,
      tapChanger: {
        ...prev.tapChanger,
        changes: [...prev.tapChanger.changes, { transformerId: '0', time: 0, ratioChange: 1.0 }]
      }
    }));
  };

  // Update the useEffect that fetches simulation results
  useEffect(() => {
    if (simulationId) {
      const fetchResults = async () => {
        try {
          console.log('Fetching results for simulation:', simulationId);
          const response = await fetch(`http://localhost:5000/api/simulation/${simulationId}/results`);
          if (!response.ok) throw new Error('Failed to fetch results');
          const data = await response.json();
          
          // Process power flow data
          if (data && data.lines) {
            console.log('Processing power flow data...');
            const flows = {};
            Object.entries(data.lines).forEach(([lineId, lineData]) => {
              flows[lineId] = {
                p_from: lineData.p_from || 0,
                p_to: lineData.p_to || 0,
                q_from: lineData.q_from || 0,
                q_to: lineData.q_to || 0
              };
            });
            setPowerFlows(flows);
            console.log('Power flow data processed:', flows);
          }
          
          setResults(data);
          setLoading(false);
          console.log('Simulation completed successfully! Results:', data);
        } catch (error) {
          console.error('Error fetching results:', error);
          setLoading(false);
        }
      };
      fetchResults();
    }
  }, [simulationId]);

  // Add a helper function for final fetch and debugging
  const fetchResultsForDebug = async (simId) => {
    try {
      console.log('Final fetch for simulation:', simId);
      const response = await fetch(`http://localhost:5000/api/simulation/${simId}/results`);
      if (!response.ok) throw new Error('Failed to fetch results');
      const data = await response.json();
      setResults(data);
      if (data && data.lines) {
        const flows = {};
        Object.entries(data.lines).forEach(([lineId, lineData]) => {
          flows[lineId] = {
            p_from: lineData.p_from || 0,
            p_to: lineData.p_to || 0,
            q_from: lineData.q_from || 0,
            q_to: lineData.q_to || 0
          };
        });
        setPowerFlows(flows);
        console.log('Final powerFlows:', flows);
        // Debug: log networkData.links and getPowerFlowInfo for each link
        if (networkData && networkData.links) {
          console.log('Network links:', networkData.links.map(l => l.id));
          networkData.links.forEach(link => {
            const info = getPowerFlowInfo(link, flows);
            console.log(`Link ${link.id}:`, info);
          });
        }
      }
    } catch (error) {
      console.error('Error in final fetchResultsForDebug:', error);
    }
  };

  // Add this effect to update powerFlows only when results.lines is available
  useEffect(() => {
    if (results && results.lines) {
      setPowerFlows(results.lines);
      console.log('Final power flow analysis matrix:', results.lines);
    }
  }, [results]);

  // Update busPower when results.bus_power is available
  useEffect(() => {
    if (results && results.bus_power) {
      setBusPower(results.bus_power);
      console.log('Final bus power injections:', results.bus_power);
    }
  }, [results]);

  // Helper to get the nearest generator P value along the path
  function getNearestGeneratorP(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const node = initialNetworkData.nodes.find(n => n.id === nodeId);
    if (!node) return 0;
    if (node.id.startsWith('G')) {
      const idx = initialNetworkData.nodes.findIndex(n => n.id === nodeId);
      return busPower[idx]?.p ?? 0;
    }
    // Find all links connected to this node
    const connectedLinks = initialNetworkData.links.filter(
      l => (typeof l.source === 'object' ? l.source.id : l.source) === nodeId ||
           (typeof l.target === 'object' ? l.target.id : l.target) === nodeId
    );
    // Recursively search connected nodes
    for (const link of connectedLinks) {
      const otherId = (typeof link.source === 'object' ? link.source.id : link.source) === nodeId
        ? (typeof link.target === 'object' ? link.target.id : link.target)
        : (typeof link.source === 'object' ? link.source.id : link.source);
      const p = getNearestGeneratorP(otherId, visited);
      if (Math.abs(p) > 1e-4) return p;
    }
    return 0;
  }

  // Helper to get the nearest bus P value along the path (fallback)
  function getNearestBusP(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const node = initialNetworkData.nodes.find(n => n.id === nodeId);
    if (!node) return 0;
    if (node.id.startsWith('B')) {
      const idx = initialNetworkData.nodes.findIndex(n => n.id === nodeId);
      return busPower[idx]?.p ?? 0;
    }
    // Find all links connected to this node
    const connectedLinks = initialNetworkData.links.filter(
      l => (typeof l.source === 'object' ? l.source.id : l.source) === nodeId ||
           (typeof l.target === 'object' ? l.target.id : l.target) === nodeId
    );
    // Recursively search connected nodes
    for (const link of connectedLinks) {
      const otherId = (typeof link.source === 'object' ? link.source.id : link.source) === nodeId
        ? (typeof link.target === 'object' ? link.target.id : link.target)
        : (typeof link.source === 'object' ? link.source.id : link.source);
      const p = getNearestBusP(otherId, visited);
      if (Math.abs(p) > 1e-4) return p;
    }
    return 0;
  }

  // Helper to check if a power injection is neutral (robust to floating-point noise)
  const isNeutral = (p) => Math.abs(p) < 1e-4;

  // BFS version: search nearest non-neutral P
  function getNearestNonNeutralP(nodeId, excludeId) {
    const queue = [nodeId];
    const visited = new Set([excludeId]);
    
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const nodeIdx = initialNetworkData.nodes.findIndex(n => n.id === currentId);
      if (nodeIdx === -1) continue;
      const p = busPower[nodeIdx]?.p ?? 0;
      if (!isNeutral(p)) return p;  // Found a real generator or load

      // Expand neighbors
      const connectedLinks = initialNetworkData.links.filter(
        l => (typeof l.source === 'object' ? l.source.id : l.source) === currentId ||
             (typeof l.target === 'object' ? l.target.id : l.target) === currentId
      );

      for (const link of connectedLinks) {
        const otherId = (typeof link.source === 'object' ? link.source.id : link.source) === currentId
          ? (typeof link.target === 'object' ? link.target.id : link.target)
          : (typeof link.source === 'object' ? link.source.id : link.source);
        if (!visited.has(otherId)) {
          queue.push(otherId);
        }
      }
    }
    return null; // No non-neutral found
  }

  // If both are neutral, walk the network to find the deepest sink/weakest source
  function findDeepestSinkP(startIdx, excludeIdx) {
    const visited = new Set([excludeIdx]);
    const queue = [startIdx];
    let minP = Infinity; // Initialize minimum P found so far
    let foundNonNeutral = false;

    while (queue.length > 0) {
      const idx = queue.shift();
      if (visited.has(idx)) continue;
      visited.add(idx);
      
      const p = busPower[idx]?.p ?? 0;
      
      if (!isNeutral(p)) {
        minP = Math.min(minP, p); // Track the minimum P found
        foundNonNeutral = true;
      }
      
      // Add neighbors
      const nodeId = initialNetworkData.nodes[idx].id;
      const neighbors = initialNetworkData.links
        .filter(l => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return (
            (sourceId === nodeId && !visited.has(initialNetworkData.nodes.findIndex(n => n.id === targetId))) || 
            (targetId === nodeId && !visited.has(initialNetworkData.nodes.findIndex(n => n.id === sourceId)))
          );
        })
        .map(l =>
          (typeof l.source === 'object' ? l.source.id : l.source) === nodeId
            ? initialNetworkData.nodes.findIndex(n => n.id === (typeof l.target === 'object' ? l.target.id : l.target))
            : initialNetworkData.nodes.findIndex(n => n.id === (typeof l.source === 'object' ? l.source.id : l.source))
        )
        .filter(i => i !== -1);
      
      queue.push(...neighbors);
    }
    return foundNonNeutral ? minP : null; // Return min P found, or null if no non-neutral node
  }

  // Process links so that for dir < 0, source and target are swapped
  const processedLinks = networkData.links.map(link => {
    const fromId = typeof link.source === 'object' ? link.source.id : link.source;
    const toId = typeof link.target === 'object' ? link.target.id : link.target;
    const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
    const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
    const dir = getLineFlowDirectionSimple(busPower, fromIdx, toIdx);
    if (dir < 0) {
      return { ...link, source: link.target, target: link.source };
    }
    return link;
  });

  return (
    <Container maxWidth="xl">
      <Paper sx={{ p: 4, mb: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ mb: 4, fontWeight: 500, textAlign: 'center' }}>
          Power System Simulator
        </Typography>
        
        {selectionMode && (
          <Box 
            sx={{ 
              position: 'absolute', 
              top: 10, 
              right: 10, 
              zIndex: 2000 
            }}
          >
            <Typography variant="body2" color="primary" fontWeight="bold" sx={{ mb: 1 }}>
              {selectedComponent ? `Selected: ${selectedComponent.label}` : 'Click a component to select it'}
            </Typography>
          </Box>
        )}
        
        <PS_graph
          graphRef={graphRef}
          networkData={networkData}
          busPower={results?.bus_power}
          powerFlows={results?.power_flows}
          initialNetworkData={initialNetworkData}
          graphWidth={graphWidth}
          getLineFlowDirectionSimple={(fromIdx, toIdx) => getLineFlowDirectionSimple(busPower, fromIdx, toIdx)}
          parameters={parameters}
          selectionMode={selectionMode}
          onComponentSelect={(component) => {
            setSelectedComponent(component);
            // Toggle component in monitored components list
            if (component) {
              setMonitoredComponents(prev => {
                // If component is already monitored, remove it
                if (prev.some(comp => comp.id === component.id)) {
                  return prev.filter(comp => comp.id !== component.id);
                }
                // Otherwise add it to monitored components
                return [...prev, component];
              });
            }
          }}
          selectedComponent={selectedComponent}
          monitoredComponents={monitoredComponents}
        />

        {/* Pass the required props to ButtonPanel */}
        <ButtonPanel
          saveParameters={saveParameters}
          handleStartSimulation={handleStartSimulation}
          downloadExcel={downloadExcel}
          loading={loading}
          results={results}
          error={error}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          selectedComponent={selectedComponent}
          monitoredComponents={monitoredComponents}
        />

        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
          <Grid container spacing={3}>
            {/* Top Section: Parameter Controls */}
            <Grid item xs={12}>
              <ParameterControls 
                parameters={parameters} 
                setParameters={setParameters}
                handleParameterChange={handleParameterChange}
                handleTapChangerChange={handleTapChangerChange}
                handleLineOutageChange={handleLineOutageChange}
                handleReconnectChange={handleReconnectChange}
                handleRemoveLineOutage={handleRemoveLineOutage}
                handleAddLineOutage={handleAddLineOutage}
                handleRemoveTapChange={handleRemoveTapChange}
                handleAddTapChange={handleAddTapChange}
              />
            </Grid>
          </Grid>
        </Container>
      </Paper>

      {results && (
        <ResultsSection
          results={results}
          parameters={parameters}
          initialNetworkData={initialNetworkData}
          busPower={results.bus_power}
          getLineFlowDirectionSimple={(fromIdx, toIdx) => getLineFlowDirectionSimple(busPower, fromIdx, toIdx)}
          monitoredComponents={monitoredComponents}
          onRemoveComponent={(id) => {
            setMonitoredComponents(prev => prev.filter(comp => comp.id !== id));
          }}
        />
      )}
    </Container>
  );
}

export default App;
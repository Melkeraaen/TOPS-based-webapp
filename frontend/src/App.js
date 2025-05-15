// Main application component for power system simulation and visualization
// Handles network data, simulation parameters, and user interactions

import React, { useState, useEffect, useRef } from 'react';
import { 
  Container, 
  Paper, 
  Typography,
  CircularProgress,
  Button,
  Box,
  Grid,
  TextField
} from '@mui/material';
import * as XLSX from 'xlsx';
import PS_graph from './PS_graph';
import ResultsSection from './ResultsSection';
import ParameterControls from './ParameterControls';

// Control panel component for simulation actions and parameter management
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

// API configuration
const API_BASE_URL = 'http://127.0.0.1:8000/api';

// Network topology definition
// Defines the power system structure including buses, generators, loads, and connections
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

// Utility function to format complex numbers for display
// Converts complex numbers to string representation with 3 decimal places
const formatComplex = (value) => {
  if (value && typeof value === 'object' && 'real' in value && 'imag' in value) {
    const real = value.real.toFixed(3);
    const imag = Math.abs(value.imag).toFixed(3);
    const sign = value.imag >= 0 ? '+' : '-';
    return `${real} ${sign} ${imag}j`;
  }
  return typeof value === 'number' ? value.toFixed(3) : '0.000';
};

// Utility function to calculate magnitude of complex values
// Handles both phasor quantities (voltages/currents) and power/speed values
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

// Determines power flow direction in transmission lines
// Uses breadth-first search to find the deepest sink in the network
function getLineFlowDirectionSimple(busPower, fromIdx, toIdx, outagedLineIds = []) {
  if (!busPower || !Array.isArray(busPower) || fromIdx === -1 || toIdx === -1) return 0;

  const isNeutral = (p) => Math.abs(p) < 1e-4;

  function findDeepestSinkP(startIdx, excludeIdx) {
    const visited = new Set([excludeIdx]);
    const queue = [{ idx: startIdx, prev: null }];
    let minP = Infinity;
    let foundNonNeutral = false;

    while (queue.length > 0) {
      const { idx, prev } = queue.shift();
      if (visited.has(idx)) continue;
      visited.add(idx);
      const p = busPower[idx]?.p ?? 0;
      if (!isNeutral(p) && p < 0) {
        minP = Math.min(minP, p);
        foundNonNeutral = true;
      }
      const nodeId = initialNetworkData.nodes[idx].id;
      const neighbors = initialNetworkData.links
        .filter(l => {
          if (l.id && outagedLineIds.includes(l.id)) return false; // skip cut lines
          if (l.type !== 'line' && l.type !== 'transformer') return false;
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          // Find the neighbor index
          const neighborId = sourceId === nodeId ? targetId : targetId === nodeId ? sourceId : null;
          if (!neighborId) return false;
          const neighborIdx = initialNetworkData.nodes.findIndex(n => n.id === neighborId);
          // Don't go back to the previous node (prevents parallel line bounce)
          if (neighborIdx === prev) return false;
          // Don't revisit already visited nodes
          if (visited.has(neighborIdx)) return false;
          return true;
        })
        .map(l => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          const neighborId = sourceId === nodeId ? targetId : targetId === nodeId ? sourceId : null;
          return initialNetworkData.nodes.findIndex(n => n.id === neighborId);
        })
        .filter(i => i !== -1);
      neighbors.forEach(neighborIdx => {
        queue.push({ idx: neighborIdx, prev: idx });
      });
    }
    return foundNonNeutral ? minP : null;
  }

  const minP_from = findDeepestSinkP(fromIdx, toIdx);
  const minP_to = findDeepestSinkP(toIdx, fromIdx);

  if (minP_from !== null && minP_to !== null) {
    if (minP_from < minP_to) return -1;
    if (minP_to < minP_from) return 1;
    return 0;
  }
  if (minP_from !== null) return -1;
  if (minP_to !== null) return 1;
  return 0;
}

function App() {
  const graphRef = useRef();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [networkData, setNetworkData] = useState(initialNetworkData);
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
    t_end: 20
  });
  const [tEndInput, setTEndInput] = useState('');
  const [busPower, setBusPower] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [monitoredComponents, setMonitoredComponents] = useState([]);
  const [islandData, setIslandData] = useState(null);

  // Helper to display empty string if tEndInput is empty, otherwise the number
  const tEndInputDisplay = tEndInput === undefined || tEndInput === null || tEndInput === '' ? '' : tEndInput;

  // Update network data when line outage parameters change
  useEffect(() => {
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
    if (step === 't_end') {
      setParameters(prev => {
        const newParams = { ...prev, t_end: value };
        return newParams;
      });
      return;
    }
    setParameters(prev => ({
      ...prev,
      [step]: {
        ...prev[step],
        [field]: field === 'lineId' ? value : (
          typeof value === 'string' ? 
            (value === '' ? 0 : isNaN(parseFloat(value)) ? 0 : parseFloat(value)) 
            : value
        )
      }
    }));
  };

  const saveParameters = async () => {
    // Use 20 if tEndInput is empty, otherwise use the entered value
    const t_end_to_save = tEndInput === '' ? 20 : tEndInput;
    setParameters(prev => {
      const updated = { ...prev, t_end: t_end_to_save };
      setTimeout(async () => {
        try {
          setError(null);
          const response = await fetch(`${API_BASE_URL}/set_parameters`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updated)
          });
          if (!response.ok) {
            throw new Error('Failed to save parameters');
          }
          await response.json();
        } catch (err) {
          setError('Failed to save parameters: ' + err.message);
        }
      }, 0);
      return updated;
    });
    return;
  };

  const downloadExcel = () => {
    if (!results) return;

    // Prepare data for main simulation results (time series)
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

      return baseData;
    });

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

    // === 1. Eigenvalues & Modes Sheet ===
    if (results.eigenvalues && results.eigenvalues.real && results.eigenvalues.real.length > 0) {
      const eigenSheet = [];
      // Eigenvalues summary
      eigenSheet.push({
        'Eigenvalue #': 'Index',
        'Real': 'Real',
        'Imag': 'Imag',
        'Frequency [Hz]': 'Frequency [Hz]',
        'Damping [%]': 'Damping [%]'
      });
      for (let i = 0; i < results.eigenvalues.real.length; ++i) {
        eigenSheet.push({
          'Eigenvalue #': i + 1,
          'Real': results.eigenvalues.real[i],
          'Imag': results.eigenvalues.imag[i],
          'Frequency [Hz]': results.eigenvalues.frequency ? results.eigenvalues.frequency[i] : '',
          'Damping [%]': results.eigenvalues.damping ? results.eigenvalues.damping[i] : ''
        });
      }
      // Mode shapes (if available)
      if (results.eigenvalues.mode_shapes && results.eigenvalues.mode_shapes.magnitude && results.eigenvalues.mode_shapes.angle) {
        eigenSheet.push({});
        eigenSheet.push({'Eigenvalue #': 'Mode Shapes (Magnitude/Angle for each Generator)'});
        const numModes = results.eigenvalues.mode_shapes.magnitude[0]?.length || 0;
        const numGens = results.eigenvalues.mode_shapes.magnitude.length;
        for (let mode = 0; mode < numModes; ++mode) {
          for (let gen = 0; gen < numGens; ++gen) {
            eigenSheet.push({
              'Eigenvalue #': `Mode ${mode + 1} - Gen ${gen + 1}`,
              'Real': results.eigenvalues.mode_shapes.magnitude[gen][mode],
              'Imag': results.eigenvalues.mode_shapes.angle[gen][mode]
            });
          }
        }
      }
      const wsEigen = XLSX.utils.json_to_sheet(eigenSheet);
      XLSX.utils.book_append_sheet(wb, wsEigen, 'Eigenvalues & Modes');
    }

    // === 2. Bus Power Comparison Sheet ===
    if (results.bus_power_raw && busPower && busPower.length > 0) {
      const busPowerSheet = [];
      busPowerSheet.push({
        'Bus': 'Bus',
        'Initial P (raw)': 'Initial P (raw)',
        'Initial Q (raw)': 'Initial Q (raw)',
        'Final P': 'Final P',
        'Final Q': 'Final Q'
      });
      // Parse raw injections
      const parseRaw = val => {
        const match = val.match(/\(([-+]?\d+\.?\d*)([-+]\d+\.?\d*)j\)/);
        if (match) {
          return { real: parseFloat(match[1]), imag: parseFloat(match[2]) };
        }
        return { real: 0, imag: 0 };
      };
      for (let i = 0; i < busPower.length; ++i) {
        const busId = initialNetworkData.nodes[i]?.id || (i + 1);
        const raw = results.bus_power_raw && results.bus_power_raw[i] ? parseRaw(results.bus_power_raw[i]) : { real: '', imag: '' };
        const final = busPower[i] || { p: '', q: '' };
        busPowerSheet.push({
          'Bus': busId,
          'Initial P (raw)': raw.real,
          'Initial Q (raw)': raw.imag,
          'Final P': final.p,
          'Final Q': final.q
        });
      }
      const wsBusPower = XLSX.utils.json_to_sheet(busPowerSheet);
      XLSX.utils.book_append_sheet(wb, wsBusPower, 'Bus Power Comparison');
    }

    // === 3. Islands Sheet ===
    if (results.gen_speed && results.gen_speed.length > 0 && islandData) {
      const { islands, genMapping, frequencies } = islandData;
      
      const islandSheet = [];
      islandSheet.push({
        'Island #': 'Island #',
        'Buses': 'Buses',
        'Generators': 'Generators',
        'Frequency [Hz]': 'Frequency [Hz]'
      });
      islands.forEach((island, idx) => {
        const buses = Array.from(island).join(', ');
        const generators = Object.entries(genMapping)
          .filter(([_, islandId]) => islandId === idx)
          .map(([genId]) => `G${parseInt(genId) + 1}`)
          .join(', ');
        islandSheet.push({
          'Island #': idx + 1,
          'Buses': buses,
          'Generators': generators,
          'Frequency [Hz]': frequencies[idx]?.toFixed(3)
        });
      });
      const wsIslands = XLSX.utils.json_to_sheet(islandSheet);
      XLSX.utils.book_append_sheet(wb, wsIslands, 'Islands');
    }

    // === 4. Power Flow Directions Sheet ===
    if (results && results.bus_power && networkData && networkData.links) {
      const powerFlowSheet = [];
      // Add 2 empty rows for margin
      powerFlowSheet.push({}, {});
      powerFlowSheet.push({
        'Line': 'Line',
        'From Bus': 'From Bus',
        'To Bus': 'To Bus',
        'From Bus P (MW)': 'From Bus P (MW)',
        'To Bus P (MW)': 'To Bus P (MW)',
        'Direction': 'Direction'
      });
      networkData.links.filter(l => l.type === 'line' || l.type === 'transformer').forEach((link, idx) => {
        const fromId = typeof link.source === 'object' ? link.source.id : link.source;
        const toId = typeof link.target === 'object' ? link.target.id : link.target;
        const fromIdx = initialNetworkData.nodes.findIndex(n => n.id === fromId);
        const toIdx = initialNetworkData.nodes.findIndex(n => n.id === toId);
        const fromP = results.bus_power[fromIdx]?.p ?? 0;
        const toP = results.bus_power[toIdx]?.p ?? 0;
        let dirText = '-';
        if (fromP > toP) dirText = `towards bus ${toId}`;
        else if (toP > fromP) dirText = `towards bus ${fromId}`;
        powerFlowSheet.push({
          'Line': link.id || `${fromId}-${toId}`,
          'From Bus': fromId,
          'To Bus': toId,
          'From Bus P (MW)': fromP.toFixed(3),
          'To Bus P (MW)': toP.toFixed(3),
          'Direction': dirText
        });
      });
      // Add 2 empty rows for margin
      powerFlowSheet.push({}, {});
      const wsPowerFlow = XLSX.utils.json_to_sheet(powerFlowSheet, { skipHeader: true });
      XLSX.utils.book_append_sheet(wb, wsPowerFlow, 'Power Flow Directions');
    }

    // Add 2 empty rows for margin to all other sheets
    function addSheetMargins(ws) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      // Insert 2 empty rows at the top
      for (let i = 0; i < 2; ++i) {
        XLSX.utils.sheet_add_json(ws, [{}], { skipHeader: true, origin: -1 });
      }
      // Insert 2 empty rows at the bottom
      for (let i = 0; i < 2; ++i) {
        XLSX.utils.sheet_add_json(ws, [{}], { skipHeader: true, origin: { r: range.e.r + 3 + i, c: 0 } });
      }
    }
    // Add margins to all sheets
    Object.values(wb.Sheets).forEach(addSheetMargins);

    // Save file
    XLSX.writeFile(wb, 'simulation_results.xlsx');
  };

  const handleStartSimulation = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/start_simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parameters)
      });

      const data = await response.json();
      
      if (!response.ok) {
        // Handle validation errors from the backend with specific messages
        throw new Error(data.message || 'Failed to start simulation. Please check your parameters.');
      }

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
        } 
        else if (data.type === 'step') {
          // Update results with new step data
          setResults(prevResults => {
            const newResults = { ...prevResults };
            
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
          setError(data.data);
          eventSource.close();
          setLoading(false);
        }
        else if (data.type === 'complete') {
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
        }
      };
      
      eventSource.onerror = (error) => {
        setError('Connection to simulation server lost');
        eventSource.close();
        setLoading(false);
      };
      
    } catch (err) {
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

  // Update busPower when results.bus_power is available
  useEffect(() => {
    if (results && results.bus_power) {
      setBusPower(results.bus_power);
    }
  }, [results]);

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
          powerFlows={results?.lines}
          initialNetworkData={initialNetworkData}
          graphWidth={graphWidth}
          getLineFlowDirectionSimple={(fromIdx, toIdx) => getLineFlowDirectionSimple(busPower, fromIdx, toIdx, parameters.lineOutage?.outages?.map(o => o.lineId).filter(Boolean) || [])}
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

        {/* Row with t_end input and buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, mt: -2, justifyContent: 'center' }}>
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
          <TextField
            label=""
            placeholder="Simulation time (s)"
            type="number"
            size="small"
            value={tEndInputDisplay}
            onChange={e => {
              const value = e.target.value;
              if (value === '') {
                setTEndInput('');
              } else {
                const num = parseFloat(value);
                if (!isNaN(num) && num >= 1) {
                  setTEndInput(num);
                }
              }
            }}
            onBlur={() => {
              // If left empty, reset to 20
              if (tEndInput === '' || tEndInput === undefined || tEndInput === null) {
                setTEndInput(20);
              }
            }}
            InputProps={{
              sx: {
                height: 48,
                minHeight: 48,
                maxHeight: 48,
                backgroundColor: '#1976d2',
                color: '#fff',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 600,
                fontSize: 16,
                textAlign: 'center',
                justifyContent: 'center',
                pl: 2,
                pr: 2,
                boxShadow: 'none',
                '& input': {
                  textAlign: 'center',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 16,
                  padding: 0,
                },
                '&::placeholder': {
                  color: '#fff',
                  opacity: 1,
                },
              },
            }}
            sx={{
              width: 200,
              height: 48,
              minHeight: 48,
              maxHeight: 48,
              alignSelf: 'stretch',
              m: 0,
              p: 0,
              borderRadius: '8px',
              boxShadow: 'none',
              border: 'none',
              backgroundColor: '#1976d2',
              color: '#fff',
              fontWeight: 600,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '& .MuiOutlinedInput-notchedOutline': {
                border: 'none',
              },
              '&:hover': {
                backgroundColor: '#1565c0',
              },
              '& .Mui-focused': {
                backgroundColor: '#1565c0',
              },
            }}
          />
        </Box>

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
                saveParameters={saveParameters}
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
          monitoredComponents={monitoredComponents}
          onRemoveComponent={(id) => {
            setMonitoredComponents(prev => prev.filter(comp => comp.id !== id));
          }}
          exportIslandData={setIslandData}
        />
      )}
    </Container>
  );
}

export default App;
// Parameter control interface for power system simulation
// Provides user controls for load steps, line outages, and system parameters

import React from 'react';
import { 
  Paper, 
  Typography, 
  Grid,
  TextField,
  Box,
  Slider,
  InputAdornment,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  FormControlLabel,
  Switch,
  Button,
  Container
} from '@mui/material';

// Time control slider component with consistent styling
// Used for setting simulation time points and durations
const TimeSlider = ({ value, onChange, label, max }) => (
  <Box sx={{ mb: 3 }}>
    <Typography gutterBottom>{label || "Time (s)"}</Typography>
    <Slider
      value={value}
      onChange={onChange}
      min={0}
      max={max}
      step={0.1}
      marks={[
        { value: 0, label: '0s' },
        { value: max / 2, label: `${(max / 2).toFixed(1)}s` },
        { value: max, label: `${max.toFixed(1)}s` }
      ]}
      valueLabelDisplay="auto"
      sx={{ mb: 2 }}
    />
  </Box>
);

// Main parameter control component
// Manages all simulation parameters including load steps, line outages, and tap changers
const ParameterControls = ({ 
  parameters, 
  setParameters, 
  handleParameterChange, 
  handleTapChangerChange,
  handleLineOutageChange,
  handleReconnectChange,
  handleRemoveLineOutage,
  handleAddLineOutage,
  handleRemoveTapChange,
  handleAddTapChange,
  saveParameters
}) => {
  // Load step parameter interface
  // Controls for load changes at specific time points
  const renderLoadStepParameters = (step) => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Step {step}</Typography>
      
      {/* Load Selection */}
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Load</InputLabel>
        <Select
          value={parameters[`step${step}`].load_index}
          onChange={(e) => handleParameterChange(`step${step}`, 'load_index', parseInt(e.target.value))}
        >
          <MenuItem value={0}>L1 (Bus B7)</MenuItem>
          <MenuItem value={1}>L2 (Bus B9)</MenuItem>
        </Select>
      </FormControl>

      {/* Time Selection */}
      <TimeSlider 
        value={parameters[`step${step}`].time}
        onChange={(_, value) => handleParameterChange(`step${step}`, 'time', value)}
        max={parameters.t_end || 20}
      />

      {/* Power Parameters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="g_setp"
          type="number"
          value={parameters[`step${step}`].g_setp}
          onChange={(e) => handleParameterChange(`step${step}`, 'g_setp', parseFloat(e.target.value))}
          InputProps={{
            endAdornment: <InputAdornment position="end">pu</InputAdornment>,
            inputProps: { step: 0.1 }
          }}
          fullWidth
        />
        <TextField
          label="b_setp"
          type="number"
          value={parameters[`step${step}`].b_setp}
          onChange={(e) => handleParameterChange(`step${step}`, 'b_setp', parseFloat(e.target.value))}
          InputProps={{
            endAdornment: <InputAdornment position="end">pu</InputAdornment>,
            inputProps: { step: 0.1 }
          }}
          fullWidth
        />
      </Box>
    </Paper>
  );

  // Line outage configuration interface
  // Controls for line disconnection and reconnection events
  const renderLineOutageParameters = () => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Line Outage</Typography>
      
      <FormControlLabel
        control={
          <Switch
            checked={parameters.lineOutage.enabled}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              lineOutage: {
                ...prev.lineOutage,
                enabled: e.target.checked
              }
            }))}
          />
        }
        label="Enable Line Outages"
      />
      
      {parameters.lineOutage.enabled && (
        <Box sx={{ mb: 3 }}>
          {/* Render each line outage */}
          {parameters.lineOutage.outages.map((outage, index) => (
            <Box key={index} sx={{ mb: 2 }}>
              <Typography variant="subtitle1" gutterBottom>Outage {index + 1}</Typography>
              
              {/* Line Selection */}
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField
                  select
                  label="Line to Disconnect"
                  value={outage.lineId}
                  onChange={(e) => handleLineOutageChange(index, 'lineId', e.target.value)}
                  variant="outlined"
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">Select a line</MenuItem>
                  <MenuItem value="L5-6">Line B5-B6</MenuItem>
                  <MenuItem value="L6-7">Line B6-B7</MenuItem>
                  <MenuItem value="L7-8-1">Line B7-B8 (1)</MenuItem>
                  <MenuItem value="L7-8-2">Line B7-B8 (2)</MenuItem>
                  <MenuItem value="L8-9-1">Line B8-B9 (1)</MenuItem>
                  <MenuItem value="L8-9-2">Line B8-B9 (2)</MenuItem>
                  <MenuItem value="L9-10">Line B9-B10</MenuItem>
                  <MenuItem value="L10-11">Line B10-B11</MenuItem>
                </TextField>
              </Box>

              {/* Outage Time */}
              <TimeSlider 
                value={outage.time}
                onChange={(_, value) => handleLineOutageChange(index, 'time', value)}
                label="Disconnection Time (s)"
                max={parameters.t_end || 20}
              />

              {/* Reconnection Toggle */}
              <FormControlLabel
                control={
                  <Switch
                    checked={outage.reconnect.enabled}
                    onChange={(e) => handleReconnectChange(index, 'enabled', e.target.checked)}
                  />
                }
                label="Enable Reconnection"
              />

              {/* Reconnection Time Slider (only shown if reconnection is enabled) */}
              {outage.reconnect.enabled && (
                <TimeSlider 
                  value={outage.reconnect.time}
                  onChange={(_, value) => handleReconnectChange(index, 'time', value)}
                  label="Reconnection Time (s)"
                  max={parameters.t_end || 20}
                />
              )}

              {/* Remove Button */}
              <Button
                variant="outlined"
                color="error"
                onClick={() => handleRemoveLineOutage(index)}
                fullWidth
              >
                Remove Outage
              </Button>
            </Box>
          ))}

          {/* Add New Outage Button */}
          <Button
            variant="outlined"
            color="primary"
            onClick={handleAddLineOutage}
            fullWidth
            sx={{ mt: 2 }}
          >
            Add Outage
          </Button>
        </Box>
      )}
    </Paper>
  );

  // Helper function to render short circuit parameters
  const renderShortCircuitParameters = () => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Short Circuit Parameters</Typography>
      
      {/* Bus Selection */}
      <Box sx={{ mb: 2 }}>
        <FormControl fullWidth>
          <InputLabel>Bus</InputLabel>
          <Select
            value={parameters.shortCircuit.busId}
            onChange={(e) => handleParameterChange('shortCircuit', 'busId', e.target.value)}
          >
            <MenuItem value="">None</MenuItem>
            {Array.from({ length: 11 }, (_, i) => (
              <MenuItem key={i + 1} value={i + 1}>B{i + 1}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Start Time */}
      <TimeSlider 
        value={parameters.shortCircuit.startTime}
        onChange={(_, value) => handleParameterChange('shortCircuit', 'startTime', value)}
        label="Start Time (s)"
        max={parameters.t_end || 20}
      />

      {/* Duration and Admittance */}
      <TextField
        label="Duration (s)"
        type="number"
        value={parameters.shortCircuit.duration}
        onChange={(e) => handleParameterChange('shortCircuit', 'duration', Math.max(0, parseFloat(e.target.value) || 0))}
        sx={{ mt: 1 }}
        fullWidth
        InputProps={{ inputProps: { min: 0, step: 0.01 } }}
      />
      <TextField
        label="Fault Admittance"
        type="number"
        value={parameters.shortCircuit.admittance}
        onChange={(e) => {
          const value = parseFloat(e.target.value) || 0;
          // If a bus is selected, ensure minimum admittance
          const minAdmittance = parameters.shortCircuit.busId ? 1000000 : 0;
          handleParameterChange('shortCircuit', 'admittance', Math.max(minAdmittance, value));
        }}
        sx={{ mt: 1 }}
        fullWidth
        InputProps={{ 
          inputProps: { min: 0, step: 1000000 } 
        }}
      />
      
      {/* Warning if bus is selected but duration is zero */}
      {parameters.shortCircuit.busId && parameters.shortCircuit.duration <= 0 && (
        <Typography variant="caption" color="error.main" sx={{ mt: 1, display: 'block' }}>
          Warning: Duration must be greater than 0.
        </Typography>
      )}
    </Paper>
  );

  // Helper function to render tap changer parameters
  const renderTapChangerParameters = () => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Tap Changer</Typography>
      <Box sx={{ mb: 3 }}>
        {/* Render each tap change */}
        {parameters.tapChanger.changes.map((change, index) => (
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Change {index + 1}</Typography>
            
            {/* Transformer Selection */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Transformer</InputLabel>
              <Select
                value={change.transformerId}
                onChange={(e) => handleTapChangerChange(index, 'transformerId', e.target.value)}
              >
                <MenuItem value="0">T1</MenuItem>
                <MenuItem value="1">T2</MenuItem>
                <MenuItem value="2">T3</MenuItem>
                <MenuItem value="3">T4</MenuItem>
              </Select>
            </FormControl>

            {/* Time Selection */}
            <TimeSlider 
              value={change.time}
              onChange={(_, value) => handleTapChangerChange(index, 'time', value)}
              max={parameters.t_end || 20}
            />

            {/* Ratio Change */}
            <Typography gutterBottom>Ratio Change</Typography>
            <Slider
              value={change.ratioChange}
              onChange={(_, value) => handleTapChangerChange(index, 'ratioChange', value)}
              min={0.9}
              max={1.1}
              step={0.01}
              marks={[
                { value: 0.9, label: '0.9' },
                { value: 1.0, label: '1.0' },
                { value: 1.1, label: '1.1' }
              ]}
              valueLabelDisplay="auto"
              sx={{ mb: 2 }}
            />

            {/* Remove Button */}
            <Button
              variant="outlined"
              color="error"
              onClick={() => handleRemoveTapChange(index)}
              fullWidth
            >
              Remove Change
            </Button>
          </Box>
        ))}

        {/* Add New Change Button */}
        <Button
          variant="outlined"
          color="primary"
          onClick={handleAddTapChange}
          fullWidth
          sx={{ mt: 2 }}
        >
          Add Change
        </Button>
      </Box>
    </Paper>
  );

  // Main render
  return (
    <Container maxWidth="lg" sx={{ pt: 2, pb: 4 }}>
      <Grid container spacing={2}>
        {/* Left Column: Controls */}
        <Grid item xs={12} md={4}>
          {renderLoadStepParameters(1)}
          {renderLoadStepParameters(2)}
        </Grid>
        
        {/* Middle Column: Advanced Controls */}
        <Grid item xs={12} md={4}>
          {renderLineOutageParameters()}
          {renderShortCircuitParameters()}
        </Grid>
        
        {/* Right Column: Even More Controls */}
        <Grid item xs={12} md={4}>
          {renderTapChangerParameters()}
        </Grid>
      </Grid>
    </Container>
  );
};

export default ParameterControls; 
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
  Card,
  Button,
  CircularProgress
} from '@mui/material';

// Component for rendering a time slider with consistent styling
const TimeSlider = ({ value, onChange, label }) => (
  <Box sx={{ mb: 3 }}>
    <Typography gutterBottom>{label || "Time (s)"}</Typography>
    <Slider
      value={value}
      onChange={onChange}
      min={0}
      max={20}
      step={0.1}
      marks={[
        { value: 0, label: '0s' },
        { value: 10, label: '10s' },
        { value: 20, label: '20s' }
      ]}
      valueLabelDisplay="auto"
      sx={{ mb: 2 }}
    />
  </Box>
);

const ParameterControls = ({ 
  parameters, 
  setParameters, 
  handleParameterChange, 
  handleTapChangerChange,
  handleRemoveTapChange,
  handleAddTapChange,
  saveParameters,
  handleStartSimulation,
  downloadExcel,
  exportPlotsToPDF,
  loading,
  exportingPdf,
  results,
  error
}) => {
  // Helper function to render load step parameters (Step 1 and Step 2)
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

  // Helper function to render line outage parameters
  const renderLineOutageParameters = () => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Line Outage</Typography>
      
      {/* Outage Time */}
      <TimeSlider 
        value={parameters.lineOutage.time}
        onChange={(_, value) => handleParameterChange('lineOutage', 'time', value)}
      />

      {/* Line Selection */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          select
          label="Line to Disconnect"
          value={parameters.lineOutage.lineId}
          onChange={(e) => handleParameterChange('lineOutage', 'lineId', e.target.value)}
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
    </Paper>
  );

  // Helper function to render short circuit parameters
  const renderShortCircuitParameters = () => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Short Circuit</Typography>
      
      {/* Bus Selection */}
      <Box sx={{ mb: 3 }}>
        <Typography gutterBottom>Bus</Typography>
        <FormControl fullWidth sx={{ mt: 1 }}>
          <InputLabel>Bus</InputLabel>
          <Select
            value={parameters.shortCircuit.busId}
            onChange={(e) => handleParameterChange('shortCircuit', 'busId', e.target.value)}
            label="Bus"
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
      />

      {/* Duration and Admittance */}
      <TextField
        label="Duration (s)"
        type="number"
        value={parameters.shortCircuit.duration}
        onChange={(e) => handleParameterChange('shortCircuit', 'duration', parseFloat(e.target.value))}
        sx={{ mt: 1 }}
        fullWidth
      />
      <TextField
        label="Fault Admittance"
        type="number"
        value={parameters.shortCircuit.admittance}
        onChange={(e) => handleParameterChange('shortCircuit', 'admittance', parseFloat(e.target.value))}
        sx={{ mt: 1 }}
        fullWidth
      />
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

  // Helper function to render generator control parameters
  const renderGeneratorControlParameters = () => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>Generator Control</Typography>
      
      {/* Governor Control Section */}
      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={parameters.generatorControl.governor.enabled}
              onChange={(e) => setParameters(prev => ({
                ...prev,
                generatorControl: {
                  ...prev.generatorControl,
                  governor: {
                    ...prev.generatorControl.governor,
                    enabled: e.target.checked
                  }
                }
              }))}
            />
          }
          label="Governor Control (TGOV1)"
        />
        
        {parameters.generatorControl.governor.enabled && (
          <Box sx={{ mt: 2 }}>
            {/* Governor Parameters */}
            {[
              { label: "Droop (R)", field: "R", step: 0.01 },
              { label: "Damping (D_t)", field: "D_t", step: 0.01 },
              { label: "T_1 (s)", field: "T_1", step: 0.01 },
              { label: "T_2 (s)", field: "T_2", step: 0.01 },
              { label: "T_3 (s)", field: "T_3", step: 0.01 }
            ].map(({ label, field, step }) => (
              <TextField
                key={field}
                label={label}
                type="number"
                value={parameters.generatorControl.governor[field]}
                onChange={(e) => setParameters(prev => ({
                  ...prev,
                  generatorControl: {
                    ...prev.generatorControl,
                    governor: {
                      ...prev.generatorControl.governor,
                      [field]: parseFloat(e.target.value)
                    }
                  }
                }))}
                fullWidth
                sx={{ mb: 2 }}
                InputProps={{
                  inputProps: { step }
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* AVR Control Section */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={parameters.generatorControl.avr.enabled}
              onChange={(e) => setParameters(prev => ({
                ...prev,
                generatorControl: {
                  ...prev.generatorControl,
                  avr: {
                    ...prev.generatorControl.avr,
                    enabled: e.target.checked
                  }
                }
              }))}
            />
          }
          label="Voltage Control (SEXS)"
        />
        
        {parameters.generatorControl.avr.enabled && (
          <Box sx={{ mt: 2 }}>
            {/* AVR Parameters */}
            {[
              { label: "Gain (K)", field: "K", step: 1 },
              { label: "T_a (s)", field: "T_a", step: 0.1 },
              { label: "T_b (s)", field: "T_b", step: 0.1 },
              { label: "T_e (s)", field: "T_e", step: 0.1 }
            ].map(({ label, field, step }) => (
              <TextField
                key={field}
                label={label}
                type="number"
                value={parameters.generatorControl.avr[field]}
                onChange={(e) => setParameters(prev => ({
                  ...prev,
                  generatorControl: {
                    ...prev.generatorControl,
                    avr: {
                      ...prev.generatorControl.avr,
                      [field]: parseFloat(e.target.value)
                    }
                  }
                }))}
                fullWidth
                sx={{ mb: 2 }}
                InputProps={{
                  inputProps: { step }
                }}
              />
            ))}
          </Box>
        )}
      </Box>
    </Paper>
  );

  // Helper function to render noise control parameters
  const renderNoiseControlParameters = () => (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>Noise Control</Typography>
      
      {/* Load Noise Section */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Load Noise</Typography>
        <FormControlLabel
          control={
            <Switch
              checked={parameters.noiseParams.loads.enabled}
              onChange={(e) => setParameters(prev => ({
                ...prev,
                noiseParams: {
                  ...prev.noiseParams,
                  loads: {
                    ...prev.noiseParams.loads,
                    enabled: e.target.checked
                  }
                }
              }))}
            />
          }
          label="Enable Load Noise"
        />
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <TextField
            label="Magnitude"
            type="number"
            value={parameters.noiseParams.loads.magnitude}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              noiseParams: {
                ...prev.noiseParams,
                loads: {
                  ...prev.noiseParams.loads,
                  magnitude: parseFloat(e.target.value)
                }
              }
            }))}
            InputProps={{
              inputProps: { step: 0.1 }
            }}
            fullWidth
          />
          <TextField
            label="Filter Time (s)"
            type="number"
            value={parameters.noiseParams.loads.filter_time}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              noiseParams: {
                ...prev.noiseParams,
                loads: {
                  ...prev.noiseParams.loads,
                  filter_time: parseFloat(e.target.value)
                }
              }
            }))}
            InputProps={{
              inputProps: { step: 0.1 }
            }}
            fullWidth
          />
        </Box>
      </Box>

      {/* Generator Noise Section */}
      <Box>
        <Typography variant="subtitle1" gutterBottom>Generator Noise</Typography>
        <FormControlLabel
          control={
            <Switch
              checked={parameters.noiseParams.generators.enabled}
              onChange={(e) => setParameters(prev => ({
                ...prev,
                noiseParams: {
                  ...prev.noiseParams,
                  generators: {
                    ...prev.noiseParams.generators,
                    enabled: e.target.checked
                  }
                }
              }))}
            />
          }
          label="Enable Generator Noise"
        />
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <TextField
            label="Magnitude"
            type="number"
            value={parameters.noiseParams.generators.magnitude}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              noiseParams: {
                ...prev.noiseParams,
                generators: {
                  ...prev.noiseParams.generators,
                  magnitude: parseFloat(e.target.value)
                }
              }
            }))}
            InputProps={{
              inputProps: { step: 0.1 }
            }}
            fullWidth
          />
          <TextField
            label="Filter Time (s)"
            type="number"
            value={parameters.noiseParams.generators.filter_time}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              noiseParams: {
                ...prev.noiseParams,
                generators: {
                  ...prev.noiseParams.generators,
                  filter_time: parseFloat(e.target.value)
                }
              }
            }))}
            InputProps={{
              inputProps: { step: 0.1 }
            }}
            fullWidth
          />
        </Box>
      </Box>
    </Card>
  );

  // Helper function to render PLL control parameters
  const renderPLLControlParameters = () => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>PLL Control</Typography>
      
      <FormControlLabel
        control={
          <Switch
            checked={parameters.pllParams.enabled}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              pllParams: {
                ...prev.pllParams,
                enabled: e.target.checked
              }
            }))}
          />
        }
        label="Enable PLL"
      />
      
      {parameters.pllParams.enabled && (
        <Box sx={{ mt: 2 }}>
          {/* PLL1 Parameters */}
          <Typography variant="subtitle1" gutterBottom>PLL1 Parameters</Typography>
          <TextField
            label="Filter Time Constant (T_filter)"
            type="number"
            value={parameters.pllParams.pll1.T_filter}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              pllParams: {
                ...prev.pllParams,
                pll1: {
                  ...prev.pllParams.pll1,
                  T_filter: parseFloat(e.target.value)
                }
              }
            }))}
            fullWidth
            sx={{ mb: 2 }}
            InputProps={{
              inputProps: { step: 0.001 }
            }}
          />

          {/* PLL2 Parameters */}
          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>PLL2 Parameters</Typography>
          <TextField
            label="Proportional Gain (K_p)"
            type="number"
            value={parameters.pllParams.pll2.K_p}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              pllParams: {
                ...prev.pllParams,
                pll2: {
                  ...prev.pllParams.pll2,
                  K_p: parseFloat(e.target.value)
                }
              }
            }))}
            fullWidth
            sx={{ mb: 2 }}
            InputProps={{
              inputProps: { step: 1 }
            }}
          />
          <TextField
            label="Integral Gain (K_i)"
            type="number"
            value={parameters.pllParams.pll2.K_i}
            onChange={(e) => setParameters(prev => ({
              ...prev,
              pllParams: {
                ...prev.pllParams,
                pll2: {
                  ...prev.pllParams.pll2,
                  K_i: parseFloat(e.target.value)
                }
              }
            }))}
            fullWidth
            sx={{ mb: 2 }}
            InputProps={{
              inputProps: { step: 1 }
            }}
          />
        </Box>
      )}
    </Paper>
  );

  // Helper function to render action buttons
  const renderActionButtons = () => (
    <Paper elevation={2} sx={{ p: 3, bgcolor: 'background.default', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Button
        variant="contained"
        color="secondary"
        onClick={saveParameters}
        size="large"
        fullWidth
      >
        Save Parameters
      </Button>
      <Button
        variant="contained"
        color="primary"
        onClick={handleStartSimulation}
        disabled={loading}
        size="large"
        fullWidth
      >
        {loading ? <CircularProgress size={24} /> : 'Run Simulation'}
      </Button>
      {results && (
        <>
          <Button
            variant="outlined"
            color="primary"
            onClick={downloadExcel}
            size="large"
            fullWidth
          >
            Download Excel
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            onClick={exportPlotsToPDF}
            disabled={exportingPdf}
            size="large"
            fullWidth
          >
            {exportingPdf ? (
              <>
                <CircularProgress size={24} sx={{ mr: 1 }} />
                Generating PDF...
              </>
            ) : (
              'Export Plots to PDF'
            )}
          </Button>
        </>
      )}
    </Paper>
  );

  // Main render
  return (
    <Grid container spacing={3}>
      {/* Load Step Parameters */}
      <Grid item xs={12} md={6} lg={4}>
        {renderLoadStepParameters(1)}
      </Grid>
      <Grid item xs={12} md={6} lg={4}>
        {renderLoadStepParameters(2)}
      </Grid>

      {/* Line Outage Parameters */}
      <Grid item xs={12} md={6} lg={4}>
        {renderLineOutageParameters()}
      </Grid>

      {/* Short Circuit Parameters */}
      <Grid item xs={12} md={6} lg={4}>
        {renderShortCircuitParameters()}
      </Grid>

      {/* Tap Changer Parameters */}
      <Grid item xs={12} md={6} lg={4}>
        {renderTapChangerParameters()}
      </Grid>

      {/* Generator Control Parameters */}
      <Grid item xs={12} md={6} lg={4}>
        {renderGeneratorControlParameters()}
      </Grid>

      {/* Noise Control Parameters */}
      <Grid item xs={12}>
        {renderNoiseControlParameters()}
      </Grid>

      {/* PLL Control Parameters */}
      <Grid item xs={12} md={6} lg={4}>
        {renderPLLControlParameters()}
      </Grid>

      {/* Action Buttons */}
      <Grid item xs={12} md={6} lg={4}>
        {renderActionButtons()}
      </Grid>

      {/* Error Display */}
      {error && (
        <Typography color="error" gutterBottom sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}
    </Grid>
  );
};

export default ParameterControls; 
#Imports and dependencies
# Standard
import json
import os
import queue
import sys
import threading
import time
from collections import defaultdict
import pkgutil

# Third-party
import numpy as np
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

# TOPS 
import tops.dynamic as dps
import tops.modal_analysis as dps_mdl
import tops.solvers as dps_sol
import importlib

#Flask config
app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "Accept"]
    }
})

# GLOBAL STATE AND DEFAULT PARAMETERS

# Global state management
simulation_state = {
    'running': False,  # Flag to track if simulation is currently running
    'results': defaultdict(list)  # Store simulation results
}

# Default simulation parameters
sim_parameters = {
    'network': 'k2a',
    'step1': {'time': 1.0, 'load_index': 0, 'g_setp': 0, 'b_setp': 0},
    'step2': {'time': 2.0, 'load_index': 0, 'g_setp': 0, 'b_setp': 0},
    'lineOutage': {'enabled': True, 'outages': []},
    'shortCircuit': {'busId': '', 'startTime': 0, 'duration': 0, 'admittance': 0},
    'tapChanger': {'enabled': True, 'changes': [{'transformerId': '', 'time': 0, 'ratioChange': 0}]},
    't_end': 20  # Default simulation time
}

# Queue for real-time simulation updates to frontend
update_queue = queue.Queue()

@app.route('/api/networks', methods=['GET'])
def get_available_networks():
    """Return list of available network models from TOPS."""
    try:
        import tops.ps_models
        networks = [m.name for m in pkgutil.iter_modules(tops.ps_models.__path__)]
        return jsonify({'networks': networks})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

#he,lper functions
def convert_to_serializable(obj):
    """
    Convert complex Python objects to JSON serializable format.
    
    Args:
        obj: The object to convert (complex number, numpy array, etc.)
    
    Returns:
        JSON serializable version of the object
    """
    if isinstance(obj, complex):
        return {'real': float(obj.real), 'imag': float(obj.imag)}
    elif isinstance(obj, np.ndarray):
        return [convert_to_serializable(x) for x in obj]
    elif isinstance(obj, list):
        return [convert_to_serializable(x) for x in obj]
    elif isinstance(obj, np.number):
        return float(obj)
    return obj



# SIM
def run_simulation_thread(sim_params):
    """
    Main simulation function that runs in a separate thread.
    
    This function handles the complete power system simulation process:
    1. Model loading and initialization
    2. Power flow analysis
    3. Dynamic simulation with events and control actions
    4. Post-simulation analysis (eigenvalues, power flows, etc.)
    
    Args:
        sim_params: Dictionary containing all simulation parameters
    """
    global simulation_state
    try:
        simulation_state['running'] = True
        print("\nSimulation parameters:", json.dumps(sim_params, indent=2))
        
        # Start timing the simulation
        start_time = time.time()
        
        # model loading and initialization
        
        print("\n=== Loading model ===")
        network_name = sim_params.get('network', 'k2a')
        try:
            model_module = importlib.import_module(f"tops.ps_models.{network_name}")
        except ModuleNotFoundError:
            update_queue.put({
                'type': 'error',
                'data': f'Network {network_name} not found'
            })
            simulation_state['running'] = False
            return

        importlib.reload(model_module)
        model = model_module.load()
        print(f"Model {network_name} loaded successfully")
        
        # Restructure model components for TOPS compatibility
        # Ensure loads are wrapped as DynamicLoad if provided as a flat list
        if isinstance(model.get('loads'), list):
            model['loads'] = {'DynamicLoad': model['loads']}

        # Convert transformer data to dynamic transformer format if necessary
        if 'transformers' in model:
            trafos = model['transformers']
            header = list(trafos[0])
            rows = [list(r) for r in trafos[1:]]

            if 'ratio_from' not in header:
                header.append('ratio_from')
                rows = [r + [1] for r in rows]
            if 'ratio_to' not in header:
                header.append('ratio_to')
                rows = [r + [1] for r in rows]

            model['trafos'] = {'DynTrafo': [header] + rows}
            model.pop('transformers')

        print("Model structure prepared")

        # Create power system model, using k2a model
        ps = dps.PowerSystemModel(model=model)
        print("PowerSystemModel instance created")

        # POWER FLOW ANALYSIS
        
        try:
            print("Running power flow...")
            ps.power_flow()
            print("Power flow completed successfully")
        except Exception as e:
            print("Error in power flow:")
            import traceback
            traceback.print_exc()
            raise
        
        # DYNAMIC SIMULATION INITIALIZATION
        
        try:
            print("Initializing dynamic simulation...")
            ps.init_dyn_sim()
            print("Dynamic simulation initialized successfully")
            print("Initial state vector size:", len(ps.x_0))
        except Exception as e:
            print("Error in dynamic simulation initialization:")
            import traceback
            traceback.print_exc()
            raise

        # MODEL STATE VERIFICATION
        
        print("\nVerifying model state...")
        try:
            max_residual = max(abs(ps.ode_fun(0, ps.x_0)))
            print(f"Maximum residual after initialization: {max_residual}")
            if max_residual > 1e-6:
                print("Warning: High residual in model initialization")
        except Exception as e:
            print("Error checking model state:")
            import traceback
            traceback.print_exc()
            raise

        # SETUP STATE DERIVATIVE FUNCTION
        
        # Create a wrapper for state derivatives that handles short circuit
        def state_derivatives_with_sc(t, x, v):
            """Custom state derivative function with short circuit handling"""
            # Apply short circuit if configured
            if sim_parameters['shortCircuit']['busId'] is not None and sim_parameters['shortCircuit']['busId'] != '':
                sc_time = sim_parameters['shortCircuit']['startTime']
                sc_duration = sim_parameters['shortCircuit']['duration']
                sc_bus_id = sim_parameters['shortCircuit']['busId']
                # Convert busId from string to integer if needed
                sc_bus_idx = int(sc_bus_id) if isinstance(sc_bus_id, str) and sc_bus_id != '' else sc_bus_id
                sc_admittance = sim_parameters['shortCircuit']['admittance']
                
                # Apply fault during the specified time window
                if sc_time <= t <= (sc_time + sc_duration):
                    ps.y_bus_red_mod[(sc_bus_idx,) * 2] = sc_admittance
                else:
                    ps.y_bus_red_mod[(sc_bus_idx,) * 2] = 0
            
            # Get the state derivatives from the power system model
            return ps.state_derivatives(t, x, v)
        
        # SETUP SOLVER
        
        # Initialize the solver
        print("\nSetting up simulation...")
        sol = dps_sol.ModifiedEulerDAE(
            state_derivatives_with_sc, 
            ps.solve_algebraic, 
            0, 
            ps.x_0.copy(), 
            t_end=sim_params.get('t_end', 20), 
            max_step=5e-3
        )

        # Initialize results storage
        results = defaultdict(list)
        
        # Initialize tracking sets for line status
        disconnected_lines = set()
        reconnected_lines = set()
        
        # Send initial data to frontend
        update_queue.put({
            'type': 'init',
            'data': {
                't_end': sol.t_end,
                'dt': sol.dt
            }
        })

        # ---------------------------------------------------------------
        # MAIN SIMULATION LOOP
        # ---------------------------------------------------------------
        
        while sol.t <= sol.t_end:
            # --- APPLY LOAD CHANGES ---
            
            # Step 1 load changes
            if sim_parameters['step1']['time'] <= sol.t:
                g_setp = sim_parameters['step1']['g_setp']
                ps.loads['DynamicLoad'].set_input('g_setp', 
                    g_setp if g_setp != 0 else ps.loads['DynamicLoad']._input_values['g_setp'][sim_parameters['step1']['load_index']], 
                    sim_parameters['step1']['load_index'])
                b_setp = sim_parameters['step1']['b_setp']
                ps.loads['DynamicLoad'].set_input('b_setp', 
                    b_setp if b_setp != 0 else ps.loads['DynamicLoad']._input_values['b_setp'][sim_parameters['step1']['load_index']], 
                    sim_parameters['step1']['load_index'])

            # Step 2 load changes
            if sim_parameters['step2']['time'] <= sol.t:
                g_setp = sim_parameters['step2']['g_setp']
                ps.loads['DynamicLoad'].set_input('g_setp', 
                    g_setp if g_setp != 0 else ps.loads['DynamicLoad']._input_values['g_setp'][sim_parameters['step2']['load_index']], 
                    sim_parameters['step2']['load_index'])
                b_setp = sim_parameters['step2']['b_setp']
                ps.loads['DynamicLoad'].set_input('b_setp', 
                    b_setp if b_setp != 0 else ps.loads['DynamicLoad']._input_values['b_setp'][sim_parameters['step2']['load_index']], 
                    sim_parameters['step2']['load_index'])

            # --- HANDLE LINE OUTAGES & RECONNECTIONS ---
            
            if sim_parameters['lineOutage'].get('enabled', True):
                for outage in sim_parameters['lineOutage']['outages']:
                    lineId = outage.get('lineId')
                    outageTime = outage.get('time')
                    reconnect = outage.get('reconnect', {})
                    reconnectEnabled = reconnect.get('enabled', False)
                    reconnectTime = reconnect.get('time', 0)
                    
                    # Check if this line needs to be disconnected
                    if (lineId and lineId != '' and 
                        lineId not in disconnected_lines and 
                        sol.t >= outageTime):
                        try:
                            ps.lines['Line'].event(ps, lineId, 'disconnect')
                            disconnected_lines.add(lineId)  # Mark as disconnected
                            print(f"Line {lineId} disconnected at t={sol.t}")
                        except Exception as e:
                            print(f"Error disconnecting line {lineId}: {e}")
                    
                    # Check if this line needs to be reconnected
                    if (reconnectEnabled and lineId and lineId != '' and 
                        lineId in disconnected_lines and 
                        lineId not in reconnected_lines and 
                        sol.t >= reconnectTime):
                        try:
                            ps.lines['Line'].event(ps, lineId, 'reconnect')
                            reconnected_lines.add(lineId)  # Mark as reconnected
                            print(f"Line {lineId} reconnected at t={sol.t}")
                        except Exception as e:
                            print(f"Error reconnecting line {lineId}: {e}")

            # --- APPLY TRANSFORMER TAP CHANGES ---
            
            if sim_parameters['tapChanger']['enabled']:
                for change in sim_parameters['tapChanger']['changes']:
                    if change['time'] <= sol.t < (change['time'] + 9):
                        trafo_idx = int(change['transformerId'])
                        ps.trafos['DynTrafo'].set_input('ratio_from', change['ratioChange'], trafo_idx)

            # --- COLLECT RESULTS FOR THIS TIME STEP ---
            
            step_data = {
                't': float(sol.t),
                'x': convert_to_serializable(sol.x.copy()),
                'v': convert_to_serializable(sol.v.copy()),
                'v_magnitude': convert_to_serializable(np.abs(sol.v)),
                'v_angle': convert_to_serializable(np.angle(sol.v)),
                'gen_speed': convert_to_serializable(ps.gen['GEN'].speed(sol.x, sol.v)),
                'gen_I': convert_to_serializable(ps.gen['GEN'].i(sol.x, sol.v)),
                'load_I': convert_to_serializable(ps.loads['DynamicLoad'].i(sol.x, sol.v)),
                'load_P': convert_to_serializable(ps.loads['DynamicLoad'].p(sol.x, sol.v)),
                'load_Q': convert_to_serializable(ps.loads['DynamicLoad'].q(sol.x, sol.v)),
                'trafo_current_from': convert_to_serializable(ps.trafos['DynTrafo'].i_from(sol.x, sol.v)),
                'trafo_current_to': convert_to_serializable(ps.trafos['DynTrafo'].i_to(sol.x, sol.v))
            }

            # Send real-time data to frontend
            update_queue.put({
                'type': 'step',
                'data': step_data
            })
            
            # Store in results for final return
            for key, value in step_data.items():
                results[key].append(value)

            # Advance to next time step
            sol.step()

        # ---------------------------------------------------------------
        # POST-SIMULATION ANALYSIS
        # ---------------------------------------------------------------
        
        print("\nPreparing final results...")
        # Convert all results to serializable format
        serializable_results = {k: convert_to_serializable(v) for k, v in results.items()}
        
        # --- POWER FLOW ANALYSIS ---
        
        # Calculate line power flows
        lines_power = {}
        try:
            for i, line in enumerate(getattr(ps.lines['Line'], 'models', [ps.lines['Line']])):
                line_id = line.name if hasattr(line, 'name') else f"L{i+1}"
                lines_power[line_id] = {
                    'p_from': float(np.real(line.p_from(sol.x, sol.v)[i])),
                    'q_from': float(np.real(line.q_from(sol.x, sol.v)[i])),
                    'p_to': float(np.real(line.p_to(sol.x, sol.v)[i])),
                    'q_to': float(np.real(line.q_to(sol.x, sol.v)[i]))
                }
        except Exception as e:
            print(f"Error extracting line power flow: {e}")
        serializable_results['lines'] = lines_power

        # --- EIGENVALUE ANALYSIS ---
        
        try:
            print("\nStarting eigenvalue analysis at final operating point...")
            # Create linearized model around final operating point
            ps_lin = dps_mdl.PowerSystemModelLinearization(ps)
            ps_lin.linearize()
            ps_lin.eigenvalue_decomposition()

            # Get eigenvalues
            eigs = ps_lin.eigs
            print("\nEigenvalues at final operating point:", eigs)

            # Identify electromechanical modes
            mode_idx = ps_lin.get_mode_idx(['em'], damp_threshold=0.3)
            print("\nElectromechanical mode indices:", mode_idx)
            
            # Prepare eigenvalue data for frontend
            eigenvalue_data = {
                'real': [float(e.real) for e in eigs],
                'imag': [float(e.imag) for e in eigs],
                'frequency': [float(abs(e.imag/(2*np.pi))) for e in eigs],
                'damping': [float(-100 * e.real/abs(e)) for e in eigs],
                'electromechanical_modes': mode_idx.tolist() if mode_idx is not None else []
            }

            print("\nEigenvalue data being sent to frontend:", eigenvalue_data)
            print("\nShape of arrays:")
            print("real:", len(eigenvalue_data['real']))
            print("imag:", len(eigenvalue_data['imag']))
            print("electromechanical_modes:", len(eigenvalue_data['electromechanical_modes']))

            # --- CALCULATE MODE SHAPES ---
            
            try:
                rev = ps_lin.rev  # Right eigenvectors
                print("\nCalculating mode shapes...")
                
                # Get generator state indices
                state_idx = ps.gen['GEN'].state_idx_global
                print("Generator state indices:", state_idx)
                
                # Find speed state indices (typically second state of each generator)
                speed_indices = []
                for gen_states in state_idx:
                    for i, state in enumerate(gen_states):
                        if i == 1:  # Speed is typically the second state variable
                            speed_indices.append(state)
                
                print("Speed state indices:", speed_indices)
                
                if speed_indices:
                    # Extract mode shapes for speed states at electromechanical modes
                    mode_shape = rev[np.ix_(speed_indices, mode_idx)]
                    print("\nMode shape matrix shape:", mode_shape.shape)
                    print("Mode shape values:", mode_shape)
                    
                    if mode_shape is not None:
                        # Normalize mode shapes (TOPS standard approach)
                        for i in range(mode_shape.shape[1]):
                            # Find generator with max magnitude for this mode
                            max_idx = np.argmax(np.abs(mode_shape[:, i]))
                            max_value = mode_shape[max_idx, i]
                            
                            if abs(max_value) > 0:
                                # Rotate all vectors so max generator is at 0° angle
                                # and scale relative to max magnitude
                                mode_shape[:, i] = mode_shape[:, i] * np.exp(-1j * np.angle(max_value)) / np.abs(max_value)
                        
                        # Convert to magnitude and angle format for frontend
                        magnitude = np.abs(mode_shape).tolist()
                        angle = np.angle(mode_shape, deg=True).tolist()
                        print("\nMode shape data being added:")
                        print("Magnitude:", magnitude)
                        print("Angle:", angle)
                        
                        # Add mode shapes to eigenvalue data
                        eigenvalue_data.update({
                            'mode_shapes': {
                                'magnitude': magnitude,
                                'angle': angle
                            }
                        })
                else:
                    print("\nWarning: No speed state indices found in generator model")
            except Exception as e:
                print("\nWarning: Could not compute mode shapes:", str(e))
                print("Generator state indices:", getattr(ps.gen['GEN'], 'state_idx_global', None))
                import traceback
                traceback.print_exc()

            # Print summary of modes for reference
            print("\nMode Analysis Summary at final operating point:")
            for i, eig in enumerate(eigs):
                freq = abs(eig.imag/(2*np.pi))
                damp = -100 * eig.real/abs(eig)
                print(f"Mode {i+1}: λ = {eig:.3f}, freq = {freq:.2f} Hz, damping = {damp:.1f}%")
                if i in mode_idx:
                    print("  ^ Electromechanical mode")

            # Store eigenvalue results
            results['eigenvalues'] = eigenvalue_data
            serializable_results['eigenvalues'] = eigenvalue_data
            
        except Exception as e:
            print("\nError during eigenvalue analysis:", str(e))
            import traceback
            traceback.print_exc()
            
            # Send empty eigenvalue data if analysis fails
            empty_eigenvalue_data = {
                'real': [],
                'imag': [],
                'frequency': [],
                'damping': [],
                'electromechanical_modes': []
            }
            
            results['eigenvalues'] = empty_eigenvalue_data
            serializable_results['eigenvalues'] = empty_eigenvalue_data

        # --- BUS POWER FLOW CALCULATION ---
        
        # Compute bus power flow for each bus using S = V * conj(Ybus * V)
        try:
            v_final = sol.v.copy()
            ybus = ps.y_bus_lf if hasattr(ps, 'y_bus_lf') else None
            if ybus is not None:
                s_bus = v_final * np.conj(ybus.dot(v_final))
                bus_power = [
                    {'p': float(np.real(s)), 'q': float(np.imag(s))}
                    for s in s_bus
                ]
                serializable_results['bus_power'] = bus_power
        except Exception as e:
            print(f"Error computing bus power flow: {e}")

        # Debug: print final results summary
        print("Final serializable_results keys:", serializable_results.keys())
        print("Final lines power flow:", serializable_results.get('lines'))

        # Add original bus power injections for comparison
        try:
            serializable_results['bus_power_raw'] = [str(s) for s in ps.s_0]
        except Exception as e:
            print('Error serializing ps.s_0:', e)

        # ---------------------------------------------------------------
        # FINALIZE SIMULATION
        # ---------------------------------------------------------------
        
        # Calculate and print total simulation time
        end_time = time.time()
        total_time = end_time - start_time
        print(f"\nSimulation completed in {total_time:.2f} seconds")
        
        # Store final results
        simulation_state['results'] = dict(serializable_results)
        
        # Send completion message with all results
        update_queue.put({
            'type': 'complete',
            'data': serializable_results
        })
        
        # Update simulation status
        simulation_state['running'] = False
        
        # Print final bus power injections for reference
        try:
            print('Power flow bus injection results (ps.s_0):', ps.s_0)
        except Exception as e:
            print('Error printing ps.s_0:', e)
        
    except Exception as e:
        print(f"Error in simulation thread: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Send error message to frontend
        update_queue.put({
            'type': 'error',
            'data': str(e)
        })
        
        # Update simulation status
        simulation_state['running'] = False


# ========================================================================
# API ROUTES
# ========================================================================

@app.route('/api/set_parameters', methods=['POST'])
def set_parameters():
    """
    API endpoint to update simulation parameters.
    
    Expects a JSON payload with simulation parameters.
    Returns the updated parameters.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Update simulation parameters
        global sim_parameters
        # Print received data for debugging
        print("Received parameters update:", data)
        if 't_end' in data:
            print("Updating t_end to:", data['t_end'])
        
        sim_parameters.update(data)
        print("Updated sim_parameters:", sim_parameters)
        
        return jsonify({'status': 'success', 'parameters': sim_parameters})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/api/start_simulation', methods=['POST'])
def start_simulation():
    """
    API endpoint to start a new simulation.
    
    Expects a JSON payload with simulation parameters.
    Validates inputs, then starts the simulation in a separate thread.
    Returns a success status or error message.
    """
    if simulation_state['running']:
        return jsonify({'status': 'error', 'message': 'Simulation already running'}), 400
    
    try:
        # Clear previous results
        simulation_state['results'].clear()
        
        # Get the request data
        data = request.json
        
        # Basic validation of parameters
        if not data:
            return jsonify({'status': 'error', 'message': 'No parameters provided. Please set parameters before running the simulation.'}), 400
        
        # Validate shortCircuit parameters
        if 'shortCircuit' in data:
            if 'busId' in data['shortCircuit']:
                # If busId is empty but simulation is attempted, provide a clear error
                if data['shortCircuit']['busId'] == '':
                    # This is a valid case - just no short circuit
                    # Explicitly set it to None/empty to avoid conversion issues later
                    data['shortCircuit']['busId'] = None
                elif isinstance(data['shortCircuit']['busId'], str):
                    try:
                        # Try to convert to integer
                        data['shortCircuit']['busId'] = int(data['shortCircuit']['busId'])
                    except ValueError:
                        return jsonify({
                            'status': 'error', 
                            'message': 'Invalid short circuit bus ID. Please select a valid bus or leave empty for no short circuit.'
                        }), 400
            
            # Check if required short circuit parameters are present when busId is set
            if data['shortCircuit']['busId'] and (
                'startTime' not in data['shortCircuit'] or 
                'duration' not in data['shortCircuit'] or
                'admittance' not in data['shortCircuit']
            ):
                return jsonify({
                    'status': 'error',
                    'message': 'Short circuit is configured but missing required parameters (startTime, duration, or admittance).'
                }), 400
        
        # Validate line outage parameters
        if 'lineOutage' in data:
            if data['lineOutage'].get('enabled', False) and 'outages' in data['lineOutage']:
                for i, outage in enumerate(data['lineOutage']['outages']):
                    if 'lineId' in outage and outage['lineId'] and 'time' not in outage:
                        return jsonify({
                            'status': 'error',
                            'message': f'Line outage #{i+1} is configured but missing required time parameter.'
                        }), 400
        
        # Validate transformer tap changer parameters
        if 'tapChanger' in data and data['tapChanger'].get('enabled') and 'changes' in data['tapChanger']:
            for i, change in enumerate(data['tapChanger']['changes']):
                if 'transformerId' not in change or change['transformerId'] == '':
                    return jsonify({
                        'status': 'error',
                        'message': f'Please select a transformer for tap change #{i+1} or disable tap changer functionality.'
                    }), 400
        
        # Start simulation in a separate thread
        sim_thread = threading.Thread(target=run_simulation_thread, args=(data,))
        sim_thread.daemon = True
        sim_thread.start()
        
        return jsonify({'status': 'success', 'message': 'Simulation started'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/simulation_updates', methods=['GET'])
def simulation_updates():
    """
    Server-Sent Events (SSE) endpoint for real-time simulation updates.
    
    Returns a stream of events containing simulation progress and results.
    Clients can subscribe to this endpoint for real-time updates.
    """
    def generate():
        while True:
            try:
                # Get update from queue with timeout
                update = update_queue.get(timeout=1)
                
                # Convert update data to JSON
                if isinstance(update.get('data'), (dict, list)):
                    update_json = json.dumps(update)
                else:
                    update_json = json.dumps({
                        'type': update.get('type', 'unknown'),
                        'data': str(update.get('data', ''))
                    })
                
                yield f"data: {update_json}\n\n"
                
                # End stream if simulation is complete or has error
                if update['type'] in ['complete', 'error']:
                    break
                    
            except queue.Empty:
                # No update available, send keepalive
                yield ": keepalive\n\n"
                
            except Exception as e:
                print(f"Error in SSE generation: {e}")
                yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
                break
    
    return Response(generate(), mimetype='text/event-stream')

# APPLICATION ENTRY POINT

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='127.0.0.1') 
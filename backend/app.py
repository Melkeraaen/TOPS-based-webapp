from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import sys
from collections import defaultdict
import time
import tops.dynamic as dps
import tops.solvers as dps_sol
import importlib
import numpy as np
import os
import tops.modal_analysis as dps_mdl
import json
import threading
import queue

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "Accept"]
    }
})

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

# Global state management
simulation_state = {
    'running': False,  # Flag to track if simulation is currently running
    'results': defaultdict(list)  # Store simulation results
}

# Default simulation parameters
sim_parameters = {
    'step1': {'time': 1.0, 'load_index': 0, 'g_setp': 0, 'b_setp': 0},
    'step2': {'time': 2.0, 'load_index': 0, 'g_setp': 0, 'b_setp': 0},
    'lineOutage': {'lineId': '', 'time': 1.0},
    'shortCircuit': {'busId': '', 'startTime': 0, 'duration': 0, 'admittance': 0},
    'tapChanger': {'enabled': True, 'changes': [{'transformerId': '', 'time': 0, 'ratioChange': 0}]}
}

# Queue for real-time simulation updates to frontend
update_queue = queue.Queue()

def run_simulation_thread(sim_params):
    """
    Main simulation function that runs in a separate thread.
    Handles the power system simulation including model setup, initialization,
    and dynamic simulation with various control systems.
    
    Args:
        sim_params: Dictionary containing all simulation parameters
    """
    global simulation_state
    try:
        simulation_state['running'] = True
        print("\nSimulation parameters:", json.dumps(sim_params, indent=2))
        
        # === Model Loading and Initial Setup ===
        print("\n=== Loading model ===")
        import tops.ps_models.k2a as model_data
        importlib.reload(model_data)
        model = model_data.load()
        print("Model loaded successfully")
        
        # Restructure model components
        model['loads'] = {'DynamicLoad': model['loads']}
        model['trafos'] = {'DynTrafo': [
            model['transformers'][0] + ['ratio_from', 'ratio_to'],
            *[row + [1, 1] for row in model['transformers'][1:]],
        ]}
        model.pop('transformers')
        print("Model structure prepared")

        # === PLL Model Configuration ===
        pll_params = sim_params.get('pllParams', {})
        print("\nPLL Parameters:", json.dumps(pll_params, indent=2))
        
        if pll_params.get('enabled', False):
            print("\n=== Setting up PLL models ===")
            # Initialize power system model
            ps = dps.PowerSystemModel(model=model)
            ps.setup()
            ps.build_y_bus_lf()
            
            # Configure PLL parameters
            pll1_params = pll_params.get('pll1', {})
            pll2_params = pll_params.get('pll2', {})
            
            print("PLL1 Parameters:", json.dumps(pll1_params, indent=2))
            print("PLL2 Parameters:", json.dumps(pll2_params, indent=2))
            
            # Add PLL models to each bus in the system
            print("Adding PLL models to system...")
            ps.add_model_data({'pll': {
                'PLL1': [  # First-order PLL model
                    ['name', 'T_filter', 'bus'],
                    *[[f'PLL{i}', pll1_params.get('T_filter', 0.01), bus_name] 
                      for i, bus_name in enumerate(ps.buses['name'])],
                ],
                'PLL2': [  # Second-order PLL model
                    ['name', 'K_p', 'K_i', 'bus'],
                    *[[f'PLL{i}', pll2_params.get('K_p', 100), pll2_params.get('K_i', 100), bus_name] 
                      for i, bus_name in enumerate(ps.buses['name'])],
                ]
            }})
            
            # Reinitialize system with PLL models
            print("Setting up PLL models...")
            ps.setup()
            print("Building Y-bus matrix...")
            ps.build_y_bus_lf()
            print("PLL models added successfully")
            
            # Verify PLL configuration
            print("\nVerifying PLL models:")
            if hasattr(ps, 'pll'):
                print("PLL models found in power system")
                print("Available PLL types:", list(ps.pll.keys()))
                print("Number of PLL1 instances:", len(ps.pll['PLL1'].par['T_filter']))
                print("Number of PLL2 instances:", len(ps.pll['PLL2'].par['K_p']))
            else:
                print("Warning: No PLL models found in power system")
        else:
            # Initialize power system without PLL
            ps = dps.PowerSystemModel(model=model)
            print("PowerSystemModel instance created without PLL")
        
        # === Power Flow Analysis ===
        try:
            print("Running power flow...")
            ps.power_flow()
            print("Power flow completed successfully")
        except Exception as e:
            print("Error in power flow:")
            import traceback
            traceback.print_exc()
            raise
        
        # === Dynamic Simulation Initialization ===
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
        
        # === Generator Control Configuration ===
        gen_control = sim_params.get('generatorControl', {})
        governor_params = gen_control.get('governor', {})
        avr_params = gen_control.get('avr', {})
        
        print("\nGenerator control parameters:", {
            'governor': governor_params,
            'avr': avr_params
        })
        
        # Configure governor if enabled
        if governor_params.get('enabled', False):
            try:
                print("\nSetting governor parameters...")
                # Configure TGOV1 (Thermal Governor) parameters
                ps.gov['TGOV1'].par['R'][:] = governor_params.get('R', 0.05)  # Speed droop
                ps.gov['TGOV1'].par['D_t'][:] = governor_params.get('D_t', 0.02)  # Turbine damping
                ps.gov['TGOV1'].par['V_min'][:] = governor_params.get('V_min', 0)  # Min valve position
                ps.gov['TGOV1'].par['V_max'][:] = governor_params.get('V_max', 1)  # Max valve position
                ps.gov['TGOV1'].par['T_1'][:] = governor_params.get('T_1', 0.1)  # Governor time constant
                ps.gov['TGOV1'].par['T_2'][:] = governor_params.get('T_2', 0.09)  # Lead time constant
                ps.gov['TGOV1'].par['T_3'][:] = governor_params.get('T_3', 0.2)  # Lag time constant
                
                print("Governor parameters set")
                
                # Reinitialize model with new governor parameters
                print("Re-initializing model after governor parameter update...")
                ps.init_dyn_sim()
                print("Model re-initialized successfully")
                
            except Exception as e:
                print("Error setting governor parameters:")
                import traceback
                traceback.print_exc()
                raise
        
        # Configure AVR if enabled
        if avr_params.get('enabled', False):
            try:
                print("\nSetting AVR parameters...")
                # Configure SEXS (Simplified Excitation System) parameters
                ps.avr['SEXS'].par['K'][:] = avr_params.get('K', 100)  # AVR gain
                ps.avr['SEXS'].par['T_a'][:] = avr_params.get('T_a', 2.0)  # Time constant Ta
                ps.avr['SEXS'].par['T_b'][:] = avr_params.get('T_b', 10.0)  # Time constant Tb
                ps.avr['SEXS'].par['T_e'][:] = avr_params.get('T_e', 0.5)  # Exciter time constant
                ps.avr['SEXS'].par['E_min'][:] = avr_params.get('E_min', -3)  # Min field voltage
                ps.avr['SEXS'].par['E_max'][:] = avr_params.get('E_max', 3)  # Max field voltage
                
                print("AVR parameters set")
                
                # Reinitialize model with new AVR parameters
                print("Re-initializing model after AVR parameter update...")
                ps.init_dyn_sim()
                print("Model re-initialized successfully")
                
            except Exception as e:
                print("Error setting AVR parameters:")
                import traceback
                traceback.print_exc()
                raise
        
        # === Model State Verification ===
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

        # === Noise Configuration ===
        print("\nSetting up simulation...")
        
        # Get noise parameters
        noise_params = sim_params.get('noiseParams', {})
        load_noise = noise_params.get('loads', {})
        gen_noise = noise_params.get('generators', {})
        
        if load_noise.get('enabled', False) or gen_noise.get('enabled', False):
            try:
                def noisy_state_derivatives(t, x, v):
                    """
                    Wrapper function that adds noise to the system state derivatives.
                    
                    Args:
                        t: Current simulation time
                        x: State vector
                        v: Input vector
                    
                    Returns:
                        Modified state derivatives with added noise
                    """
                    # Get base state derivatives
                    dx = ps.state_derivatives(t, x, v)
                    
                    # Add noise to loads if enabled
                    if load_noise.get('enabled', False):
                        try:
                            # Get current setpoints
                            g_setp = ps.loads['DynamicLoad']._input_values['g_setp'].copy()
                            b_setp = ps.loads['DynamicLoad']._input_values['b_setp'].copy()
                            
                            # Generate and apply noise
                            magnitude = load_noise.get('magnitude', 0.1)
                            g_noise = magnitude * np.random.randn(len(g_setp))
                            b_noise = magnitude * np.random.randn(len(b_setp))

                            # Apply filtered noise to setpoints
                            filter_time = load_noise.get('filter_time', 0.1)
                            if hasattr(ps.loads['DynamicLoad'], '_noise_states'):
                                ps.loads['DynamicLoad']._noise_states = np.exp(-t/filter_time) * ps.loads['DynamicLoad']._noise_states + np.sqrt(2*t/filter_time) * np.random.randn(len(g_setp))
                            else:
                                ps.loads['DynamicLoad']._noise_states = np.zeros(len(g_setp))
                            
                            filtered_noise = ps.loads['DynamicLoad']._noise_states
                            ps.loads['DynamicLoad']._input_values['g_setp'] = g_setp + magnitude * filtered_noise
                            ps.loads['DynamicLoad']._input_values['b_setp'] = b_setp + magnitude * filtered_noise
                        except Exception as e:
                            print('Error applying load noise:', e)
                    
                    # Add noise to generators if enabled
                    if gen_noise.get('enabled', False):
                        try:
                            # Get current generator mechanical power
                            p_mech = ps.generators['GEN']._input_values['p_mech'].copy()
                            
                            # Generate and apply filtered noise
                            magnitude = gen_noise.get('magnitude', 0.1)
                            filter_time = gen_noise.get('filter_time', 0.1)
                            
                            if hasattr(ps.generators['GEN'], '_noise_states'):
                                ps.generators['GEN']._noise_states = np.exp(-t/filter_time) * ps.generators['GEN']._noise_states + np.sqrt(2*t/filter_time) * np.random.randn(len(p_mech))
                            else:
                                ps.generators['GEN']._noise_states = np.zeros(len(p_mech))
                            
                            filtered_noise = ps.generators['GEN']._noise_states
                            ps.generators['GEN']._input_values['p_mech'] = p_mech + magnitude * filtered_noise
                        except Exception as e:
                            print('Error applying generator noise:', e)
                    
                    return dx
                
                print("Creating solver with noise parameters:", {
                    'load_noise': load_noise,
                    'gen_noise': gen_noise
                })
                
                # Use ModifiedEulerDAE solver with noisy state derivatives
                sol = dps_sol.ModifiedEulerDAE(
                    noisy_state_derivatives, 
                    ps.solve_algebraic, 
                    0, 
                    ps.x_0.copy(), 
                    t_end=20, 
                    max_step=5e-3
                )
            except Exception as e:
                print("Error in noise setup:", str(e))
                import traceback
                traceback.print_exc()
                raise
        else:
            # Use regular solver without noise
            sol = dps_sol.ModifiedEulerDAE(
                ps.state_derivatives, 
                ps.solve_algebraic, 
                0, 
                ps.x_0.copy(), 
                t_end=20, 
                max_step=5e-3
            )

        # Initialize results storage
        results = defaultdict(list)
        
        # Initialize PLL-specific results if enabled
        if pll_params.get('enabled', False):
            results.update({
                'v_angle': [],
                'pll1_angle': [],
                'pll2_angle': [],
                'pll1_freq': [],
                'pll2_freq': []
            })
        
        # Send initial data
        update_queue.put({
            'type': 'init',
            'data': {
                't_end': sol.t_end,
                'dt': sol.dt
            }
        })

        # Run complete simulation
        while sol.t < sol.t_end:
            # Apply short circuit if configured
            if sim_parameters['shortCircuit']['busId']:
                sc_time = sim_parameters['shortCircuit']['startTime']
                sc_duration = sim_parameters['shortCircuit']['duration']
                sc_bus_idx = int(sim_parameters['shortCircuit']['busId'])
                sc_admittance = sim_parameters['shortCircuit']['admittance']
                
                if sc_time <= sol.t <= (sc_time + sc_duration):
                    ps.y_bus_red_mod[(sc_bus_idx,) * 2] = sc_admittance
                else:
                    ps.y_bus_red_mod[(sc_bus_idx,) * 2] = 0

            # Only apply load changes if they are non-zero, otherwise keep initial values
            if sim_parameters['step1']['time'] <= sol.t:
                g_setp = sim_parameters['step1']['g_setp']
                ps.loads['DynamicLoad'].set_input('g_setp', 
                    g_setp if g_setp != 0 else ps.loads['DynamicLoad']._input_values['g_setp'][sim_parameters['step1']['load_index']], 
                    sim_parameters['step1']['load_index'])
                b_setp = sim_parameters['step1']['b_setp']
                ps.loads['DynamicLoad'].set_input('b_setp', 
                    b_setp if b_setp != 0 else ps.loads['DynamicLoad']._input_values['b_setp'][sim_parameters['step1']['load_index']], 
                    sim_parameters['step1']['load_index'])

            if sim_parameters['step2']['time'] <= sol.t:
                g_setp = sim_parameters['step2']['g_setp']
                ps.loads['DynamicLoad'].set_input('g_setp', 
                    g_setp if g_setp != 0 else ps.loads['DynamicLoad']._input_values['g_setp'][sim_parameters['step2']['load_index']], 
                    sim_parameters['step2']['load_index'])
                b_setp = sim_parameters['step2']['b_setp']
                ps.loads['DynamicLoad'].set_input('b_setp', 
                    b_setp if b_setp != 0 else ps.loads['DynamicLoad']._input_values['b_setp'][sim_parameters['step2']['load_index']], 
                    sim_parameters['step2']['load_index'])

            if sim_parameters['lineOutage']['lineId'] and sol.t >= sim_parameters['lineOutage']['time']:
                ps.lines['Line'].event(ps, sim_parameters['lineOutage']['lineId'], 'disconnect')
                sim_parameters['lineOutage']['lineId'] = ''  # Reset to prevent multiple disconnections

            # Apply tap changes if enabled
            if sim_parameters['tapChanger']['enabled']:
                for change in sim_parameters['tapChanger']['changes']:
                    if change['time'] <= sol.t < (change['time'] + 9):
                        trafo_idx = int(change['transformerId'])
                        ps.trafos['DynTrafo'].set_input('ratio_from', change['ratioChange'], trafo_idx)

            # Store results at this time step
            step_data = {
                't': float(sol.t),
                'x': convert_to_serializable(sol.x.copy()),
                'v': convert_to_serializable(sol.v.copy()),
                'v_magnitude': convert_to_serializable(np.abs(sol.v)),
                'v_angle': convert_to_serializable(np.angle(sol.v)),
                'gen_speed': convert_to_serializable(ps.gen['GEN'].speed(sol.x, sol.v)),
                'gen_I': convert_to_serializable(ps.gen['GEN'].I(sol.x, sol.v)),
                'load_I': convert_to_serializable(ps.loads['DynamicLoad'].I(sol.x, sol.v)),
                'load_P': convert_to_serializable(ps.loads['DynamicLoad'].P(sol.x, sol.v)),
                'load_Q': convert_to_serializable(ps.loads['DynamicLoad'].Q(sol.x, sol.v)),
                'trafo_current_from': convert_to_serializable(ps.trafos['DynTrafo'].i_from(sol.x, sol.v)),
                'trafo_current_to': convert_to_serializable(ps.trafos['DynTrafo'].i_to(sol.x, sol.v))
            }

            # Add PLL results if PLL is enabled
            if pll_params.get('enabled', False):
                try:
                    print(f"\nCollecting PLL data at t={sol.t}...")
                    
                    # Verify PLL models exist
                    if not hasattr(ps, 'pll'):
                        raise AttributeError("PLL models not found in power system")
                    
                    if 'PLL1' not in ps.pll or 'PLL2' not in ps.pll:
                        raise KeyError("Required PLL models (PLL1 and PLL2) not found")
                    
                    # Get voltage angles and PLL outputs
                    v_angle = np.angle(sol.v)
                    pll1_output = ps.pll['PLL1'].output(sol.x, sol.v)
                    pll2_output = ps.pll['PLL2'].output(sol.x, sol.v)
                    
                    # Get frequency estimates and convert to Hz
                    pll1_freq = ps.pll['PLL1'].freq_est(sol.x, sol.v)
                    pll2_freq = ps.pll['PLL2'].freq_est(sol.x, sol.v)
                    
                    # Convert frequency from pu to Hz (assuming 50 Hz base frequency)
                    base_freq = 50.0  # Hz
                    # Add base frequency to the deviation to get actual frequency
                    pll1_freq = base_freq * (1.0 + pll1_freq)
                    pll2_freq = base_freq * (1.0 + pll2_freq)
                    
                    # Store PLL data in step_data
                    step_data.update({
                        'pll1_angle': convert_to_serializable(pll1_output),
                        'pll2_angle': convert_to_serializable(pll2_output),
                        'pll1_freq': convert_to_serializable(pll1_freq),
                        'pll2_freq': convert_to_serializable(pll2_freq)
                    })
                    
                except Exception as e:
                    print(f"Error getting PLL results: {str(e)}")
                    # Initialize with empty arrays if there's an error
                    step_data.update({
                        'pll1_angle': [],
                        'pll2_angle': [],
                        'pll1_freq': [],
                        'pll2_freq': []
                    })
            
            # Send data to the queue
            update_queue.put({
                'type': 'step',
                'data': step_data
            })
            
            # Also store in results for final return
            for key, value in step_data.items():
                results[key].append(value)

            # Solve for next time step
            sol.step()

        # Convert all results to serializable format
        print("\nPreparing final results...")
        serializable_results = {k: convert_to_serializable(v) for k, v in results.items()}

        # After serializable_results is defined, extract final power flow for each line
        lines_power = {}
        try:
            for i, line in enumerate(getattr(ps.lines['Line'], 'models', [ps.lines['Line']])):
                line_id = line.name if hasattr(line, 'name') else f"L{i+1}"
                lines_power[line_id] = {
                    'p_from': float(np.real(line.p_from(sol.x, sol.v)[i])),
                    'q_from': float(np.imag(line.q_from(sol.x, sol.v)[i])),
                    'p_to': float(np.real(line.p_to(sol.x, sol.v)[i])),
                    'q_to': float(np.imag(line.q_to(sol.x, sol.v)[i]))
                }
        except Exception as e:
            print(f"Error extracting line power flow: {e}")
        serializable_results['lines'] = lines_power

        # Now perform eigenvalue analysis at final operating point
        try:
            print("\nStarting eigenvalue analysis at final operating point...")
            ps_lin = dps_mdl.PowerSystemModelLinearization(ps)
            ps_lin.linearize()  # Linearize around final operating point
            ps_lin.eigenvalue_decomposition()

            # Get eigenvalues (keep as numpy array)
            eigs = ps_lin.eigs
            print("\nEigenvalues at final operating point:", eigs)

            # Get mode shape for electromechanical modes
            mode_idx = ps_lin.get_mode_idx(['em'], damp_threshold=0.3)
            print("\nElectromechanical mode indices:", mode_idx)
            
            # Prepare data for frontend in the correct format
            eigenvalue_data = {
                'real': [float(e.real) for e in eigs],  # Array of real parts
                'imag': [float(e.imag) for e in eigs],  # Array of imaginary parts
                'frequency': [float(abs(e.imag/(2*np.pi))) for e in eigs],  # Frequency in Hz
                'damping': [float(-100 * e.real/abs(e)) for e in eigs],  # Damping ratio in %
                'electromechanical_modes': mode_idx.tolist() if mode_idx is not None else []
            }

            print("\nEigenvalue data being sent to frontend:", eigenvalue_data)
            print("\nShape of arrays:")
            print("real:", len(eigenvalue_data['real']))
            print("imag:", len(eigenvalue_data['imag']))
            print("electromechanical_modes:", len(eigenvalue_data['electromechanical_modes']))

            # Try to add mode shapes if possible
            try:
                rev = ps_lin.rev
                print("\nCalculating mode shapes...")
                state_idx = ps.gen['GEN'].state_idx_global
                print("Generator state indices:", state_idx)
                
                # Get speed indices from the structured array
                speed_indices = []
                for gen_states in state_idx:
                    for i, state in enumerate(gen_states):
                        if i == 1:  # Speed is typically the second state variable for generators
                            speed_indices.append(state)
                
                print("Speed state indices:", speed_indices)
                
                if speed_indices:
                    mode_shape = rev[np.ix_(speed_indices, mode_idx)]
                    print("\nMode shape matrix shape:", mode_shape.shape)
                    print("Mode shape values:", mode_shape)
                    
                    if mode_shape is not None:
                        # Normalize mode shapes like TOPS does
                        for i in range(mode_shape.shape[1]):
                            # Find generator with max magnitude for this mode
                            max_idx = np.argmax(np.abs(mode_shape[:, i]))
                            max_value = mode_shape[max_idx, i]
                            
                            if abs(max_value) > 0:
                                # Rotate all vectors so max generator is at 0° angle
                                # and scale relative to max magnitude
                                mode_shape[:, i] = mode_shape[:, i] * np.exp(-1j * np.angle(max_value)) / np.abs(max_value)
                        
                        magnitude = np.abs(mode_shape).tolist()
                        angle = np.angle(mode_shape, deg=True).tolist()
                        print("\nMode shape data being added:")
                        print("Magnitude:", magnitude)
                        print("Angle:", angle)
                        
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

            # Print summary of modes
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
            
            # Send empty eigenvalue data
            empty_eigenvalue_data = {
                'real': [],
                'imag': [],
                'frequency': [],
                'damping': [],
                'electromechanical_modes': []
            }
            
            results['eigenvalues'] = empty_eigenvalue_data
            serializable_results['eigenvalues'] = empty_eigenvalue_data

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

        # Debug: print final results keys and lines power flow
        print("Final serializable_results keys:", serializable_results.keys())
        print("Final lines power flow:", serializable_results.get('lines'))

        # Add bus_power_raw to serializable_results before sending complete message
        try:
            serializable_results['bus_power_raw'] = [str(s) for s in ps.s_0]
        except Exception as e:
            print('Error serializing ps.s_0:', e)

        # Store final results
        simulation_state['results'] = dict(serializable_results)
        
        # Send completion message with all results
        update_queue.put({
            'type': 'complete',
            'data': serializable_results
        })
        
        simulation_state['running'] = False
        
        try:
            print('Power flow bus injection results (ps.s_0):', ps.s_0)
        except Exception as e:
            print('Error printing ps.s_0:', e)
        
    except Exception as e:
        print(f"Error in simulation thread: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Send error message
        update_queue.put({
            'type': 'error',
            'data': str(e)
        })
        
        simulation_state['running'] = False

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
        sim_parameters.update(data)
        
        return jsonify({'status': 'success', 'parameters': sim_parameters})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/start_simulation', methods=['POST'])
def start_simulation():
    """
    API endpoint to start a new simulation.
    
    Expects a JSON payload with simulation parameters.
    Starts the simulation in a separate thread and returns the simulation ID.
    """
    if simulation_state['running']:
        return jsonify({'status': 'error', 'message': 'Simulation already running'}), 400
    
    try:
        # Clear previous results
        simulation_state['results'].clear()
        
        # Start simulation in a separate thread
        sim_thread = threading.Thread(target=run_simulation_thread, args=(request.json,))
        sim_thread.daemon = True
        sim_thread.start()
        
        return jsonify({'status': 'success', 'message': 'Simulation started'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/get_results', methods=['GET'])
def get_results():
    if not simulation_state['results']:
        return jsonify({'error': 'No results available'}), 400

    return jsonify(dict(simulation_state['results']))

@app.route('/api/simulation_updates', methods=['GET'])
def simulation_updates():
    """
    Server-Sent Events (SSE) endpoint for real-time simulation updates.
    
    Returns a stream of events containing simulation progress and results.
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

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='127.0.0.1') 
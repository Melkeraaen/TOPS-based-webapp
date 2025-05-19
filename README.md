# TOPS Web Application

A web-based interface for TOPS (Tiny Open Power System Simulator).

## Features

- Interactive power system simulation
- Real-time visualization of system states
- Modal analysis with eigenvalue and mode shape plots
- Support for:
  - Load changes
  - Line outages and reconnection
  - Short circuits
  - Tap changer control

## Structure

- `backend/`: Flask server interfacing with TOPS
- `frontend/`: React-based web interface

## Setup

1. Install dependencies:
   ```bash
   # Backend
   cd backend
   pip install -r requirements.txt

   # Frontend
   cd ../frontend
   npm install
   ```

2. Run the application:
   ```bash
   # Start backend (from backend directory)
   python app.py

   # Start frontend (from frontend directory)
   npm start
   ```

## License

This project is licensed under the same terms as TOPS. 

## How everything works

The application consists of two main parts:

### Frontend (React)
- Built with React.js
- Provides the user interface for:
  - Configuring power system parameters
  - Visualizing simulation results
  - Interactive data display
- Communicates with the backend through REST API calls

### Backend (Python/Flask)
- Built with Flask
- Handles:
  - Power system calculations
  - Data processing
  - Simulation logic
- Uses the TOPS library for core power system computations
- Provides API endpoints for the frontend to interact with

### Data Flow
1. User inputs parameters through the frontend interface
2. Frontend sends data to backend API
3. Backend processes the data using TOPS library
4. Results are sent back to frontend
5. Frontend displays the results in interactive visualizations

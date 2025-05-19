# Power system simulator

A web-based interface for for a digital twin for the K2a Power system. 
the app is based on the TOPS (Tiny Open Power System Simulator) library. More details here: https://github.com/hallvar-h/TOPS

## Thesis

This project was developed as part of a Bachelor's thesis in Electrification and Digitalization at the Norwegian University of Science and Technology (NTNU). The complete thesis will be available at NTNU Open under the Faculty of Information Technology and Electrical Engineering (IE).

## Features

- Interactive power system simulation
- Real-time visualization of system states
- Graph vizualisation for the power system
- Modal analysis with eigenvalue and mode shape plots
- Support for:
  - Load changes
  - Line outages
  - line reconnection
  - Short circuits
  - Tap changer
  - Power flow visualization
  - island detection

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
   cd frontend
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

## Bugs
Note: This is a development build served as a port of bachelor thesis, some bugs should be expected :D
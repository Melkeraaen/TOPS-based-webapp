# TOPS Web Application

A web-based interface for TOPS (Tiny Open Power System Simulator).

## Features

- Interactive power system simulation
- Real-time visualization of system states
- Modal analysis with eigenvalue and mode shape plots
- Support for:
  - Load changes
  - Line outages
  - Short circuits
  - Tap changer control
  - Generator control (AVR & Governor)

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

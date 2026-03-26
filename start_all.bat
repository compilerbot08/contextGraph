@echo off
setlocal

echo [1/3] Sanitizing environment...

:: Force kill any process on our service ports (4000, 5000, 8000, 5173)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a 2>nul

echo [2/3] Launching Backend Services...

cd graph-service
start "Graph Service" npm run dev
cd ..

cd api-gateway
start "API Gateway" npm run dev
cd ..

cd llm-service
start "LLM Service" python main.py
cd ..

echo [3/3] Launching Frontend...
cd frontend
start "Frontend" npm run dev
cd ..

echo.
echo ======================================================
echo  Context Graph System started!
echo  Frontend: http://localhost:5173
echo ======================================================
pause

#!/bin/bash

# Start both Express and ElysiaJS servers and Nginx

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "Bun is not installed. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    # Source the shell profile to make bun available in the current session
    source ~/.bashrc || source ~/.zshrc
fi

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "Nginx is not installed. Please install Nginx and try again."
    exit 1
fi

# Create a .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOL
PORT=3030
ELYSIA_PORT=3031
# Add your database and Redis configuration here
EOL
    echo ".env file created. Please update it with your database and Redis configuration."
fi

# Start Express server in the background using Bun
echo "Starting Express server with Bun..."
PORT=3030 bun run src/index.js &
EXPRESS_PID=$!

# Start ElysiaJS server in the background using Bun
echo "Starting ElysiaJS server with Bun..."
ELYSIA_PORT=3031 bun run src/elysia-server.js &
ELYSIA_PID=$!

# Wait for servers to start
echo "Waiting for servers to start..."
sleep 3

# Check if Nginx config is valid
echo "Checking Nginx configuration..."
sudo nginx -t -c $(pwd)/nginx.conf

if [ $? -eq 0 ]; then
    # Start Nginx with our configuration
    echo "Starting Nginx..."
    sudo nginx -c $(pwd)/nginx.conf
else
    echo "Nginx configuration is invalid. Please fix the errors and try again."
    # Kill the servers
    kill $EXPRESS_PID
    kill $ELYSIA_PID
    exit 1
fi

echo "Hybrid setup is running!"
echo "Express server is running on port 3030"
echo "ElysiaJS server is running on port 3031"
echo "Nginx is routing traffic on port 80"
echo ""
echo "The high-traffic endpoint /university/:uni_id/course/:year/:semester (POST) is being handled by ElysiaJS"
echo "All other endpoints are being handled by Express"
echo ""
echo "Press Ctrl+C to stop all servers"

# Trap Ctrl+C to gracefully shut down all servers
trap "echo 'Stopping servers...'; kill $EXPRESS_PID; kill $ELYSIA_PID; sudo nginx -s stop; echo 'All servers stopped.'; exit" INT

# Keep the script running
wait 
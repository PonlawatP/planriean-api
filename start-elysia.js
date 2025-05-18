#!/usr/bin/env node

// This script starts the ElysiaJS server with Bun
console.log('Starting ElysiaJS server with Bun...');

const { execSync } = require('child_process');

try {
  // Check if Bun is installed
  execSync('bun --version', { stdio: 'ignore' });
  console.log('Bun is installed, starting server...');
  
  // Start the ElysiaJS server with Bun
  execSync('bun run src/elysia-server.js', { stdio: 'inherit' });
} catch (error) {
  console.error('Error: Bun is not installed or there was an error starting the server.');
  console.log('Please install Bun with: curl -fsSL https://bun.sh/install | bash');
  console.log('Then try again.');
  process.exit(1);
} 
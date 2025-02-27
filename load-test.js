// Load testing script for the hybrid setup
// Run with: bun run load-test.js

const http = require('http');

// Configuration
const EXPRESS_URL = 'http://localhost:3030/university/1/course/2023/1';
const ELYSIA_URL = 'http://localhost:3031/university/1/course/2023/1';
const NGINX_URL = 'http://localhost/university/1/course/2023/1';
const NUM_REQUESTS = 5000;
const CONCURRENCY = 500;

// Sample request data
const requestData = JSON.stringify({
  type: ["004*"],
  code: [],
  date: [],
  master: [],
  time: "total"
});

// Helper function to make a POST request
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(requestData);
    req.end();
  });
}

// Function to run load test
async function runLoadTest(url, name) {
  console.log(`\n🚀 Starting load test for ${name}...`);
  console.log(`URL: ${url}`);
  console.log(`Requests: ${NUM_REQUESTS}, Concurrency: ${CONCURRENCY}`);
  
  const startTime = Date.now();
  let completed = 0;
  let successful = 0;
  let failed = 0;
  
  // Create batches of concurrent requests
  const batches = Math.ceil(NUM_REQUESTS / CONCURRENCY);
  
  for (let i = 0; i < batches; i++) {
    const batchSize = Math.min(CONCURRENCY, NUM_REQUESTS - (i * CONCURRENCY));
    const batchPromises = [];
    
    for (let j = 0; j < batchSize; j++) {
      batchPromises.push(
        makeRequest(url)
          .then(result => {
            completed++;
            if (result.statusCode === 200) {
              successful++;
            } else {
              failed++;
            }
            
            // Show progress
            if (completed % 500 === 0 || completed === NUM_REQUESTS) {
              const elapsedSec = (Date.now() - startTime) / 1000;
              console.log(`Progress: ${completed}/${NUM_REQUESTS} (${(completed/NUM_REQUESTS*100).toFixed(1)}%) - ${(completed/elapsedSec).toFixed(2)} req/sec`);
            }
            
            return result;
          })
          .catch(error => {
            completed++;
            failed++;
            return { error };
          })
      );
    }
    
    await Promise.all(batchPromises);
  }
  
  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000;
  
  console.log(`\n📊 Results for ${name}:`);
  console.log(`Total time: ${totalTime.toFixed(2)} seconds`);
  console.log(`Requests per second: ${(NUM_REQUESTS / totalTime).toFixed(2)}`);
  console.log(`Success rate: ${(successful / NUM_REQUESTS * 100).toFixed(2)}%`);
  console.log(`Failed requests: ${failed}`);
  
  return {
    name,
    totalTime,
    requestsPerSecond: NUM_REQUESTS / totalTime,
    successRate: successful / NUM_REQUESTS * 100,
    failed
  };
}

// Main function to run all tests
async function main() {
  console.log('🔥 HYBRID SETUP LOAD TEST 🔥');
  console.log('============================');
  
  try {
    // Test Express server
    const expressResults = await runLoadTest(EXPRESS_URL, 'Express');
    
    // Test ElysiaJS server
    const elysiaResults = await runLoadTest(ELYSIA_URL, 'ElysiaJS');
    
    // Test Nginx (which should route to ElysiaJS for this endpoint)
    const nginxResults = await runLoadTest(NGINX_URL, 'Nginx -> ElysiaJS');
    
    // Compare results
    console.log('\n🏆 COMPARISON:');
    console.log('============================');
    console.log(`Express: ${expressResults.requestsPerSecond.toFixed(2)} req/sec`);
    console.log(`ElysiaJS: ${elysiaResults.requestsPerSecond.toFixed(2)} req/sec`);
    console.log(`Nginx -> ElysiaJS: ${nginxResults.requestsPerSecond.toFixed(2)} req/sec`);
    
    const improvement = (elysiaResults.requestsPerSecond / expressResults.requestsPerSecond - 1) * 100;
    console.log(`\nElysiaJS is ${improvement.toFixed(2)}% faster than Express!`);
    
  } catch (error) {
    console.error('Error running load tests:', error);
  }
}

main(); 
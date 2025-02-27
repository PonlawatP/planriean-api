# Planriean Subjects Service - Hybrid Express/ElysiaJS Setup

This project uses a hybrid approach with Express and ElysiaJS to handle high-concurrency endpoints.

## Architecture

- **Express**: Handles most endpoints
- **ElysiaJS with Bun**: Handles the high-traffic `/course/:year/:semester` POST endpoint
- **Nginx**: Routes traffic between the two servers

## Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime and toolkit
- [Nginx](https://nginx.org/) - Web server and reverse proxy

## Installation

1. Install dependencies:
   ```
   bun install
   ```

2. Make sure the scripts are executable:
   ```
   chmod +x start-hybrid.sh
   ```

3. Create a `.env` file with your configuration:
   ```
   PORT=3030
   ELYSIA_PORT=3031
   DB_HOST=your_db_host
   DB_SQL_USER=your_db_user
   DB_SQL_PASS=your_db_password
   DB_NAME=your_db_name
   DB_PORT=5432
   REDIS_HOST=your_redis_host
   REDIS_PORT=6379
   REDIS_PASS=your_redis_password
   ```

## Running the Application

### Development Mode

To run only the Express server:
```
bun run dev
```

### Hybrid Mode

To run both Express and ElysiaJS servers with Nginx:
```
bun run start-hybrid
```

This will:
1. Start the Express server on port 3030
2. Start the ElysiaJS server on port 3031
3. Configure Nginx to route traffic between them

### ElysiaJS Only

To run only the ElysiaJS server:
```
bun run start-elysia
```

## Performance Considerations

The hybrid setup is designed to handle high-concurrency scenarios:

- The `/course/:year/:semester` POST endpoint can handle 5000+ requests in 2-3 seconds
- ElysiaJS with Bun provides significantly better performance for this high-traffic endpoint
- Redis caching is implemented to further improve response times

## Troubleshooting

If you encounter issues with the hybrid setup:

1. Check if Bun is installed correctly:
   ```
   bun --version
   ```

2. Verify Nginx configuration:
   ```
   sudo nginx -t -c $(pwd)/nginx.conf
   ```

3. Check the logs for both servers:
   ```
   tail -f logs/express.log
   tail -f logs/elysia.log
   ```

## License

ISC

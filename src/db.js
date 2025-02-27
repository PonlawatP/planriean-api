const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_SQL_USER,
  password: process.env.DB_SQL_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT, // default Postgres port
  database: process.env.DB_NAME
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
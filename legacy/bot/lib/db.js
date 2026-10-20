const { Pool } = require('pg');
const { isMulti } = require('./tenancy');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DB_POOL_MAX || (isMulti() ? '50' : '10'), 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

pool.on('connect', c => c.query("SET timezone = 'Asia/Riyadh'"));
pool.on('error', err => console.error('[DB]', err.message));

module.exports = { pool };
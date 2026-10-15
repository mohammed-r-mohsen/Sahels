const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', c => c.query("SET timezone = 'Asia/Riyadh'"));
module.exports = { pool };
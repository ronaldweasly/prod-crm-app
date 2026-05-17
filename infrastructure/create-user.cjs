const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });

  const hash = await bcrypt.hash('admin', 12);
  
  await pool.query(
    `INSERT INTO users (email, password, role, name, active) 
     VALUES ($1, $2, $3, $4, $5) 
     ON CONFLICT (email) DO UPDATE SET password = $2`,
    ['admin@gmail.com', hash, 'Admin', 'Admin User', true]
  );

  console.log('✅ User admin@gmail.com created with password: admin');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });

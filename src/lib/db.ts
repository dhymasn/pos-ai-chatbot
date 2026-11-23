import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT) || 4000,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function executeQuery<T>(query: string, params: any[] = []): Promise<T> {
  const [rows] = await pool.execute(query, params);
  return rows as T;
}

export default pool;
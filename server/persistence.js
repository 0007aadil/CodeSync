import pg from 'pg';
import Redis from 'ioredis';
import * as Y from 'yjs';

const { Pool } = pg;

let pool;
let redis;
let dbAvailable = false;
let redisAvailable = false;

/**
 * Initialize database and Redis connections
 */
export async function initPersistence() {
  // Try PostgreSQL
  try {
    const dbUrl = process.env.DATABASE_URL || '';
    const useSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('.neon.tech');
    pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      ...(useSSL && { ssl: { rejectUnauthorized: false } }),
    });
    await pool.query('SELECT 1');
    dbAvailable = true;
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    console.warn('⚠️  PostgreSQL not available — running without persistence:', err.message);
    pool = null;
  }

  // Try Redis
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 1) return null; // stop retrying quickly
        return 500;
      },
    });
    // Suppress unhandled error events
    redis.on('error', () => {});
    await redis.connect();
    redisAvailable = true;
    console.log('✅ Redis connected');
  } catch (err) {
    console.warn('⚠️  Redis not available — running without cache');
    if (redis) {
      try { redis.disconnect(); } catch (e) {}
    }
    redis = null;
    redisAvailable = false;
  }
}

/**
 * Ensure a document exists in the database
 */
export async function ensureDocument(docName, language = 'javascript') {
  if (!dbAvailable) return;
  try {
    await pool.query(
      `INSERT INTO documents (id, name, language) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [docName, docName, language]
    );
  } catch (err) {
    console.error('Error ensuring document:', err.message);
  }
}

/**
 * Store Yjs document state to PostgreSQL
 */
export async function storeDocState(docName, ydoc) {
  if (!dbAvailable) return;
  try {
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const content = ydoc.getText('monaco').toString();
    await pool.query(
      `UPDATE documents SET yjs_state = $1, content = $2, updated_at = NOW() WHERE id = $3`,
      [state, content, docName]
    );
    console.log(`💾 Saved document: ${docName}`);
  } catch (err) {
    console.error('Error storing doc state:', err.message);
  }
}

/**
 * Load Yjs document state from PostgreSQL
 */
export async function loadDocState(docName) {
  if (!dbAvailable) return null;
  try {
    const result = await pool.query(
      `SELECT yjs_state FROM documents WHERE id = $1`,
      [docName]
    );
    if (result.rows.length > 0 && result.rows[0].yjs_state) {
      return new Uint8Array(result.rows[0].yjs_state);
    }
  } catch (err) {
    console.error('Error loading doc state:', err.message);
  }
  return null;
}

/**
 * Cache document state in Redis (for fast access)
 */
export async function cacheDocState(docName, ydoc) {
  if (!redisAvailable) return;
  try {
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    await redis.setex(`doc:${docName}`, 3600, state.toString('base64'));
  } catch (err) {
    console.error('Error caching doc state:', err.message);
  }
}

/**
 * Load document state from Redis cache
 */
export async function loadCachedDocState(docName) {
  if (!redisAvailable) return null;
  try {
    const data = await redis.get(`doc:${docName}`);
    if (data) {
      return new Uint8Array(Buffer.from(data, 'base64'));
    }
  } catch (err) {
    console.error('Error loading cached doc state:', err.message);
  }
  return null;
}

/**
 * Append to operation log
 */
export async function appendOpLog(docName, update, clientId) {
  if (!dbAvailable) return;
  try {
    await pool.query(
      `INSERT INTO op_log (document_id, operation, client_id) VALUES ($1, $2, $3)`,
      [docName, Buffer.from(update), clientId || 'unknown']
    );
  } catch (err) {
    console.error('Error appending op log:', err.message);
  }
}

/**
 * Get all rooms (documents) with metadata
 */
export async function listDocuments() {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT id, name, language, created_at, updated_at FROM documents ORDER BY updated_at DESC LIMIT 50`
    );
    return result.rows;
  } catch (err) {
    console.error('Error listing documents:', err.message);
    return [];
  }
}

/**
 * Clean up connections
 */
export async function closePersistence() {
  if (pool) await pool.end();
  if (redis) redis.disconnect();
}

/**
 * Get the database pool (for auth routes)
 */
export function getPool() {
  return dbAvailable ? pool : null;
}

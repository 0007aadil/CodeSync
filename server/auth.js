import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'codesync-dev-secret-change-in-production';
const JWT_EXPIRY = '7d';

// ============================================================
// In-memory fallback store (used when PostgreSQL is unavailable)
// Data persists only while server is running — for dev/testing
// ============================================================
let sharedMemoryStore = null;
function getMemoryStore() {
  if (!sharedMemoryStore) sharedMemoryStore = new MemoryStore();
  return sharedMemoryStore;
}

class MemoryStore {
  constructor() {
    this.users = [];
    this.files = [];
    this.nextUserId = 1;
    this.nextFileId = 1;
    console.log('📦 Auth using in-memory store (no PostgreSQL)');
  }

  // --- Users ---
  findUserByEmail(email) {
    return this.users.find(u => u.email === email) || null;
  }
  findUserById(id) {
    return this.users.find(u => u.id === id) || null;
  }
  createUser({ email, username, password_hash, avatar }) {
    const user = {
      id: this.nextUserId++,
      email, username, password_hash,
      avatar: avatar || '🦊',
      created_at: new Date().toISOString(),
    };
    this.users.push(user);
    return { ...user };
  }

  // --- Files ---
  createFile({ user_id, filename, language, content, room_id }) {
    const file = {
      id: this.nextFileId++,
      user_id, filename,
      language: language || 'javascript',
      content: content || '',
      room_id: room_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.files.push(file);
    return { ...file };
  }
  updateFile(id, userId, updates) {
    const file = this.files.find(f => f.id === parseInt(id) && f.user_id === userId);
    if (!file) return null;
    if (updates.filename !== undefined) file.filename = updates.filename;
    if (updates.language !== undefined) file.language = updates.language;
    if (updates.content !== undefined) file.content = updates.content;
    file.updated_at = new Date().toISOString();
    return { ...file };
  }
  listFiles(userId) {
    return this.files
      .filter(f => f.user_id === userId)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 100)
      .map(f => ({
        id: f.id, filename: f.filename, language: f.language,
        room_id: f.room_id, size_bytes: (f.content || '').length,
        created_at: f.created_at, updated_at: f.updated_at,
      }));
  }
  getFile(id, userId) {
    const file = this.files.find(f => f.id === parseInt(id) && f.user_id === userId);
    return file ? { ...file } : null;
  }
  deleteFile(id, userId) {
    const idx = this.files.findIndex(f => f.id === parseInt(id) && f.user_id === userId);
    if (idx === -1) return false;
    this.files.splice(idx, 1);
    return true;
  }
}

/**
 * Auth middleware — attaches req.user if token is valid
 */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth — attaches req.user if token exists but doesn't block
 */
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    } catch (e) {}
  }
  next();
}

// Helper: create JWT from user object
function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username, avatar: user.avatar },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Register auth routes on an Express app
 * @param {import('express').Express} app
 * @param {import('pg').Pool | null} pool
 */
export function registerAuthRoutes(app, pool) {
  // Use shared in-memory fallback if no PostgreSQL
  const memStore = !pool ? getMemoryStore() : null;

  // === Register ===
  app.post('/api/auth/register', async (req, res) => {
    const { email, username, password, avatar } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      if (pool) {
        // PostgreSQL path
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'Email already registered' });
        }
        const result = await pool.query(
          'INSERT INTO users (email, username, password_hash, avatar) VALUES ($1, $2, $3, $4) RETURNING id, email, username, avatar, created_at',
          [email.toLowerCase(), username.trim(), passwordHash, avatar || '🦊']
        );
        const user = result.rows[0];
        res.status(201).json({ user, token: makeToken(user) });
      } else {
        // In-memory path
        if (memStore.findUserByEmail(email.toLowerCase())) {
          return res.status(409).json({ error: 'Email already registered' });
        }
        const user = memStore.createUser({
          email: email.toLowerCase(),
          username: username.trim(),
          password_hash: passwordHash,
          avatar: avatar || '🦊',
        });
        const { password_hash, ...safeUser } = user;
        res.status(201).json({ user: safeUser, token: makeToken(safeUser) });
      }
    } catch (err) {
      console.error('Register error:', err.message);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // === Login ===
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      let user;
      if (pool) {
        const result = await pool.query(
          'SELECT id, email, username, password_hash, avatar, created_at FROM users WHERE email = $1',
          [email.toLowerCase()]
        );
        user = result.rows[0] || null;
      } else {
        user = memStore.findUserByEmail(email.toLowerCase());
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const { password_hash, ...safeUser } = user;
      res.json({ user: safeUser, token: makeToken(safeUser) });
    } catch (err) {
      console.error('Login error:', err.message);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // === Get current user ===
  app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
      let user;
      if (pool) {
        const result = await pool.query(
          'SELECT id, email, username, avatar, created_at FROM users WHERE id = $1',
          [req.user.id]
        );
        user = result.rows[0] || null;
      } else {
        const found = memStore.findUserById(req.user.id);
        if (found) {
          const { password_hash, ...safeUser } = found;
          user = safeUser;
        }
      }
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });
}

/**
 * Register saved files routes
 * @param {import('express').Express} app
 * @param {import('pg').Pool | null} pool
 */
export function registerFileRoutes(app, pool) {
  const memStore = !pool ? getMemoryStore() : null;

  // === Save file ===
  app.post('/api/files', authMiddleware, async (req, res) => {
    const { filename, language, content, roomId } = req.body;
    if (!filename || content === undefined) {
      return res.status(400).json({ error: 'Filename and content are required' });
    }

    try {
      if (pool) {
        const result = await pool.query(
          `INSERT INTO saved_files (user_id, filename, language, content, room_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, filename, language, room_id, created_at, updated_at`,
          [req.user.id, filename.trim(), language || 'javascript', content, roomId || null]
        );
        res.status(201).json(result.rows[0]);
      } else {
        const file = memStore.createFile({
          user_id: req.user.id,
          filename: filename.trim(),
          language: language || 'javascript',
          content,
          room_id: roomId || null,
        });
        const { content: _, user_id: __, ...safeFile } = file;
        res.status(201).json(safeFile);
      }
    } catch (err) {
      console.error('Save file error:', err.message);
      res.status(500).json({ error: 'Failed to save file' });
    }
  });

  // === Update file ===
  app.put('/api/files/:id', authMiddleware, async (req, res) => {
    const { filename, language, content } = req.body;
    try {
      if (pool) {
        const result = await pool.query(
          `UPDATE saved_files SET
            filename = COALESCE($1, filename),
            language = COALESCE($2, language),
            content = COALESCE($3, content),
            updated_at = NOW()
           WHERE id = $4 AND user_id = $5
           RETURNING id, filename, language, room_id, created_at, updated_at`,
          [filename, language, content, req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
        res.json(result.rows[0]);
      } else {
        const updated = memStore.updateFile(req.params.id, req.user.id, { filename, language, content });
        if (!updated) return res.status(404).json({ error: 'File not found' });
        const { content: _, user_id: __, ...safeFile } = updated;
        res.json(safeFile);
      }
    } catch (err) {
      console.error('Update file error:', err.message);
      res.status(500).json({ error: 'Failed to update file' });
    }
  });

  // === List user's files ===
  app.get('/api/files', authMiddleware, async (req, res) => {
    try {
      if (pool) {
        const result = await pool.query(
          `SELECT id, filename, language, room_id, LENGTH(content) as size_bytes, created_at, updated_at
           FROM saved_files WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
          [req.user.id]
        );
        res.json(result.rows);
      } else {
        res.json(memStore.listFiles(req.user.id));
      }
    } catch (err) {
      console.error('List files error:', err.message);
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  // === Get file content ===
  app.get('/api/files/:id', authMiddleware, async (req, res) => {
    try {
      if (pool) {
        const result = await pool.query(
          `SELECT id, filename, language, content, room_id, created_at, updated_at
           FROM saved_files WHERE id = $1 AND user_id = $2`,
          [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
        res.json(result.rows[0]);
      } else {
        const file = memStore.getFile(req.params.id, req.user.id);
        if (!file) return res.status(404).json({ error: 'File not found' });
        res.json(file);
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to get file' });
    }
  });

  // === Delete file ===
  app.delete('/api/files/:id', authMiddleware, async (req, res) => {
    try {
      if (pool) {
        const result = await pool.query(
          'DELETE FROM saved_files WHERE id = $1 AND user_id = $2 RETURNING id',
          [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
        res.json({ deleted: true });
      } else {
        const deleted = memStore.deleteFile(req.params.id, req.user.id);
        if (!deleted) return res.status(404).json({ error: 'File not found' });
        res.json({ deleted: true });
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });
}

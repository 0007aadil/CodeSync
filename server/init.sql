-- Initialize the collaborative editor database

CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL DEFAULT 'Untitled',
    language VARCHAR(50) NOT NULL DEFAULT 'javascript',
    yjs_state BYTEA,
    content TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS op_log (
    id SERIAL PRIMARY KEY,
    document_id VARCHAR(255) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    operation BYTEA NOT NULL,
    client_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_op_log_document ON op_log(document_id);
CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at);

-- === Auth & Cloud Save ===

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar VARCHAR(10) DEFAULT '🦊',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    language VARCHAR(50) NOT NULL DEFAULT 'javascript',
    content TEXT NOT NULL DEFAULT '',
    room_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_files_user ON saved_files(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_files_updated ON saved_files(updated_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

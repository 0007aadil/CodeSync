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

CREATE INDEX idx_op_log_document ON op_log(document_id);
CREATE INDEX idx_documents_updated ON documents(updated_at);

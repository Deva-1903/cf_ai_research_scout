-- cf_ai_research_scout D1 schema
-- Run: wrangler d1 execute cf-ai-research-scout-db --local --file=schema.sql

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,
  title       TEXT    NOT NULL,
  research_question TEXT NOT NULL,
  instructions TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id            TEXT    PRIMARY KEY,
  session_id    TEXT    NOT NULL,
  url           TEXT    NOT NULL,
  title         TEXT,
  status        TEXT    NOT NULL DEFAULT 'queued',
  -- status: queued | processing | indexed | failed
  error_message TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT    PRIMARY KEY,
  source_id   TEXT    NOT NULL,
  session_id  TEXT    NOT NULL,
  text        TEXT    NOT NULL,
  -- embedding stored as JSON float array (e.g. "[0.1, 0.2, ...]")
  embedding   TEXT,
  chunk_order INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT    PRIMARY KEY,
  session_id  TEXT    NOT NULL,
  role        TEXT    NOT NULL, -- user | assistant
  content     TEXT    NOT NULL,
  -- citations: JSON array of { sourceId, url, title, snippet }
  citations   TEXT,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS digests (
  id          TEXT    PRIMARY KEY,
  session_id  TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sources_session ON sources(session_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source   ON chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_session  ON chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_digests_session  ON digests(session_id);

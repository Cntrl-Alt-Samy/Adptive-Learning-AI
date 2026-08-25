-- ============================================================================
-- Syllabus Library — document upload, chunking, and RAG retrieval
-- Migration: 20260825_syllabus_library.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Syllabus document registry (tracks uploaded PDFs and their processing state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS syllabus_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           varchar(255) NOT NULL,
  subject         varchar(128) NOT NULL,
  exam_board      varchar(128) NOT NULL DEFAULT 'DfE',
  stage           varchar(32) NOT NULL DEFAULT 'gcse',
  file_name       varchar(255) NOT NULL,
  file_path       varchar(512) NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  page_count      integer NOT NULL DEFAULT 0,
  chunk_count     integer NOT NULL DEFAULT 0,
  status          varchar(32) NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'processing', 'indexed', 'error')),
  error_message   text,
  source_url      varchar(512),
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS syllabus_documents_tenant_idx ON syllabus_documents(tenant_id);
CREATE INDEX IF NOT EXISTS syllabus_documents_subject_idx ON syllabus_documents(subject);
CREATE INDEX IF NOT EXISTS syllabus_documents_status_idx ON syllabus_documents(status);

-- ---------------------------------------------------------------------------
-- Syllabus text chunks (one row per embedded chunk for audit + re-embed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS syllabus_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES syllabus_documents(id) ON DELETE CASCADE,
  chunk_index     integer NOT NULL,
  section_title   varchar(255),
  text            text NOT NULL,
  token_estimate  integer NOT NULL DEFAULT 0,
  pinecone_id     varchar(255),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT syllabus_chunks_doc_index_uq UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS syllabus_chunks_document_idx ON syllabus_chunks(document_id);

-- ---------------------------------------------------------------------------
-- RLS policies — educators manage their tenant's library
-- ---------------------------------------------------------------------------
ALTER TABLE syllabus_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE syllabus_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_chunks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS syllabus_educator_policy ON syllabus_documents;
CREATE POLICY syllabus_educator_policy ON syllabus_documents
    FOR ALL
    USING (
        -- Self: educators see their own tenant's documents
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        AND NULLIF(current_setting('app.current_user_role', true), '')::uuid IS NOT NULL
        AND current_setting('app.current_user_role', true) IN ('INSTRUCTOR', 'ADMIN')
    );

DROP POLICY IF EXISTS syllabus_chunks_policy ON syllabus_chunks;
CREATE POLICY syllabus_chunks_policy ON syllabus_chunks
    FOR ALL
    USING (
        document_id IN (
            SELECT id FROM syllabus_documents
            WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
    );

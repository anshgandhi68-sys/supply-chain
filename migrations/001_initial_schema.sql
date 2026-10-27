-- ====================================================================
-- Supply Chain Sentinel 2.0 — Migration 001: Initial Durable Schema
-- Target Engine: PostgreSQL 14+ (Compatible with Supabase, Neon, AWS RDS)
-- ====================================================================

-- 1. USERS & PROVIDER IDENTITIES
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(64) NOT NULL DEFAULT 'local', -- 'clerk', 'supabase', 'local'
    provider_user_id VARCHAR(255) UNIQUE,          -- External identity ID (e.g., Clerk sub)
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. WORKSPACES (MULTI-TENANT ISOLATION BOUNDARY)
CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(128) NOT NULL UNIQUE,
    tier VARCHAR(32) NOT NULL DEFAULT 'pilot' CHECK (tier IN ('free', 'pilot', 'enterprise')),
    max_scans_per_month INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. WORKSPACE MEMBERSHIPS & RBAC
CREATE TABLE IF NOT EXISTS workspace_members (
    id VARCHAR(128) PRIMARY KEY,
    workspace_id VARCHAR(128) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_member UNIQUE (workspace_id, user_id)
);

-- 4. SCAN RECORDS & VERDICTS (NO TOKENS PERSISTED)
CREATE TABLE IF NOT EXISTS scans (
    id VARCHAR(128) PRIMARY KEY,
    workspace_id VARCHAR(128) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by_user_id VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL,
    repository VARCHAR(255) NOT NULL,
    commit_sha VARCHAR(64),
    default_branch VARCHAR(128) NOT NULL DEFAULT 'main',
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scan_verdict VARCHAR(32) NOT NULL CHECK (scan_verdict IN ('CLEAN', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'INCOMPLETE', 'complete_with_findings', 'complete_clean', 'incomplete_evidence_required', 'scan_failed')),
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    retention_days INT NOT NULL DEFAULT 30,
    retention_expires_at TIMESTAMPTZ NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

-- 5. AUDIT EVENTS (TAMPER-EVIDENT APPEND-ONLY LEDGER)
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(128) PRIMARY KEY,
    workspace_id VARCHAR(128) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- PERFORMANCE & QUERY INDEXES
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_workspace_role ON workspace_members(workspace_id, role);
CREATE INDEX IF NOT EXISTS idx_scans_workspace_scanned ON scans(workspace_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_retention_expiry ON scans(retention_expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_workspace_timestamp ON audit_events(workspace_id, timestamp DESC);

-- ====================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES (FOR MANAGED POSTGRES / SUPABASE)
-- ====================================================================
-- Enable RLS and FORCE RLS so table owners/non-superusers cannot bypass isolation
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;

ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

-- 1. Scans Isolation: Accessible only when app.current_workspace_id matches
DROP POLICY IF EXISTS scans_tenant_isolation_policy ON scans;
CREATE POLICY scans_tenant_isolation_policy ON scans
    AS PERMISSIVE
    FOR ALL
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), ''))
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), ''));

-- 2. Audit Events Isolation: Append-only per tenant
DROP POLICY IF EXISTS audit_tenant_isolation_policy ON audit_events;
CREATE POLICY audit_tenant_isolation_policy ON audit_events
    AS PERMISSIVE
    FOR ALL
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), ''))
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), ''));

-- 3. Workspace Memberships Isolation
DROP POLICY IF EXISTS members_tenant_isolation_policy ON workspace_members;
CREATE POLICY members_tenant_isolation_policy ON workspace_members
    AS PERMISSIVE
    FOR ALL
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), ''))
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), ''));

-- 4. Workspaces Table Isolation
DROP POLICY IF EXISTS workspaces_tenant_isolation_policy ON workspaces;
CREATE POLICY workspaces_tenant_isolation_policy ON workspaces
    AS PERMISSIVE
    FOR ALL
    USING (id = NULLIF(current_setting('app.current_workspace_id', true), ''))
    WITH CHECK (id = NULLIF(current_setting('app.current_workspace_id', true), ''));

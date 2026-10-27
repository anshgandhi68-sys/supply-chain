-- ====================================================================
-- Supply Chain Sentinel 2.0 — Rollback Migration: 001_initial_schema_down
-- Reverts all tables, indexes, and constraints created in 001_initial_schema.sql
-- ====================================================================

DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS scans CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;

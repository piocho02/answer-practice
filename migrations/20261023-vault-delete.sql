-- Run once in the Supabase SQL editor as the database administrator.
-- Grants permissions only; no answers or folders are deleted by this migration.
GRANT DELETE ON answer_vault.documents, answer_vault.folders TO answer_vault_app;

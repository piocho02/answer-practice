-- Admin-only. Set the role's password separately; never commit that password.
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='answer_vault_app') THEN CREATE ROLE answer_vault_app LOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA answer_vault TO answer_vault_app;
GRANT SELECT ON answer_vault.settings TO answer_vault_app;
GRANT SELECT,INSERT,DELETE ON answer_vault.folders TO answer_vault_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON answer_vault.documents TO answer_vault_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON answer_vault.sessions,answer_vault.limits,answer_vault.receipts TO answer_vault_app;
-- Do not add answer_vault to Supabase Data API exposed schemas.

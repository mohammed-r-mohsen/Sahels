CREATE OR REPLACE FUNCTION app_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY refresh_tokens_tenant ON refresh_tokens
  USING (app_is_super() OR user_id = app_user_id())
  WITH CHECK (app_is_super() OR user_id = app_user_id());

DROP POLICY users_tenant ON users;
CREATE POLICY users_tenant ON users
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

ALTER ROLE sahel_app NOLOGIN PASSWORD NULL;
GRANT sahel_app TO CURRENT_USER;
CREATE UNIQUE INDEX users_email_case_insensitive_uidx ON users (lower(email));

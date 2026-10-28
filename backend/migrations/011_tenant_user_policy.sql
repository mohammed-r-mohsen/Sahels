DROP POLICY IF EXISTS users_tenant ON users;

CREATE POLICY users_tenant ON users
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());
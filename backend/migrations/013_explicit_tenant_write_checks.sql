DROP POLICY IF EXISTS clinics_tenant ON clinics;
CREATE POLICY clinics_tenant ON clinics
  USING (app_is_super() OR id = app_clinic_id())
  WITH CHECK (app_is_super() OR id = app_clinic_id());

DROP POLICY IF EXISTS doctors_tenant ON doctors;
CREATE POLICY doctors_tenant ON doctors
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS schedules_tenant ON doctor_schedules;
CREATE POLICY schedules_tenant ON doctor_schedules
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS patients_tenant ON patients;
CREATE POLICY patients_tenant ON patients
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS consents_tenant ON consents;
CREATE POLICY consents_tenant ON consents
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS appointments_tenant ON appointments;
CREATE POLICY appointments_tenant ON appointments
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS waiting_tenant ON waiting_list;
CREATE POLICY waiting_tenant ON waiting_list
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS tokens_tenant ON clinic_tokens;
CREATE POLICY tokens_tenant ON clinic_tokens
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS messages_tenant ON message_logs;
CREATE POLICY messages_tenant ON message_logs
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS payments_tenant ON payments;
CREATE POLICY payments_tenant ON payments
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

DROP POLICY IF EXISTS audit_tenant ON audit_logs;
CREATE POLICY audit_tenant ON audit_logs
  USING (app_is_super() OR clinic_id = app_clinic_id() OR clinic_id IS NULL)
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());
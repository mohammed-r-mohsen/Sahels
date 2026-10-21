ALTER TABLE doctors
  ADD COLUMN capacity_per_slot INT NOT NULL DEFAULT 1
    CHECK (capacity_per_slot BETWEEN 1 AND 100);

ALTER TABLE appointments
  DROP CONSTRAINT appointments_no_overlap;

CREATE INDEX idx_appointments_doctor_range
  ON appointments USING gist (doctor_id, tstzrange(starts_at, ends_at, '[)'))
  WHERE status IN ('pending', 'confirmed', 'waiting');

CREATE TABLE staff_shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (end_time > start_time)
);

CREATE INDEX idx_staff_shifts_user ON staff_shifts(clinic_id, user_id, weekday);
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts FORCE ROW LEVEL SECURITY;

CREATE POLICY staff_shifts_tenant ON staff_shifts
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON staff_shifts TO sahel_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sahel_app;

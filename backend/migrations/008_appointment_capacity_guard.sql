CREATE OR REPLACE FUNCTION enforce_appointment_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  doctor_capacity INT;
  overlapping_count BIGINT;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed', 'waiting') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM patients
    WHERE id = NEW.patient_id AND clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'Appointment patient is not in the same clinic'
      USING ERRCODE = '23503';
  END IF;

  SELECT capacity_per_slot
    INTO doctor_capacity
    FROM doctors
   WHERE id = NEW.doctor_id
     AND clinic_id = NEW.clinic_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment doctor is not in the same clinic'
      USING ERRCODE = '23503';
  END IF;

  SELECT COUNT(*)
    INTO overlapping_count
    FROM appointments
   WHERE clinic_id = NEW.clinic_id
     AND doctor_id = NEW.doctor_id
     AND id <> NEW.id
     AND status IN ('pending', 'confirmed', 'waiting')
     AND tstzrange(starts_at, ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)');

  IF overlapping_count >= doctor_capacity THEN
    RAISE EXCEPTION 'Appointment capacity exceeded for this doctor and time'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_capacity_guard
BEFORE INSERT OR UPDATE OF clinic_id, doctor_id, starts_at, ends_at, status
ON appointments
FOR EACH ROW
EXECUTE FUNCTION enforce_appointment_capacity();
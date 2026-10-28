#!/usr/bin/env bash
set -Eeuo pipefail

docker compose exec -T postgres psql -U sahels -d sahels -v ON_ERROR_STOP=1 <<'SQL'
\set ON_ERROR_STOP on
SELECT gen_random_uuid() AS clinic_a \gset
SELECT gen_random_uuid() AS clinic_b \gset
SELECT gen_random_uuid() AS doctor_a \gset
SELECT gen_random_uuid() AS doctor_b \gset
SELECT gen_random_uuid() AS patient_a \gset
SELECT gen_random_uuid() AS patient_b \gset
SELECT gen_random_uuid() AS appointment_a \gset
SELECT gen_random_uuid() AS appointment_b \gset

BEGIN;
SET LOCAL app.is_super = 'true';

DO $$
DECLARE
  unprotected_tables TEXT[];
BEGIN
  SELECT array_agg(DISTINCT table_name ORDER BY table_name)
    INTO unprotected_tables
    FROM information_schema.columns columns
    JOIN pg_namespace namespaces ON namespaces.nspname = columns.table_schema
    JOIN pg_class relations
      ON relations.relnamespace = namespaces.oid
     AND relations.relname = columns.table_name
   WHERE columns.table_schema = 'public'
     AND columns.column_name = 'clinic_id'
     AND relations.relkind = 'r'
     AND (NOT relations.relrowsecurity OR NOT relations.relforcerowsecurity);

  IF unprotected_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant tables missing forced RLS: %', unprotected_tables;
  END IF;
END $$;

INSERT INTO clinics (id, name, slug) VALUES
  (:'clinic_a', 'Security Test A', 'security-test-a-' || left(:'clinic_a', 8)),
  (:'clinic_b', 'Security Test B', 'security-test-b-' || left(:'clinic_b', 8));

INSERT INTO doctors (id, clinic_id, full_name, capacity_per_slot) VALUES
  (:'doctor_a', :'clinic_a', 'Security Doctor A', 1),
  (:'doctor_b', :'clinic_b', 'Security Doctor B', 2);

INSERT INTO patients (id, clinic_id, phone) VALUES
  (:'patient_a', :'clinic_a', 'security-a-' || left(:'patient_a', 8)),
  (:'patient_b', :'clinic_b', 'security-b-' || left(:'patient_b', 8));

INSERT INTO appointments (id, clinic_id, doctor_id, patient_id, starts_at, ends_at, status, source) VALUES
  (:'appointment_a', :'clinic_a', :'doctor_a', :'patient_a', date_trunc('minute', NOW()) + INTERVAL '1 day', date_trunc('minute', NOW()) + INTERVAL '1 day 30 minutes', 'confirmed', 'admin'),
  (:'appointment_b', :'clinic_b', :'doctor_b', :'patient_b', date_trunc('minute', NOW()) + INTERVAL '1 day', date_trunc('minute', NOW()) + INTERVAL '1 day 30 minutes', 'confirmed', 'admin');

SELECT set_config('security_test.appointment_a', :'appointment_a', true);
SELECT set_config('security_test.clinic_b', :'clinic_b', true);

DO $$
DECLARE
  blocked BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at, status, source)
    SELECT clinic_id, doctor_id, patient_id,
           date_trunc('minute', NOW()) + INTERVAL '1 day',
           date_trunc('minute', NOW()) + INTERVAL '1 day 30 minutes',
           'confirmed', 'admin'
      FROM appointments WHERE id = current_setting('security_test.appointment_a')::uuid;
  EXCEPTION WHEN SQLSTATE '23P01' THEN
    blocked := TRUE;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Double booking was accepted for capacity 1';
  END IF;
END $$;

SET LOCAL app.is_super = 'false';
SELECT set_config('app.clinic_id', '', true);
SET LOCAL ROLE sahel_app;

DO $$
DECLARE
  blocked BOOLEAN := FALSE;
BEGIN
  IF (SELECT COUNT(*) FROM appointments) <> 0
     OR (SELECT COUNT(*) FROM doctors) <> 0
     OR (SELECT COUNT(*) FROM patients) <> 0 THEN
    RAISE EXCEPTION 'Restricted role can see tenant data without a clinic context';
  END IF;
END $$;

SELECT set_config('app.clinic_id', :'clinic_a', true);

DO $$
DECLARE
  blocked BOOLEAN := FALSE;
BEGIN
  IF (SELECT COUNT(*) FROM appointments) <> 1 THEN
    RAISE EXCEPTION 'Tenant A can see another tenant appointment';
  END IF;
  IF (SELECT COUNT(*) FROM doctors) <> 1 OR (SELECT COUNT(*) FROM patients) <> 1 THEN
    RAISE EXCEPTION 'Tenant A can see another tenant doctor or patient';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'Tenant A can read platform super-admin identities';
  END IF;

  BEGIN
    INSERT INTO patients (clinic_id, phone)
    VALUES (current_setting('security_test.clinic_b')::uuid, 'cross-tenant-write-attempt');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := TRUE;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Tenant A can write a patient into tenant B';
  END IF;
END $$;

ROLLBACK;
\echo 'Security checks passed: RLS isolation and appointment capacity guard.'
SQL
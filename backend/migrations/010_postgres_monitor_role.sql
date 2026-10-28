DO $$ BEGIN
  CREATE ROLE sahel_monitor NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT pg_monitor TO sahel_monitor;
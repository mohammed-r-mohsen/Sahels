UPDATE patients
SET risk_score = CASE
  WHEN no_show_count + visit_count >= 2
    THEN no_show_count::numeric / (no_show_count + visit_count)
  ELSE NULL
END;
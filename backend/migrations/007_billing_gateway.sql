UPDATE plans
SET price_sar = CASE id
  WHEN 'starter' THEN 299
  WHEN 'growth' THEN 469
  WHEN 'scale' THEN 659
  ELSE price_sar
END
WHERE id IN ('starter', 'growth', 'scale');

CREATE UNIQUE INDEX idx_payments_provider_id
  ON payments(provider, provider_id)
  WHERE provider_id IS NOT NULL;
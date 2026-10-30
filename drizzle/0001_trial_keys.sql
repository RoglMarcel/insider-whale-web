ALTER TABLE access_keys ADD COLUMN trial_days INTEGER CHECK (trial_days IS NULL OR trial_days = 3);

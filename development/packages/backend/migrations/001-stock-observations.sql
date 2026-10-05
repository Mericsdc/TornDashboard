BEGIN;
CREATE TABLE IF NOT EXISTS stock_observations (
  id BIGSERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  country TEXT NOT NULL,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  observed_at BIGINT NOT NULL CHECK (observed_at >= 0),
  source TEXT NOT NULL CHECK (source IN ('mock','manual','provider')),
  UNIQUE (item_id, country, observed_at, source)
);
CREATE INDEX IF NOT EXISTS stock_observations_lookup ON stock_observations (item_id,country,observed_at DESC);
COMMIT;

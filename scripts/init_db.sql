-- init_db.sql — Database initialisation and seed data
--
-- PostgreSQL runs every .sql file in /docker-entrypoint-initdb.d/ exactly once,
-- the first time the database volume is created. After that it is never run again
-- unless you wipe the volume with: docker compose down -v
--
-- To reset the database and re-seed: docker compose down -v && docker compose up --build

-- ── Create tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_candles (
    id        SERIAL PRIMARY KEY,
    symbol    VARCHAR(20)     NOT NULL,
    timestamp TIMESTAMPTZ     NOT NULL,
    open      NUMERIC(18, 2)  NOT NULL,
    high      NUMERIC(18, 2)  NOT NULL,
    low       NUMERIC(18, 2)  NOT NULL,
    close     NUMERIC(18, 2)  NOT NULL,
    volume    NUMERIC(24, 8)  NOT NULL
);

CREATE TABLE IF NOT EXISTS liquidations (
    id        SERIAL PRIMARY KEY,
    symbol    VARCHAR(20)     NOT NULL,
    timestamp TIMESTAMPTZ     NOT NULL,
    side      VARCHAR(4)      NOT NULL,  -- 'buy' or 'sell'
    price     NUMERIC(18, 2)  NOT NULL,
    quantity  NUMERIC(18, 8)  NOT NULL,
    exchange  VARCHAR(50)     NOT NULL
);

CREATE TABLE IF NOT EXISTS orderbook_snapshots (
    id        SERIAL PRIMARY KEY,
    symbol    VARCHAR(20)  NOT NULL,
    timestamp TIMESTAMPTZ  NOT NULL,
    bids      JSONB        NOT NULL,  -- [[price, qty], ...]
    asks      JSONB        NOT NULL   -- [[price, qty], ...]
);

-- ── Seed data — BTC/USDT static mock data ─────────────────────────────────────
-- Timestamps are relative to NOW() so the data always looks recent when the
-- container first starts. Prices are plausible BTC levels for reference only.

INSERT INTO price_candles (symbol, timestamp, open, high, low, close, volume) VALUES
  ('BTCUSDT', NOW() - INTERVAL '10 minutes', 82950.00, 83120.00, 82890.00, 83050.00, 14.23150000),
  ('BTCUSDT', NOW() - INTERVAL '9 minutes',  83050.00, 83200.00, 82980.00, 83150.00, 11.87340000),
  ('BTCUSDT', NOW() - INTERVAL '8 minutes',  83150.00, 83350.00, 83100.00, 83280.00,  9.54210000),
  ('BTCUSDT', NOW() - INTERVAL '7 minutes',  83280.00, 83420.00, 83200.00, 83380.00, 13.10980000),
  ('BTCUSDT', NOW() - INTERVAL '6 minutes',  83380.00, 83500.00, 83310.00, 83460.00, 10.67890000),
  ('BTCUSDT', NOW() - INTERVAL '5 minutes',  83460.00, 83600.00, 83390.00, 83520.00,  8.92340000),
  ('BTCUSDT', NOW() - INTERVAL '4 minutes',  83520.00, 83680.00, 83450.00, 83610.00, 12.44560000),
  ('BTCUSDT', NOW() - INTERVAL '3 minutes',  83610.00, 83750.00, 83560.00, 83700.00, 15.33210000),
  ('BTCUSDT', NOW() - INTERVAL '2 minutes',  83700.00, 83820.00, 83640.00, 83780.00,  7.88900000),
  ('BTCUSDT', NOW() - INTERVAL '1 minute',   83780.00, 83900.00, 83720.00, 83850.00, 18.56780000);

INSERT INTO liquidations (symbol, timestamp, side, price, quantity, exchange) VALUES
  ('BTCUSDT', NOW() - INTERVAL '9 minutes',  'sell', 82900.00, 0.45000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '8 minutes',  'buy',  83250.00, 1.20000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '7 minutes',  'sell', 83100.00, 0.33000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '7 minutes',  'sell', 83080.00, 0.78000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '6 minutes',  'buy',  83400.00, 2.10000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '5 minutes',  'sell', 83350.00, 0.60000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '4 minutes',  'buy',  83550.00, 0.95000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '3 minutes',  'buy',  83650.00, 1.55000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '2 minutes',  'sell', 83720.00, 0.42000000, 'binance'),
  ('BTCUSDT', NOW() - INTERVAL '1 minute',   'buy',  83800.00, 3.00000000, 'binance');

INSERT INTO orderbook_snapshots (symbol, timestamp, bids, asks) VALUES (
  'BTCUSDT',
  NOW(),
  '[[83849.00,1.2340],[83848.00,0.8800],[83847.00,2.1500],[83846.00,0.6700],[83845.00,1.9900],[83844.00,3.4500],[83843.00,0.5600],[83842.00,1.1200],[83841.00,2.7800],[83840.00,0.9900]]',
  '[[83850.00,0.9900],[83851.00,1.4400],[83852.00,0.7700],[83853.00,2.3300],[83854.00,1.0800],[83855.00,3.1200],[83856.00,0.6600],[83857.00,1.8800],[83858.00,0.4400],[83859.00,2.5500]]'
);

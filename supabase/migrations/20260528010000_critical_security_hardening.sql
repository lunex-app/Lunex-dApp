-- Critical production hardening for public-facing tables and SDK API keys.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- API keys are stored as SHA-256 hashes. Existing plaintext keys are backfilled
-- into hashes, then removed from the table.
ALTER TABLE public.dex_api_keys
  ADD COLUMN IF NOT EXISTS key_hash text,
  ADD COLUMN IF NOT EXISTS key_prefix text,
  ADD COLUMN IF NOT EXISTS key_last4 text;

UPDATE public.dex_api_keys
SET
  key_hash = COALESCE(key_hash, encode(digest(key_value, 'sha256'), 'hex')),
  key_prefix = COALESCE(key_prefix, left(key_value, 8)),
  key_last4 = COALESCE(key_last4, right(key_value, 4))
WHERE key_value IS NOT NULL;

ALTER TABLE public.dex_api_keys
  ALTER COLUMN key_value DROP NOT NULL;

UPDATE public.dex_api_keys
SET key_value = NULL
WHERE key_value IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dex_api_keys_key_hash_idx
  ON public.dex_api_keys (key_hash)
  WHERE key_hash IS NOT NULL;

-- Lock down wallet transaction history. The frontend now stores personal history
-- locally; server-side analytics should come from verified on-chain ingestion.
DROP POLICY IF EXISTS "Anyone can read transactions by wallet" ON public.transactions;
DROP POLICY IF EXISTS "Anyone can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can read transactions" ON public.transactions;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Protocol volume must not be client-submitted. Service-role jobs may bypass RLS
-- for verified event ingestion; authenticated admins can inspect rows.
CREATE TABLE IF NOT EXISTS public.protocol_volume (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash text NOT NULL UNIQUE,
  event_type text NOT NULL,
  amount_usd numeric NOT NULL DEFAULT 0,
  contract text NOT NULL,
  block_number bigint NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.protocol_volume ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read protocol volume" ON public.protocol_volume;
DROP POLICY IF EXISTS "Anyone can insert protocol volume" ON public.protocol_volume;
DROP POLICY IF EXISTS "Admins can read protocol volume" ON public.protocol_volume;

CREATE POLICY "Admins can read protocol volume"
ON public.protocol_volume
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Maintenance settings are public-readable, admin-writable.
ALTER TABLE public.protocol_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public full access to protocol settings" ON public.protocol_settings;
DROP POLICY IF EXISTS "Allow public read-only access to settings" ON public.protocol_settings;
DROP POLICY IF EXISTS "Allow authenticated admin full access" ON public.protocol_settings;
DROP POLICY IF EXISTS "Public can read protocol settings" ON public.protocol_settings;
DROP POLICY IF EXISTS "Admins can manage protocol settings" ON public.protocol_settings;

CREATE POLICY "Public can read protocol settings"
ON public.protocol_settings
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins can manage protocol settings"
ON public.protocol_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Leaderboard cache is public-readable, not public-writable.
ALTER TABLE public.leaderboard_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read leaderboard" ON public.leaderboard_cache;
DROP POLICY IF EXISTS "Allow users to upsert their own data" ON public.leaderboard_cache;
DROP POLICY IF EXISTS "Public can read leaderboard" ON public.leaderboard_cache;
DROP POLICY IF EXISTS "Admins can manage leaderboard" ON public.leaderboard_cache;

CREATE POLICY "Public can read leaderboard"
ON public.leaderboard_cache
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins can manage leaderboard"
ON public.leaderboard_cache
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

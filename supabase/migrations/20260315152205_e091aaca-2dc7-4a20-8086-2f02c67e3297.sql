
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  type TEXT NOT NULL,
  section TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'confirmed'
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read transactions by wallet"
  ON public.transactions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_transactions_wallet ON public.transactions (wallet_address);
CREATE INDEX idx_transactions_section ON public.transactions (wallet_address, section);

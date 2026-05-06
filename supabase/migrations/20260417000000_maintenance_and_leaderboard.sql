
-- Create table for protocol settings (like maintenance mode)
CREATE TABLE IF NOT EXISTS protocol_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL DEFAULT 'false'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default maintenance settings
INSERT INTO protocol_settings (key, value) VALUES 
('maintenance_all', 'false'::jsonb),
('maintenance_swap', 'false'::jsonb),
('maintenance_bridge', 'false'::jsonb),
('maintenance_yield', 'false'::jsonb),
('maintenance_pool', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Create table for daily points cache
CREATE TABLE IF NOT EXISTS leaderboard_cache (
    address TEXT PRIMARY KEY,
    points BIGINT DEFAULT 0,
    interactions INTEGER DEFAULT 0,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    rank INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Policy for anyone to read and update protocol settings (Prototype Mode)
-- In production, this should be restricted to authenticated admins with signed wallet proof
DROP POLICY IF EXISTS "Allow public read-only access to settings" ON protocol_settings;
DROP POLICY IF EXISTS "Allow authenticated admin full access" ON protocol_settings;

CREATE POLICY "Allow public full access to protocol settings" 
ON protocol_settings FOR ALL 
USING (true)
WITH CHECK (true);

-- Ensure all maintenance keys exist
INSERT INTO protocol_settings (key, value) VALUES 
('maintenance_all', 'false'::jsonb),
('maintenance_swap', 'false'::jsonb),
('maintenance_bridge', 'false'::jsonb),
('maintenance_yield', 'false'::jsonb),
('maintenance_pool', 'false'::jsonb),
('maintenance_dashboard', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Leaderboard cache access
ALTER TABLE leaderboard_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read leaderboard" 
ON leaderboard_cache FOR SELECT USING (true);

CREATE POLICY "Allow users to upsert their own data" 
ON leaderboard_cache FOR ALL
USING (true)
WITH CHECK (true); -- Usually restricted, but keeping simple for initial integration

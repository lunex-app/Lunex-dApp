
-- Fix policy: allow users to read their own roles
CREATE POLICY "Users can read own roles" ON public.user_roles 
FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Restrict public inserts to API usage (now requires a valid session or should be done via Edge Function)
-- For now, let's at least require authentication to prevent totally public spamming
DROP POLICY "Anyone can insert api usage" ON public.dex_api_usage;
CREATE POLICY "Authenticated users can insert api usage" ON public.dex_api_usage FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Add a check for 'admin' or 'developer' role for inserting (more secure)
-- But for now, requiring auth is a good first step.

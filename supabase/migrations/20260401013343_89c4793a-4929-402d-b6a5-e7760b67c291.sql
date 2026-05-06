
-- Add allowed_services column to dex_api_keys to restrict which endpoints a key can use
ALTER TABLE public.dex_api_keys ADD COLUMN allowed_services text[] NOT NULL DEFAULT '{}';

-- Create API key request table for developers to request keys
CREATE TABLE public.dex_api_key_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL DEFAULT 'Unnamed Key',
  requested_services text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dex_api_key_requests ENABLE ROW LEVEL SECURITY;

-- Developers can see their own requests
CREATE POLICY "Users can read own requests" ON public.dex_api_key_requests
  FOR SELECT TO authenticated USING (requested_by = auth.uid());

-- Developers can create requests
CREATE POLICY "Authenticated users can create requests" ON public.dex_api_key_requests
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());

-- Admins can read all requests
CREATE POLICY "Admins can read all requests" ON public.dex_api_key_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update requests (approve/deny)
CREATE POLICY "Admins can update requests" ON public.dex_api_key_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete requests
CREATE POLICY "Admins can delete requests" ON public.dex_api_key_requests
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

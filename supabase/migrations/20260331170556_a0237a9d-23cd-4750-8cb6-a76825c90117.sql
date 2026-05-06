
-- Add 'developer' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';

-- Allow developers to read their own API keys (keys they created)
CREATE POLICY "Developers can read own keys"
ON public.dex_api_keys
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Allow developers to read usage for their own keys
CREATE POLICY "Developers can read own usage"
ON public.dex_api_usage
FOR SELECT
TO authenticated
USING (
  api_key_id IN (
    SELECT id FROM public.dex_api_keys WHERE created_by = auth.uid()
  )
);

-- Allow admins to read all profiles (for user management)
CREATE POLICY "Admins can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert user roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete roles
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow users to read their own roles
CREATE POLICY "Users can read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

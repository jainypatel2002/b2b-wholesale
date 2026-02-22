-- ============================================================
-- Migration: Fix Email Notifications (multi-distributor safe)
-- 1. Add notification_email to profiles
-- 2. Fix email_events RLS (service_role bypass)
-- 3. Fix notifications RLS (service_role insert)
-- ============================================================

-- 1. Add notification_email column to profiles
-- Distributors can set a custom email for order notifications.
-- NULL = use their login email (profiles.email).
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_email text;

-- 2. Ensure service_role can INSERT into email_events
-- (RLS is enabled but no policies exist — may block inserts depending on config)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_events' AND policyname = 'service_role_all_email_events'
  ) THEN
    CREATE POLICY "service_role_all_email_events"
    ON public.email_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- 3. Ensure service_role can INSERT into notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'service_role_all_notifications'
  ) THEN
    CREATE POLICY "service_role_all_notifications"
    ON public.notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

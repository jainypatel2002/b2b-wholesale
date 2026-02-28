-- Migration: Add theme_preference to profiles

-- Add theme_preference column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='profiles' AND column_name='theme_preference') THEN
        ALTER TABLE public.profiles 
        ADD COLUMN theme_preference text null
        CHECK (theme_preference IN ('light', 'dark', 'system'));
    END IF;
END $$;

-- RLS Policy: Allow users to update their own profile's theme_preference
-- (Assuming an update policy doesn't fully exist or we want to ensure they can update this specific field)
-- Actually, the user already updates their profile in onboarding. Let's make sure they can update it.
-- We will create a policy for UPDATE if it doesn't exist or is too restrictive, but typically profiles has a self-update policy.
-- To be safe, let's create a specific policy for updating theme_preference that is idempotent.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile'
    ) THEN
        CREATE POLICY "Users can update their own profile"
        ON public.profiles
        FOR UPDATE
        USING (auth.uid() = id);
    END IF;
END $$;

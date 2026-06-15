CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access for now" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.app_settings (key, value) VALUES ('ai_model', 'google/gemini-2.5-flash') ON CONFLICT DO NOTHING;
-- Register Marketing as a distinct AgencyOS specialist.
-- Safe to apply more than once; preserves existing agent records.
INSERT INTO public.agency_agents
  (agent_key, display_name, role, description, status, capabilities, requires_approval_for)
VALUES
  (
    'marketing',
    'Marketing Specialist',
    'Content & Campaign Strategy',
    'Plans evidence-led content calendars, campaign messaging and channel execution from verified client business facts.',
    'planned',
    '["content_strategy","social_media_planning","campaign_copy","brand_messaging"]'::jsonb,
    '["publishing","paid_campaigns","external_messaging"]'::jsonb
  )
ON CONFLICT (agent_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    requires_approval_for = EXCLUDED.requires_approval_for,
    updated_at = NOW();

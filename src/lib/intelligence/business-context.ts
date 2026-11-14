

/**
 * Load the one owner-maintained business profile shared by every agent.
 * Only fields explicitly confirmed by the owner are exposed as verified facts.
 * Unconfirmed values remain visible as unverified inputs, never as facts.
 */
export async function loadAgencyBusinessContext(db: any) {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return { profileStatus: 'unavailable', profileVersion: null, verifiedFacts: {}, unverifiedInputs: {} };
  }

  const rows = await db`
    SELECT profile, verified_fields, version, updated_at
    FROM public.agency_business_profile
    WHERE owner_email = ${ownerEmail}
    LIMIT 1
  `;
  const row = rows[0] as {
    profile?: Record<string, unknown>;
    verified_fields?: string[];
    version?: number;
    updated_at?: string;
  } | undefined;
  if (!row) {
    return { profileStatus: 'not_configured', profileVersion: null, verifiedFacts: {}, unverifiedInputs: {} };
  }

  const profile = row.profile && typeof row.profile === 'object' ? row.profile : {};
  const verified = new Set(Array.isArray(row.verified_fields) ? row.verified_fields : []);
  const verifiedFacts: Record<string, unknown> = {};
  const unverifiedInputs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile)) {
    if (value === null || value === undefined || value === '') continue;
    if (verified.has(key)) verifiedFacts[key] = value;
    else unverifiedInputs[key] = value;
  }
  return {
    profileStatus: Object.keys(verifiedFacts).length ? 'partially_or_fully_verified' : 'not_verified',
    profileVersion: Number(row.version ?? 1),
    profileUpdatedAt: row.updated_at ?? null,
    verifiedFacts,
    unverifiedInputs,
  };
}

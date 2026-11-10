import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { scoreProspectOpportunity } from '@/lib/intelligence/prospect-opportunity-score.mjs';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

async function owner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const p = address.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      p[0] >= 224;
  }
  if (version === 6) {
    const a = address.toLowerCase();
    return a === '::1' || a === '::' || a.startsWith('fc') ||
      a.startsWith('fd') || a.startsWith('fe80:') || a.startsWith('::ffff:');
  }
  return true;
}

async function validatePublicUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['80', '443', ''].includes(url.port) ||
      url.username || url.password) {
    throw new Error('Only public HTTP/HTTPS websites on standard ports can be audited.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private or local network addresses cannot be audited.');
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Private IP addresses cannot be audited.');
  } else {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some(r => isPrivateAddress(r.address))) {
      throw new Error('The website does not resolve exclusively to public IP addresses.');
    }
  }
  url.hash = '';
  return url;
}

async function fetchPublicPage(start: string) {
  let current = start;
  for (let hop = 0; hop < 4; hop++) {
    const url = await validatePublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'AgencyOS-SiteAudit/1.0 (+public-page technical audit)', accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
      });
    } finally {
      clearTimeout(timer);
    }
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Website returned an invalid redirect.');
      current = new URL(location, url).toString();
      continue;
    }
    const type = response.headers.get('content-type') || '';
    if (!type.toLowerCase().includes('text/html') && !type.toLowerCase().includes('application/xhtml+xml')) {
      throw new Error('The website did not return an HTML page that can be audited.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The website returned an empty response.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (size < 1024 * 1024) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = value.slice(0, 1024 * 1024 - size);
        chunks.push(part);
        size += part.length;
        if (size >= 1024 * 1024) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return { url: url.toString(), status: response.status, html, contentType: type };
  }
  throw new Error('The website redirected too many times.');
}

function clean(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
}
function firstMatch(html: string, pattern: RegExp) {
  return clean(html.match(pattern)?.[1] || '');
}


export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await owner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const db = neon(process.env.DATABASE_URL!);
    const rows = await db`
      SELECT id, website_url, overall_score, findings, recommendations, provider, verified_at
      FROM public.seo_audits
      WHERE prospect_id = ${id}
      ORDER BY verified_at DESC NULLS LAST, created_at DESC
      LIMIT 10
    `;
    return NextResponse.json({ audits: rows });
  } catch {
    return NextResponse.json({ error: 'Could not load audit history.' }, { status: 500 });
  }
}

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await owner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const { id } = await context.params;
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`SELECT id,business_name,website_url FROM public.prospects WHERE id=${id} LIMIT 1`;
    const prospect = rows[0];
    if (!prospect) return NextResponse.json({ error: 'Prospect not found.' }, { status: 404 });
    if (!prospect.website_url) return NextResponse.json({ error: 'Add a website URL to this prospect before running an audit.' }, { status: 400 });

    let target = String(prospect.website_url).trim();
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
    const started = Date.now();
    const page = await fetchPublicPage(target);
    const html = page.html;
    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
      firstMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => clean(m[1])).filter(Boolean);
    const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const canonical = /<link[^>]+rel=["']canonical["']/i.test(html);
    const robots = firstMatch(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
    const lang = firstMatch(html, /<html[^>]+lang=["']([^"']+)["']/i);
    const images = [...html.matchAll(/<img\b([^>]*)>/gi)].map(m => m[1]);
    const missingAlt = images.filter(x => !/\balt\s*=\s*["'][^"']*["']/i.test(x)).length;
    const links = [...html.matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi)].map(m => m[1]);
    const internalLinks = links.filter(h => h.startsWith('/') || h.startsWith(page.url) || h.startsWith('#')).length;
    const https = new URL(page.url).protocol === 'https:';
    const findings = [
      { key: 'http_status', label: 'HTTP response', value: page.status, severity: page.status >= 200 && page.status < 400 ? 'pass' : 'high', detail: 'Status returned by the public page request.' },
      { key: 'title', label: 'Page title', value: title || null, severity: title ? (title.length >= 30 && title.length <= 60 ? 'pass' : 'medium') : 'high', detail: title ? `Title length: ${title.length} characters.` : 'No HTML title element was found.' },
      { key: 'meta_description', label: 'Meta description', value: description || null, severity: description ? (description.length >= 70 && description.length <= 160 ? 'pass' : 'medium') : 'medium', detail: description ? `Description length: ${description.length} characters.` : 'No meta description was found.' },
      { key: 'h1', label: 'Main heading', value: h1s, severity: h1s.length === 1 ? 'pass' : 'medium', detail: h1s.length === 0 ? 'No H1 heading found.' : h1s.length > 1 ? `Found ${h1s.length} H1 headings; review heading hierarchy.` : 'One H1 heading found.' },
      { key: 'viewport', label: 'Mobile viewport', value: viewport, severity: viewport ? 'pass' : 'high', detail: viewport ? 'Viewport meta tag is present.' : 'Viewport meta tag is missing.' },
      { key: 'canonical', label: 'Canonical URL', value: canonical, severity: canonical ? 'pass' : 'low', detail: canonical ? 'Canonical link tag is present.' : 'No canonical link tag was found.' },
      { key: 'https', label: 'HTTPS', value: https, severity: https ? 'pass' : 'high', detail: https ? 'Page was served over HTTPS.' : 'Page was served over HTTP.' },
      { key: 'image_alt', label: 'Image alternative text', value: { images: images.length, missing_alt: missingAlt }, severity: missingAlt === 0 ? 'pass' : 'medium', detail: `${missingAlt} of ${images.length} images have no explicit alt attribute.` },
      { key: 'language', label: 'Document language', value: lang || null, severity: lang ? 'pass' : 'low', detail: lang ? `HTML language: ${lang}.` : 'No language attribute was found on the HTML element.' },
      { key: 'robots', label: 'Robots directive', value: robots || 'not specified', severity: /noindex/i.test(robots) ? 'high' : 'pass', detail: /noindex/i.test(robots) ? 'The page declares noindex.' : 'No noindex directive was detected in the robots meta tag.' },
    ];
    const weights: Record<string, number> = { high: 18, medium: 8, low: 3 };
    const deductions = findings.reduce((sum, f) => sum + (f.severity === 'pass' ? 0 : (weights[f.severity] || 0)), 0);
    const score = Math.max(0, 100 - deductions);
    const recommendations = findings.filter(f => f.severity !== 'pass').map(f => ({
      priority: f.severity, finding: f.label, recommendation: ({
        title: 'Write a unique, descriptive page title around the primary service and location.',
        meta_description: 'Add a concise page-specific meta description that explains the service and gives users a reason to click.',
        h1: 'Use one clear H1 that describes the page topic and primary service.',
        viewport: 'Add a responsive viewport meta tag so mobile browsers render the page at device width.',
        canonical: 'Add a canonical URL where duplicate or alternate page URLs may exist.',
        https: 'Configure HTTPS and redirect HTTP traffic to the secure version.',
        image_alt: 'Add meaningful alt text to informative images; use empty alt text for decorative images.',
        language: 'Set the correct lang attribute on the HTML element.',
        robots: 'Review the noindex directive and remove it if this page should appear in search results.',
        http_status: 'Investigate the HTTP response and ensure the intended page returns successfully.',
      } as Record<string,string>)[f.key] || 'Review this item and confirm whether it affects this page.' ,
    }));
    const elapsed = Date.now() - started;
    const saved = await db`
      INSERT INTO public.seo_audits
        (prospect_id,website_url,overall_score,findings,recommendations,provider,verified_at)
      VALUES
        (${prospect.id},${page.url},${score},${JSON.stringify({
          source: 'agencyos_public_html_audit_v1',
          http_status: page.status,
          content_type: page.contentType,
          response_time_ms: elapsed,
          title, meta_description: description, h1: h1s,
          viewport, canonical, https, image_count: images.length,
          images_missing_alt: missingAlt, internal_link_count: internalLinks,
          language: lang, robots,
          limitations: ['Single public HTML response only','No JavaScript rendering','No Lighthouse/Core Web Vitals','No backlink, keyword, schema, accessibility or ranking analysis'],
        })}::jsonb,
        ${JSON.stringify(recommendations)}::jsonb,
        'AgencyOS HTML Inspector', NOW())
      RETURNING id,overall_score,website_url,verified_at
    `;
    const opportunity = scoreProspectOpportunity({ website_status: 'active', audit_score: score, audit_findings: findings });
    await db`UPDATE public.prospects SET opportunity_score = ${opportunity.score} WHERE id = ${prospect.id}`;
    return NextResponse.json({
      audit: { ...saved[0], findings, recommendations, response_time_ms: elapsed },
      notice: 'This is a first-pass public HTML inspection, not a full Lighthouse or search-ranking audit.',
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to audit this website.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

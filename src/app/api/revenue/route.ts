import {NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {auth} from '@/lib/auth';
import { dateOnly, money } from '@/lib/finance-validation.mjs';
export const dynamic='force-dynamic';
async function owner(){const {data}=await auth.getSession();const email=data?.user?.email;return Boolean(email&&process.env.OWNER_EMAIL&&email.toLowerCase()===process.env.OWNER_EMAIL.toLowerCase());}
const currencyOk=(v:unknown)=>typeof v==='string'&&/^[A-Z]{3}$/.test(v);
export async function GET(){
 if(!(await owner()))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database is not configured.'},{status:503});
 try{const db=neon(process.env.DATABASE_URL);
 const [clients,projects,invoices,retainers,expenses,summary]=await Promise.all([
  db`SELECT id,business_name FROM public.clients ORDER BY business_name LIMIT 500`,
  db`SELECT id,client_id,name,status FROM public.projects ORDER BY name LIMIT 1000`,
  db`SELECT i.*,c.business_name,p.name AS project_name,COALESCE((SELECT json_agg(json_build_object('id',p.id,'amount',p.amount,'payment_date',p.payment_date,'method',p.method,'reference',p.reference,'notes',p.notes) ORDER BY p.payment_date DESC) FROM public.agency_payments p WHERE p.invoice_id=i.id),'[]'::json) AS payments FROM public.agency_invoices i JOIN public.clients c ON c.id=i.client_id LEFT JOIN public.projects p ON p.id=i.project_id ORDER BY i.created_at DESC LIMIT 200`,
  db`SELECT r.*,c.business_name FROM public.agency_retainers r JOIN public.clients c ON c.id=r.client_id ORDER BY r.next_billing_date ASC LIMIT 200`,
  db`SELECT * FROM public.agency_expenses ORDER BY expense_date DESC,created_at DESC LIMIT 100`,
  db`WITH currencies AS (SELECT currency FROM public.agency_invoices UNION SELECT currency FROM public.agency_expenses UNION SELECT currency FROM public.agency_retainers) SELECT x.currency,COALESCE(i.invoiced,0) AS invoiced,COALESCE(i.collected,0) AS collected,COALESCE(i.outstanding,0) AS outstanding,COALESCE(i.overdue,0) AS overdue,COALESCE(r.mrr,0) AS mrr,COALESCE(e.month_costs,0) AS month_costs FROM currencies x LEFT JOIN LATERAL (SELECT SUM(total) FILTER(WHERE status NOT IN ('draft','void')) AS invoiced,SUM(amount_paid) FILTER(WHERE status NOT IN ('draft','void')) AS collected,SUM(total-amount_paid) FILTER(WHERE status NOT IN ('draft','void')) AS outstanding,SUM(total-amount_paid) FILTER(WHERE status NOT IN ('draft','void') AND due_date<CURRENT_DATE AND total>amount_paid) AS overdue FROM public.agency_invoices WHERE currency=x.currency) i ON true LEFT JOIN LATERAL (SELECT SUM(amount * CASE billing_cycle WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 1.0/3 WHEN 'annual' THEN 1.0/12 END) AS mrr FROM public.agency_retainers WHERE currency=x.currency AND status='active') r ON true LEFT JOIN LATERAL (SELECT SUM(amount) AS month_costs FROM public.agency_expenses WHERE currency=x.currency AND date_trunc('month',expense_date)=date_trunc('month',CURRENT_DATE)) e ON true ORDER BY x.currency`
 ]);
 return NextResponse.json({clients,projects,invoices,retainers,expenses,summary});
 }catch{return NextResponse.json({error:'Could not load revenue workspace.'},{status:500});}
}
export async function POST(req:Request){
 if(!(await owner()))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:'Database is not configured.'},{status:503});
 try{const b=await req.json();if(!b||typeof b!=='object'||Array.isArray(b))return NextResponse.json({error:'A valid request body is required.'},{status:400});const db=neon(process.env.DATABASE_URL);const action=String(b.action||'');
 if(action==='create_invoice'){
  const clientId=String(b.client_id||'');const currency=String(b.currency||'NGN').toUpperCase();const items=Array.isArray(b.line_items)?b.line_items.slice(0,30):[];
  if(!clientId||!currencyOk(currency)||!items.length)return NextResponse.json({error:'Choose a client and add at least one invoice item.'},{status:400});
  const clean: {description:string;quantity:number;unit_price:number}[]=items.map((x:any)=>({description:String(x.description||'').trim().slice(0,180),quantity:Math.max(0,Math.min(100000,Number(x.quantity)||0)),unit_price:money(x.unit_price)}));
  if(clean.some(x=>x.description.length<2||x.quantity<=0||!Number.isFinite(x.unit_price)||x.unit_price<0))return NextResponse.json({error:'Check each line description, quantity and unit price.'},{status:400});
  const subtotal=Math.round(clean.reduce((s,x)=>s+x.quantity*x.unit_price,0)*100)/100;const tax=money(b.tax_amount??0);
  if(!Number.isFinite(subtotal)||subtotal>1_000_000_000_000||!Number.isFinite(tax)||tax>1_000_000_000_000||subtotal+tax<=0||subtotal+tax>1_000_000_000_000)return NextResponse.json({error:'Invoice total must be greater than zero.'},{status:400});
  const due=b.due_date?dateOnly(b.due_date):null;if(b.due_date&&!due)return NextResponse.json({error:'Enter a valid invoice due date.'},{status:400});
  const notes=typeof b.notes==='string'?b.notes.trim().slice(0,3000):null;
  const projectId=typeof b.project_id==='string'&&b.project_id.trim()?b.project_id.trim():null;
  if(projectId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId))return NextResponse.json({error:'Choose a valid project.'},{status:400});
  const rows=await db`INSERT INTO public.agency_invoices(client_id,project_id,invoice_number,currency,line_items,subtotal,tax_amount,total,due_date,notes) SELECT c.id,pr.id,'INV-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),${currency},${JSON.stringify(clean)}::jsonb,${subtotal},${tax},${subtotal+tax},${due},${notes} FROM public.clients c LEFT JOIN public.projects pr ON pr.id=${projectId} AND pr.client_id=c.id WHERE c.id=${clientId} AND (${projectId}::uuid IS NULL OR pr.id IS NOT NULL) RETURNING *`;
  if(!rows[0])return NextResponse.json({error:'Client not found.'},{status:404});
  await db`INSERT INTO public.activity_log(department,event_type,summary,entity_type,entity_id,metadata) VALUES('finance','invoice_draft_created',${'Invoice draft '+rows[0].invoice_number+' created'},'invoice',${rows[0].id},${JSON.stringify({total:rows[0].total,currency})}::jsonb)`;
  return NextResponse.json({invoice:rows[0]},{status:201});
 }
 if(action==='issue_invoice'){
  const id=String(b.invoice_id||'');if(b.confirmed!==true)return NextResponse.json({error:'Explicit confirmation is required to issue an invoice.'},{status:400});
  const rows=await db`UPDATE public.agency_invoices SET status='issued',issue_date=CURRENT_DATE,updated_at=now() WHERE id=${id} AND status='draft' RETURNING *`;
  if(!rows[0])return NextResponse.json({error:'Draft invoice not found or already issued.'},{status:409});
  await db`INSERT INTO public.activity_log(department,event_type,summary,entity_type,entity_id,metadata) VALUES('finance','invoice_issued',${'Invoice '+rows[0].invoice_number+' issued'},'invoice',${rows[0].id},${JSON.stringify({total:rows[0].total,currency:rows[0].currency})}::jsonb)`;
  return NextResponse.json({invoice:rows[0]});
 }
 if(action==='record_payment'){
  const id=String(b.invoice_id||''),amount=money(b.amount),method=['bank_transfer','cash','card','payment_link','payoneer','other'].includes(b.method)?b.method:'other';
  const idempotencyKey=String(b.idempotency_key||'');
  if(!id||!Number.isFinite(amount)||amount<=0||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return NextResponse.json({error:'Enter a valid payment amount and request key.'},{status:400});
  const date=b.payment_date?dateOnly(b.payment_date):null;if(b.payment_date&&!date)return NextResponse.json({error:'Enter a valid payment date.'},{status:400});
  const reference=typeof b.reference==='string'?b.reference.trim().slice(0,180):null,notes=typeof b.notes==='string'?b.notes.trim().slice(0,1000):null;
  const rows=await db`WITH target AS (SELECT id,currency,total,amount_paid,status FROM public.agency_invoices WHERE id=${id} AND status IN ('issued','partially_paid','overdue') FOR UPDATE), added AS (INSERT INTO public.agency_payments(invoice_id,amount,currency,payment_date,method,reference,notes,idempotency_key) SELECT id,${amount},currency,COALESCE(${date}::date,CURRENT_DATE),${method},${reference},${notes},${idempotencyKey}::uuid FROM target WHERE total-amount_paid>=${amount} ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING invoice_id,amount), updated AS (UPDATE public.agency_invoices i SET amount_paid=i.amount_paid+a.amount,status=CASE WHEN i.amount_paid+a.amount>=i.total THEN 'paid' ELSE 'partially_paid' END,updated_at=now() FROM added a WHERE i.id=a.invoice_id RETURNING i.*), logged AS (INSERT INTO public.activity_log(department,event_type,summary,entity_type,entity_id,metadata) SELECT 'finance','payment_recorded','Payment recorded for '||u.invoice_number,'invoice',u.id,jsonb_build_object('amount',a.amount,'currency',u.currency,'status',u.status) FROM updated u JOIN added a ON a.invoice_id=u.id RETURNING id) SELECT updated.*,added.amount AS recorded_amount FROM updated JOIN added ON added.invoice_id=updated.id`;
  if(!rows[0]){
   const existing=await db`SELECT invoice_id,amount FROM public.agency_payments WHERE idempotency_key=${idempotencyKey}::uuid LIMIT 1`;
   if(existing[0]&&existing[0].invoice_id===id&&Number(existing[0].amount)===amount)return NextResponse.json({duplicate:true,payment:existing[0],message:'This payment was already recorded.'});
   return NextResponse.json({error:'Payment exceeds the remaining balance, or the invoice is not open for payment.'},{status:409});
  }
  return NextResponse.json({invoice:rows[0]},{status:201});
 }
 if(action==='create_retainer'){
  const clientId=String(b.client_id||''),name=String(b.service_name||'').trim().slice(0,180),amount=money(b.amount),currency=String(b.currency||'NGN').toUpperCase(),cycle=b.billing_cycle;
  if(!clientId||name.length<2||!Number.isFinite(amount)||amount<=0||!currencyOk(currency)||!['monthly','quarterly','annual'].includes(cycle))return NextResponse.json({error:'Complete the client, service, amount, currency and billing cycle.'},{status:400});
  const next=dateOnly(b.next_billing_date);if(!next)return NextResponse.json({error:'Choose a valid next billing date.'},{status:400});
  const rows=await db`INSERT INTO public.agency_retainers(client_id,service_name,description,amount,currency,billing_cycle,next_billing_date) SELECT id,${name},${String(b.description||'').trim().slice(0,1000)},${amount},${currency},${cycle},${next} FROM public.clients WHERE id=${clientId} RETURNING *`;
  if(!rows[0])return NextResponse.json({error:'Client not found.'},{status:404});
  await db`INSERT INTO public.activity_log(department,event_type,summary,entity_type,entity_id,metadata) VALUES('finance','retainer_created',${'Recurring service tracked: '+name},'retainer',${rows[0].id},${JSON.stringify({amount,currency,cycle})}::jsonb)`;
  return NextResponse.json({retainer:rows[0]},{status:201});
 }
 if(action==='create_expense'){
  const description=String(b.description||'').trim().slice(0,180),amount=money(b.amount),currency=String(b.currency||'NGN').toUpperCase();
  if(description.length<2||!Number.isFinite(amount)||amount<=0||!currencyOk(currency))return NextResponse.json({error:'Enter a description, valid amount and currency.'},{status:400});
  const date=b.expense_date?dateOnly(b.expense_date):null;if(b.expense_date&&!date)return NextResponse.json({error:'Enter a valid expense date.'},{status:400});
  const rows=await db`INSERT INTO public.agency_expenses(description,category,amount,currency,expense_date,vendor,reference,notes) VALUES(${description},${String(b.category||'other').slice(0,80)},${amount},${currency},COALESCE(${date}::date,CURRENT_DATE),${String(b.vendor||'').trim().slice(0,180)},${String(b.reference||'').trim().slice(0,180)},${String(b.notes||'').trim().slice(0,1000)}) RETURNING *`;
  await db`INSERT INTO public.activity_log(department,event_type,summary,entity_type,entity_id,metadata) VALUES('finance','expense_recorded',${'Expense recorded: '+description},'expense',${rows[0].id},${JSON.stringify({amount,currency})}::jsonb)`;
  return NextResponse.json({expense:rows[0]},{status:201});
 }
 return NextResponse.json({error:'Unknown revenue action.'},{status:400});
 }catch{return NextResponse.json({error:'Revenue action failed. Check the submitted details and try again.'},{status:500});}
}

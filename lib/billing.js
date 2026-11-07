// REVENGE+ membership, billed monthly through Stripe Checkout.
//
// Needs STRIPE_SECRET_KEY in Vercel. The price comes from MEMBER_PRICE_CENTS
// (default 499 = $4.99/month). No webhook is needed: after checkout the
// browser returns with the Checkout Session id, which we verify directly with
// Stripe, and the subscription status is re-checked with Stripe whenever the
// paid period has run out (so renewals and cancellations are picked up).

export const PRICE_CENTS = () => Math.max(100, parseInt(process.env.MEMBER_PRICE_CENTS || '499', 10) || 499);
export const billingOn = () => !!process.env.STRIPE_SECRET_KEY;

async function stripe(path, params, method = 'POST') {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const r = await fetch('https://api.stripe.com/v1/' + path + (method === 'GET' && body ? '?' + body : ''), {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || 'Payment service error');
  return d;
}

export function isPlus(account) {
  const p = account && account.plus;
  if (!p) return false;
  if (p.comp) return true; // granted free by the owner
  return ['active', 'trialing', 'past_due'].includes(p.status) && Date.parse(p.periodEnd || 0) > Date.now();
}

export async function createCheckout(account, origin) {
  const params = {
    mode: 'subscription',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(PRICE_CENTS()),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': 'REVENGE+ membership',
    'line_items[0][price_data][product_data][description]': 'REVENGE+ badge, no ads, longer posts and exclusive themes on JAVISREVENGE.',
    client_reference_id: account.username,
    'metadata[username]': account.username,
    'subscription_data[metadata][username]': account.username,
    success_url: `${origin}/wall?view=plus&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/wall?view=plus&canceled=1`,
    allow_promotion_codes: 'true'
  };
  if (account.plus && account.plus.customer) params.customer = account.plus.customer;
  else params.customer_email = account.email;
  const s = await stripe('checkout/sessions', params);
  return s.url;
}

function fromSubscription(sub, customer) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const end = sub.current_period_end || (item && item.current_period_end);
  return {
    subscription: sub.id, customer: customer || sub.customer, status: sub.status,
    periodEnd: end ? new Date(end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end, checkedAt: new Date().toISOString()
  };
}

// Verify a finished checkout belongs to this member, then record the subscription.
export async function confirmCheckout(account, sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId))) throw new Error('Invalid checkout session');
  const s = await stripe('checkout/sessions/' + sessionId, { 'expand[]': 'subscription' }, 'GET');
  if (s.client_reference_id !== account.username) throw new Error('This checkout belongs to a different account');
  if (s.status !== 'complete' || !s.subscription) throw new Error('Payment is not complete yet');
  return { ...fromSubscription(s.subscription, s.customer), since: (account.plus && account.plus.since) || new Date().toISOString() };
}

// Re-check with Stripe if the paid period has ended (renewed? cancelled?).
export async function refreshPlus(account) {
  const p = account.plus;
  if (!p || p.comp || !p.subscription || !billingOn()) return null;
  const stale = !p.periodEnd || Date.parse(p.periodEnd) < Date.now() || Date.now() - Date.parse(p.checkedAt || 0) > 24 * 3600e3;
  if (!stale) return null;
  const sub = await stripe('subscriptions/' + p.subscription, null, 'GET');
  return { ...p, ...fromSubscription(sub, p.customer) };
}

export async function portalUrl(account, origin) {
  if (!account.plus || !account.plus.customer) throw new Error('No billing account yet');
  const s = await stripe('billing_portal/sessions', { customer: account.plus.customer, return_url: `${origin}/wall?view=plus` });
  return s.url;
}

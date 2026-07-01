/* Verifies the schema and seeds a few real test barbers into Supabase.
 * Uses the SECRET key (admin) so it bypasses row-level security. Idempotent —
 * safe to re-run. Run: node scripts/seed-barbers.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const k = JSON.parse(await readFile(join(ROOT, 'keys.local.json'), 'utf8'));
const sb = createClient(k.SUPABASE_URL, k.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// 1) verify every table is present
console.log('Verifying tables:');
for (const t of ['profiles', 'barbers', 'services', 'bookings', 'barber_locations', 'reviews', 'favorites']) {
  const { error, count } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log('  ' + (error ? '❌' : '✅'), t, error ? '— ' + error.message : `(${count} rows)`);
}

// 2) seed test barbers (NYC / Manhattan area, matching the app's demo names)
const BARBERS = [
  { email: 'marcus@catchafade.test',  name: 'Marcus Brown', vehicle: 'Black SUV',   rating: 4.9,  cuts: 312, lat: 40.7308, lng: -73.9975,
    services: [['Skin Fade', 4000, 45], ['Beard Trim', 2000, 20], ['Cut + Beard', 5500, 60]] },
  { email: 'devon@catchafade.test',   name: 'Devon Reid',   vehicle: 'Honda Civic', rating: 4.8,  cuts: 256, lat: 40.7380, lng: -73.9890,
    services: [['Taper Fade', 3500, 40], ['Beard Sculpt', 2500, 25], ['Lineup', 1500, 15]] },
  { email: 'jaylen@catchafade.test',  name: 'Jaylen Mills', vehicle: 'Jeep',        rating: 5.0,  cuts: 410, lat: 40.7250, lng: -74.0030,
    services: [['Full Cut', 4500, 50], ['Bald Fade', 4000, 45], ['Kids Cut', 3000, 30]] },
  { email: 'andre@catchafade.test',   name: 'Andre Cole',   vehicle: 'Tesla',       rating: 4.95, cuts: 198, lat: 40.7420, lng: -73.9850,
    services: [['Skin Fade', 4200, 45], ['Hair Design', 5000, 60], ['Waves Cut', 3800, 40]] },
];

console.log('\nSeeding barbers:');
for (const b of BARBERS) {
  // create the auth user (or find it if it already exists)
  let userId;
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email: b.email, password: 'CatchAFade!test1', email_confirm: true, user_metadata: { full_name: b.name }
  });
  if (cErr) {
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = (list.users.find(u => u.email === b.email) || {}).id;
  } else {
    userId = created.user.id;
  }
  if (!userId) { console.log('  ❌', b.name, '— could not create/find user'); continue; }

  // promote their profile to a barber
  await sb.from('profiles').upsert({ id: userId, role: 'barber', full_name: b.name }, { onConflict: 'id' });

  // barber row
  const { data: barberRow, error: bErr } = await sb.from('barbers').upsert({
    profile_id: userId, vehicle: b.vehicle, rating: b.rating, cuts_completed: b.cuts,
    home_lat: b.lat, home_lng: b.lng, is_verified: true, is_available: true, bio: `${b.name} — Verified Pro`
  }, { onConflict: 'profile_id' }).select().single();
  if (bErr) { console.log('  ❌', b.name, '—', bErr.message); continue; }

  // services (reset then insert, so re-runs stay clean)
  await sb.from('services').delete().eq('barber_id', barberRow.id);
  await sb.from('services').insert(b.services.map(([name, price, dur]) => ({
    barber_id: barberRow.id, name, price_cents: price, duration_min: dur
  })));

  // live location
  await sb.from('barber_locations').upsert({ barber_id: barberRow.id, lat: b.lat, lng: b.lng }, { onConflict: 'barber_id' });

  console.log('  ✅', b.name, '— ⭐' + b.rating, '·', b.services.length, 'services · available');
}

const { count } = await sb.from('barbers').select('*', { count: 'exact', head: true });
console.log('\nTotal barbers in the database now:', count);

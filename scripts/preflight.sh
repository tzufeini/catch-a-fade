#!/usr/bin/env bash
# Catch a Fade — pre-submit preflight.
#
# Every outage this project has hit was a CONFIG problem, not a code problem:
# an npm install that never ran, a Google API never enabled, a Supabase project
# that auto-paused, an email sender stuck in sandbox mode. None of those are
# visible in index.html, so this script pokes the real services instead.
#
#   bash scripts/preflight.sh
#
# Run it before every App Store submission, and any time the app "just breaks".

API="${API:-https://catch-a-fade.onrender.com}"
SB_URL="${SB_URL:-https://jjiiaxqnqnbmuqdbsbdl.supabase.co}"
SB_KEY="${SB_KEY:-sb_publishable_jJ6e6ElTmFMv5IPs64GZpQ_Xy7q4G60}"
GMAPS="${GMAPS:-AIzaSyCP45rZDYMA6Y11_AL9nuy7Jqv7huoVIJg}"
REVIEW_EMAIL="${REVIEW_EMAIL:-review@catchafade.app}"
REVIEW_CODE="${REVIEW_CODE:-010101}"

pass=0; fail=0
ok()   { printf "  \033[32mPASS\033[0m  %s\n" "$1"; pass=$((pass+1)); }
bad()  { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; printf "        ↳ %s\n" "$2"; fail=$((fail+1)); }
warn() { printf "  \033[33mWARN\033[0m  %s\n" "$1"; }

echo "── Catch a Fade preflight ─────────────────────────────"
echo "Render free tier sleeps; the first call can take ~60s."
echo

# 1. Backend up, with every integration reporting in.
echo "Backend"
H=$(curl -s --max-time 90 "$API/api/health")
case "$H" in
  *'"ok":true'*) ok "health reachable" ;;
  *) bad "health unreachable" "got: ${H:-<empty>}" ;;
esac
for svc in stripe supabase resend; do
  case "$H" in
    *"\"$svc\":true"*) ok "$svc key present" ;;
    *) bad "$svc key MISSING" "check the Render env vars" ;;
  esac
done

# 2. Stripe must mint a real intent. This is what caught buildCommand:"true",
#    where the key was set but the npm package had never been installed.
echo
echo "Payments"
PI=$(curl -s --max-time 60 -X POST "$API/api/create-payment-intent" \
      -H 'Content-Type: application/json' \
      -d '{"servicePrice":3800,"barberName":"Preflight","serviceName":"Fade"}')
case "$PI" in
  *clientSecret*) ok "payment intent created" ;;
  *) bad "payment intent FAILED" "got: ${PI:0:160}" ;;
esac
# Tampered price must be refused, or anyone can buy a $40 cut for 63c.
LOW=$(curl -s --max-time 60 -X POST "$API/api/create-payment-intent" \
      -H 'Content-Type: application/json' \
      -d '{"servicePrice":63,"barberName":"Preflight","serviceName":"Fade"}')
case "$LOW" in
  *clientSecret*) bad "under-price NOT rejected" "price bounds are not enforced" ;;
  *) ok "under-price rejected" ;;
esac

# 3. Supabase. Free projects auto-pause after ~7 days idle, and a paused
#    project loses its DNS — which looks exactly like a deleted one.
echo
echo "Supabase"
if host "${SB_URL#https://}" >/dev/null 2>&1 || python3 -c "import socket,sys;socket.gethostbyname(sys.argv[1])" "${SB_URL#https://}" 2>/dev/null; then
  ok "DNS resolves"
  B=$(curl -s --max-time 40 "$SB_URL/rest/v1/barbers?select=id&is_available=eq.true" \
        -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY")
  N=$(printf '%s' "$B" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else -1)' 2>/dev/null || echo -1)
  if [ "$N" -gt 0 ] 2>/dev/null; then ok "$N barber(s) available"
  elif [ "$N" = "0" ]; then warn "0 barbers available — app falls back to the built-in list"
  else bad "barbers query failed" "${B:0:160}"; fi
else
  bad "DNS does NOT resolve" "project is almost certainly PAUSED — resume it at supabase.com/dashboard"
fi

# 4. Google Maps. Enabled-vs-restricted is invisible in code: the SDK loads
#    fine and individual calls fail silently at runtime.
echo
echo "Google Maps"
gstat() { curl -s --max-time 30 "$1" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status","?"))' 2>/dev/null || echo ERR; }
[ "$(gstat "https://maps.googleapis.com/maps/api/geocode/json?address=Tel+Aviv&key=$GMAPS")" = "OK" ] \
  && ok "Geocoding works" \
  || bad "Geocoding DENIED" "enable Geocoding API, and keep it on the key's allow-list"
[ "$(gstat "https://maps.googleapis.com/maps/api/directions/json?origin=A&destination=B&key=$GMAPS")" = "REQUEST_DENIED" ] \
  && ok "Directions blocked (key is restricted)" \
  || bad "Directions ALLOWED" "key is too permissive — restrict it to the 4 APIs you use"

# 5. The reviewer's demo login. If this breaks, App Review cannot open the app
#    and you get a Guideline 2.1 rejection.
echo
echo "App Review demo login"
curl -s --max-time 60 -X POST "$API/api/send-code" -H 'Content-Type: application/json' \
     -d "{\"email\":\"$REVIEW_EMAIL\"}" >/dev/null
V=$(curl -s --max-time 60 -X POST "$API/api/verify-code" -H 'Content-Type: application/json' \
     -d "{\"email\":\"$REVIEW_EMAIL\",\"code\":\"$REVIEW_CODE\"}")
case "$V" in
  *'"ok":true'*) ok "$REVIEW_EMAIL / $REVIEW_CODE works" ;;
  *) bad "demo login BROKEN" "App Review will be locked out. got: ${V:0:120}" ;;
esac

# 6. Legal pages — Apple opens these from the listing.
echo
echo "Legal pages"
for p in privacy terms support; do
  C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 40 "$API/$p")
  [ "$C" = "200" ] && ok "/$p ($C)" || bad "/$p ($C)" "Apple checks these"
done

# 7. iPad layout guard.
# Apple rejected 1.0(5) under Guideline 4 after reviewing on an iPad Air 11".
# This ships iPhone-only, but iPadOS runs it anyway and App Review tests it
# there. Only 20 of 42 screens have an inner scroll container, so on a wider
# window the rest were clipped by .phone{overflow:hidden} with no way to scroll.
# These two rules are what make an oversized window safe — never ship without them.
echo
echo "iPad layout guard"
SRC="$(dirname "$0")/../index.html"
grep -q "min-width:480px" "$SRC" \
  && ok "phone-width column for large windows" \
  || bad "iPad column rule MISSING" "content will stretch full-width on iPad"
grep -q "html.native .screen{ overflow-y:auto" "$SRC" \
  && ok "screens can always scroll" \
  || bad "screen scroll net MISSING" "content can be clipped with no way to reach it"

echo
echo "───────────────────────────────────────────────────────"
printf "%d passed, %d failed\n" "$pass" "$fail"
[ "$fail" -eq 0 ] && echo "Safe to submit." || echo "Fix the failures above BEFORE submitting."
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)

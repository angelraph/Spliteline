#!/usr/bin/env bash
# AVENOR live demo script — run this yourself in a plain terminal while recording.
# It sends a real deposit, then calls AVENOR's live service to execute a real payout.
set -e

AVENOR_URL="https://avenor-pay-production.up.railway.app"
AVENOR_ADDRESS="0x7fd56a157a70f1011c9a2fbd01e98595f08682f8"
TOKEN="0x779Ded0c9e1022225f8E0630b35a9b54bE713736"

# Edit these two if you want to change who gets paid and how much for the demo:
RECIPIENT="0x95d4953a3405daa8288260a9e3cafd99dd923be0"
PAYOUT_AMOUNT="0.05"
DEPOSIT_AMOUNT="0.2"

# Retries a command that prints a JSON line with {"ok":true,...}. The onchainos
# CLI occasionally logs a "proxy node unavailable, falling back to direct
# connection" warning and returns a non-ok response on that attempt — retrying
# rather than crashing keeps a transient network hiccup from killing the demo.
run_with_retry() {
  local desc="$1"; shift
  local attempt=1
  local max=3
  local json=""
  while [ "$attempt" -le "$max" ]; do
    json=$("$@" | grep -o '{.*}' | tail -n 1)
    if [ -n "$json" ] && echo "$json" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{try{process.exit(JSON.parse(d).ok?0:1)}catch(e){process.exit(1)}});
    "; then
      echo "$json"
      return 0
    fi
    echo "  [$desc] attempt $attempt/$max didn't return a valid response, retrying..." >&2
    attempt=$((attempt + 1))
    sleep 2
  done
  echo "  [$desc] failed after $max attempts. Last response:" >&2
  echo "  $json" >&2
  return 1
}

echo ""
echo "=== AVENOR live demo ==="
echo ""
echo "Step 1: sending a real deposit of $DEPOSIT_AMOUNT USD₮0 to AVENOR..."
DEPOSIT_JSON=$(run_with_retry "deposit send" onchainos wallet send --chain xlayer --contract-token "$TOKEN" --recipient "$AVENOR_ADDRESS" --readable-amount "$DEPOSIT_AMOUNT") || exit 1
DEPOSIT_TX=$(echo "$DEPOSIT_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.txHash))")
echo ""
echo "Deposit sent. Real transaction:"
echo "https://www.oklink.com/x-layer/tx/$DEPOSIT_TX"
echo ""
read -p "Press Enter once you've shown that on screen, to continue..."

echo ""
echo "Step 2: asking AVENOR to pay $PAYOUT_AMOUNT USD₮0 to $RECIPIENT..."
RESP=$(curl -sD - -X POST "$AVENOR_URL/execute" -H "Content-Type: application/json" \
  -d "{\"depositTxHash\":\"$DEPOSIT_TX\",\"recipient\":\"$RECIPIENT\",\"amount\":\"$PAYOUT_AMOUNT\"}")
PAYLOAD=$(echo "$RESP" | grep -i "^payment-required:" | sed 's/^[Pp]ayment-[Rr]equired: //' | tr -d '\r\n')

echo "AVENOR is asking to be paid its service fee first (this is normal)..."
SIGNED=$(run_with_retry "fee payment signing" onchainos payment pay --payload "$PAYLOAD") || exit 1
AUTH=$(echo "$SIGNED" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.authorization_header))")

echo "Paying the fee and completing the real payment..."
RESULT=$(curl -s -X POST "$AVENOR_URL/execute" -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: $AUTH" \
  -d "{\"depositTxHash\":\"$DEPOSIT_TX\",\"recipient\":\"$RECIPIENT\",\"amount\":\"$PAYOUT_AMOUNT\"}")

FEE_TX=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).feeTxHash)}catch(e){console.log('')}})")
PAYOUT_TX=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).payoutTxHash)}catch(e){console.log('')}})")

echo ""
if [ -n "$PAYOUT_TX" ]; then
  echo "Done. AVENOR paid it for real."
  echo ""
  echo "AVENOR's own fee payment:"
  echo "https://www.oklink.com/x-layer/tx/$FEE_TX"
  echo ""
  echo "The real payment AVENOR sent on your behalf:"
  echo "https://www.oklink.com/x-layer/tx/$PAYOUT_TX"
else
  echo "Something went wrong. Raw response:"
  echo "$RESULT"
fi
echo ""

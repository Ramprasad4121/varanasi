#!/usr/bin/env bash
# Varanasi bank-backed gold (vGOLD): one-command demo on a LOCAL anvil chain.
# Nothing here touches a public network. Keys are anvil's well-known dev keys.
# The "bank" is a MOCK signer key; no real bank, no real gold.
#
#   scripts/gold-demo.sh        # needs forge, anvil, cast (Foundry), jq, python3
#
# Story: Alice deposits 10 g of gold at Mock Bank. The bank assays it at
# 995 fine = 9.950 g fine gold and signs an EIP-712 attestation. A relayer mints
# 9.950 vGOLD to Alice. Alice sends 4 vGOLD to Bob. Bob (not the depositor)
# burns 4 vGOLD into a redemption request; the bank releases the gold and
# confirms on chain. Proof of reserve is printed after every step.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
PORT="${GOLD_DEMO_PORT:-18546}"
RPC="http://127.0.0.1:$PORT"
RUN="$ROOT/demo/.run"
mkdir -p "$RUN"

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # governance / deployer
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d # Alice (depositor)
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a # Bob (buyer, redeems)
K3=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 # MOCK bank signer (assay desk key)
K4=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a # relayer (anyone)
K5=0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba # bank operator (vault desk)
K8=0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97 # Mallory (forger)
addr() { cast wallet address --private-key "$1"; }
GOV=$(addr $K0); ALICE=$(addr $K1); BOB=$(addr $K2); BANKSIG=$(addr $K3); BANKOPS=$(addr $K5); MALLORY=$(addr $K8)

hr() { printf '\n==== %s ====\n' "$*"; }
send() { # fails loudly if the tx reverted
  local key=$1; shift
  local r; r=$(cast send --rpc-url "$RPC" --private-key "$key" "$@" --json)
  [ "$(echo "$r" | jq -r '.status')" = "0x1" ] || { echo "tx failed: $*" >&2; echo "$r" >&2; exit 1; }
  echo "$r" | jq -r '.transactionHash'
}
create() {
  local key=$1 id=$2; shift 2
  local args=()
  [ $# -gt 0 ] && args=(--constructor-args "$@")
  forge create --rpc-url "$RPC" --private-key "$key" --broadcast --json "$id" "${args[@]}" 2>/dev/null | jq -r '.deployedTo'
}
call() { cast call --rpc-url "$RPC" "$@"; }
grams() { python3 -c "import sys; print(f'{int(sys.argv[1])/1000:,.3f} g')" "$1"; }
bal() { python3 -c "import sys; print(f'{int(sys.argv[1])/1e18:,.3f}')" "$(call "$TOKEN" 'balanceOf(address)(uint256)' "$1" | awk '{print $1}')"; }
por() {
  local out; out=$(call "$ISSUER" 'proofOfReserve()(uint256,uint256,uint256,uint256,bool)')
  local s a p d b
  s=$(echo "$out" | sed -n 1p | awk '{print $1}'); a=$(echo "$out" | sed -n 2p | awk '{print $1}')
  p=$(echo "$out" | sed -n 3p | awk '{print $1}'); d=$(echo "$out" | sed -n 4p | awk '{print $1}')
  b=$(echo "$out" | sed -n 5p)
  printf '  proof of reserve | vGOLD supply %12s | bank-attested %12s | pending release %10s | disputed %8s | fully backed: %s\n' \
    "$(grams "$s")" "$(grams "$a")" "$(grams "$p")" "$(grams "$d")" "$b"
  printf '  balances (vGOLD) | Alice %8s | Bob %8s\n' "$(bal "$ALICE")" "$(bal "$BOB")"
}
TUPLE='(bytes32,address,bytes32,uint256,uint256,uint256,uint256)'
bank_sign() { # bankKey bankId user cert fineMilli purity nonce expiry -> signature
  local key=$1; shift
  local digest
  digest=$(call "$ISSUER" "hashAttestation($TUPLE)(bytes32)" "($1,$2,$3,$4,$5,$6,$7)")
  cast wallet sign --no-hash --private-key "$key" "$digest"
}
try_send() { # expect a revert; print the decoded custom error
  local label=$1; shift
  local out
  if out=$(cast send --rpc-url "$RPC" "$@" 2>&1); then echo "  UNEXPECTED: $label succeeded"; exit 1; fi
  local sel; sel=$(echo "$out" | grep -o 'custom error 0x[0-9a-f]\{8\}' | head -1 | awk '{print $3}')
  echo "  BLOCKED  $label -> ${ERRS[$sel]:-$sel}"
}
declare -A ERRS
load_errors() { # selector -> error name from the compiled ABIs
  local f sigline
  for f in BankGoldIssuer GoldRegistry GoldToken; do
    while read -r sigline; do
      ERRS[$(cast sig "$sigline")]="${sigline%%(*}"
    done < <(jq -r '.abi[] | select(.type=="error") | "\(.name)(\(.inputs|map(.type)|join(",")))"' \
      "$ROOT/contracts/out/$f.sol/$f.json")
  done
}

hr "0. local anvil chain on $RPC"
anvil --port "$PORT" --silent --chain-id 31337 >"$RUN/gold-anvil.log" 2>&1 &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
echo "anvil up (chain 31337)"

hr "1. deploy vGOLD + registry + BankGoldIssuer, register Mock Bank"
(cd "$ROOT/contracts" && forge build --skip test --skip script >/dev/null 2>&1) && echo "contracts/ built"
load_errors
cd "$ROOT/contracts"
TOKEN=$(create $K0 src/gold/GoldToken.sol:GoldToken)
REG=$(create $K0 src/gold/GoldRegistry.sol:GoldRegistry)
ISSUER=$(create $K0 src/gold/BankGoldIssuer.sol:BankGoldIssuer "$GOV" "$TOKEN" "$REG")
send $K0 "$TOKEN" 'bindIssuer(address)' "$ISSUER" >/dev/null
send $K0 "$REG" 'bindIssuer(address)' "$ISSUER" >/dev/null
BANK=$(cast keccak "MOCK-BANK-HYD-01")
send $K0 "$ISSUER" 'addBank(bytes32,string,address,address)' "$BANK" "Mock Bank (gold deposit desk)" "$BANKSIG" "$BANKOPS" >/dev/null
echo "vGOLD          $TOKEN"
echo "GoldRegistry   $REG"
echo "BankGoldIssuer $ISSUER"
echo "Mock bank signer $BANKSIG, operator $BANKOPS"
por

hr "2. Alice deposits 10 g at the bank; assay 995 fine -> bank signs attestation for 9.950 g fine"
CERT=$(cast keccak "MOCKBANK-GD-2026-000123")
EXP=$(( $(cast block latest --rpc-url "$RPC" --field timestamp) + 86400 ))
SIG=$(bank_sign $K3 "$BANK" "$ALICE" "$CERT" 9950 995 1 "$EXP")
echo "certificate $CERT"
echo "bank EIP-712 signature ${SIG:0:22}..."

ATT="($BANK,$ALICE,$CERT,9950,995,1,$EXP)"

hr "3. attacks before the honest mint"
FAKECERT=$(cast keccak FAKE-CERT)
FAKE=$(bank_sign $K8 "$BANK" "$MALLORY" "$FAKECERT" 1000000 999 2 "$EXP")
try_send "Mallory signs her own 1 kg attestation" --private-key $K8 "$ISSUER" "mint($TUPLE,bytes)" \
  "($BANK,$MALLORY,$FAKECERT,1000000,999,2,$EXP)" "$FAKE"
try_send "Mallory relays Alice's attestation with user=Mallory" --private-key $K8 "$ISSUER" "mint($TUPLE,bytes)" \
  "($BANK,$MALLORY,$CERT,9950,995,1,$EXP)" "$SIG"
try_send "Mallory bumps the grams to 99.950 g" --private-key $K8 "$ISSUER" "mint($TUPLE,bytes)" \
  "($BANK,$ALICE,$CERT,99950,995,1,$EXP)" "$SIG"

hr "4. relayer submits; issuer verifies the bank signature and mints 9.950 vGOLD to Alice"
TX=$(send $K4 "$ISSUER" "mint($TUPLE,bytes)" "$ATT" "$SIG"); echo "mint tx $TX"
try_send "replay the same attestation" --private-key $K4 "$ISSUER" "mint($TUPLE,bytes)" "$ATT" "$SIG"
por

hr "5. Alice sends 4 vGOLD to Bob (plain ERC20; gold never leaves the bank)"
send $K1 "$TOKEN" 'transfer(address,uint256)' "$BOB" 4000000000000000000 >/dev/null
por

hr "6. Bob (not the depositor) burns 4 vGOLD into a redemption request at the bank"
send $K2 "$ISSUER" 'requestRedemption(bytes32,uint256,bytes32)' "$BANK" 4000 "$(cast keccak BRANCH-HYD-01)" >/dev/null
RID=$(call "$ISSUER" 'redemptionCount()(uint256)' | awk '{print $1}')
echo "redemption #$RID requested (event RedemptionRequested -> bank back office)"
por

hr "7. bank KYCs Bob, hands over 4 g, confirms release on chain"
try_send "Mallory fakes the bank's fulfilment" --private-key $K8 "$ISSUER" 'fulfilRedemption(uint256,bytes32)' "$RID" "$(cast keccak X)"
send $K5 "$ISSUER" 'fulfilRedemption(uint256,bytes32)' "$RID" "$(cast keccak RELEASE-77)" >/dev/null
echo "redemption #$RID fulfilled"
por

hr "8. bank signs a periodic reserve report (5.000 g held, owes 5.950 g) -> minting halts at that bank"
NOW=$(cast block latest --rpc-url "$RPC" --field timestamp)
RTYPE=$(cast keccak "ReserveReport(bytes32 bankId,uint256 reservesMilli,uint256 asOf,uint256 seq)")
DOM=$(call "$ISSUER" 'domainSeparator()(bytes32)')
report() { # reservesMilli seq
  local sh d
  sh=$(cast keccak "$(cast abi-encode 'f(bytes32,bytes32,uint256,uint256,uint256)' "$RTYPE" "$BANK" "$1" "$NOW" "$2")")
  d=$(cast keccak "$(cast concat-hex 0x1901 "$DOM" "$sh")")
  local s; s=$(cast wallet sign --no-hash --private-key $K3 "$d")
  send $K4 "$ISSUER" 'submitReserveReport((bytes32,uint256,uint256,uint256),bytes)' "($BANK,$1,$NOW,$2)" "$s" >/dev/null
}
report 5000 1
CERT2=$(cast keccak "MOCKBANK-GD-2026-000124")
SIG2=$(bank_sign $K3 "$BANK" "$ALICE" "$CERT2" 1000 995 3 "$EXP")
try_send "new mint while bank reports a shortfall" --private-key $K4 "$ISSUER" "mint($TUPLE,bytes)" "($BANK,$ALICE,$CERT2,1000,995,3,$EXP)" "$SIG2"
report 5950 2
echo "covering report (5.950 g) accepted; minting resumes"
send $K4 "$ISSUER" "mint($TUPLE,bytes)" "($BANK,$ALICE,$CERT2,1000,995,3,$EXP)" "$SIG2" >/dev/null
por

hr "9. dispute: bank flags certificate 000124 (assay error); minting pauses, balances untouched"
send $K5 "$ISSUER" 'disputeCertificate(bytes32,bytes32)' "$CERT2" "$(cast keccak ASSAY-ERROR)" >/dev/null
por
send $K0 "$ISSUER" 'clearDispute(bytes32)' "$CERT2" >/dev/null
send $K0 "$ISSUER" 'unpauseBank(bytes32)' "$BANK" >/dev/null
echo "governance re-checked custody: dispute cleared, bank unpaused"
por
hr "done"

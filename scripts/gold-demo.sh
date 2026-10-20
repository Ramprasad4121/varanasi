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
# confirms on chain. Bob never pays gas: he signs, a relayer submits through the
# ERC-2771 forwarder. Proof of reserve (grams and rupees) is printed after every step.
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
rs() { # paise -> Indian grouping, e.g. Rs 1,19,400.00
  python3 -c "
import sys
p=int(sys.argv[1]); r,ps=divmod(p,100); d=str(r)
h=d[-3:]; t=d[:-3]; g=[]
while t: g.insert(0,t[-2:]); t=t[:-2]
print('Rs '+(','.join(g+[h]) if g else h)+f'.{ps:02d}')" "$1"
}
mygold() { # holder -> "9.950 g (Rs 1,19,400.00)"
  local out; out=$(call "$ISSUER" 'myGold(address)(uint256,uint256,uint256)' "$1")
  printf '%s (%s)' "$(grams "$(echo "$out" | sed -n 1p | awk '{print $1}')")" "$(rs "$(echo "$out" | sed -n 2p | awk '{print $1}')")"
}
por() {
  local out; out=$(call "$ISSUER" 'proofOfReserve()(uint256,uint256,uint256,uint256,bool)')
  local s a p d b
  s=$(echo "$out" | sed -n 1p | awk '{print $1}'); a=$(echo "$out" | sed -n 2p | awk '{print $1}')
  p=$(echo "$out" | sed -n 3p | awk '{print $1}'); d=$(echo "$out" | sed -n 4p | awk '{print $1}')
  b=$(echo "$out" | sed -n 5p)
  printf '  proof of reserve | vGOLD supply %12s | bank-attested %12s | pending release %10s | disputed %8s | fully backed: %s\n' \
    "$(grams "$s")" "$(grams "$a")" "$(grams "$p")" "$(grams "$d")" "$b"
  printf '  my gold          | Alice %s | Bob %s\n' "$(mygold "$ALICE")" "$(mygold "$BOB")"
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
FWD=$(create $K0 lib/v4-core/lib/openzeppelin-contracts/contracts/metatx/ERC2771Forwarder.sol:ERC2771Forwarder "Varanasi Relayer")
TOKEN=$(create $K0 src/gold/GoldToken.sol:GoldToken "$FWD")
REG=$(create $K0 src/gold/GoldRegistry.sol:GoldRegistry)
ISSUER=$(create $K0 src/gold/BankGoldIssuer.sol:BankGoldIssuer "$GOV" "$TOKEN" "$REG" "$FWD")
FEED=$(create $K0 src/gold/MockGoldPriceFeed.sol:MockGoldPriceFeed "$GOV" 1200000) # Rs 12,000/g, illustrative
send $K0 "$ISSUER" 'setPriceFeed(address)' "$FEED" >/dev/null
send $K0 "$TOKEN" 'bindIssuer(address)' "$ISSUER" >/dev/null
send $K0 "$REG" 'bindIssuer(address)' "$ISSUER" >/dev/null
BANK=$(cast keccak "MOCK-BANK-HYD-01")
send $K0 "$ISSUER" 'addBank(bytes32,string,address,address)' "$BANK" "Mock Bank (gold deposit desk)" "$BANKSIG" "$BANKOPS" >/dev/null
echo "vGOLD          $TOKEN"
echo "GoldRegistry   $REG"
echo "BankGoldIssuer $ISSUER"
echo "Forwarder      $FWD (gasless relay)"
echo "Price feed     $FEED (display only: Rs 12,000.00 per gram, mock)"
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

hr "6. Bob (not the depositor, zero gas) signs a redemption for 4 g; a relayer submits it"
FTYPE=$(cast keccak "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)")
DTYPE=$(cast keccak "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
FDOM=$(cast keccak "$(cast abi-encode 'f(bytes32,bytes32,bytes32,uint256,address)' "$DTYPE" "$(cast keccak 'Varanasi Relayer')" "$(cast keccak 1)" 31337 "$FWD")")
gasless() { # signerKey target calldata -> relayer K4 executes
  local key=$1 to=$2 data=$3 from nonce dl sh d sig
  from=$(addr "$key"); nonce=$(call "$FWD" 'nonces(address)(uint256)' "$from" | awk '{print $1}')
  dl=$(( $(cast block latest --rpc-url "$RPC" --field timestamp) + 3600 ))
  sh=$(cast keccak "$(cast abi-encode 'f(bytes32,address,address,uint256,uint256,uint256,uint48,bytes32)' "$FTYPE" "$from" "$to" 0 300000 "$nonce" "$dl" "$(cast keccak "$data")")")
  d=$(cast keccak "$(cast concat-hex 0x1901 "$FDOM" "$sh")")
  sig=$(cast wallet sign --no-hash --private-key "$key" "$d")
  send $K4 "$FWD" 'execute((address,address,uint256,uint256,uint48,bytes,bytes))' "($from,$to,0,300000,$dl,$data,$sig)" >/dev/null
}
BOB_ETH_BEFORE=$(cast balance --rpc-url "$RPC" "$BOB")
gasless $K2 "$ISSUER" "$(cast calldata 'requestRedemption(bytes32,uint256,bytes32)' "$BANK" 4000 "$(cast keccak BRANCH-NLG-01)")"
RID=$(call "$ISSUER" 'redemptionCount()(uint256)' | awk '{print $1}')
[ "$(cast balance --rpc-url "$RPC" "$BOB")" = "$BOB_ETH_BEFORE" ] && echo "Bob paid 0 gas (relayer paid)"
echo "redemption #$RID requested for Bob (event RedemptionRequested -> bank back office)"
status() { call "$ISSUER" 'redemptions(uint256)(bytes32,address,uint256,bytes32,uint64,uint8)' "$1" | sed -n 6p | awk '{split("NONE PENDING FULFILLED CANCELLED",a," "); print a[$1+1]}'; }
echo "Bob's redemption status: $(status "$RID")"
por

hr "7. bank KYCs Bob, hands over 4 g, confirms release on chain"
try_send "Mallory fakes the bank's fulfilment" --private-key $K8 "$ISSUER" 'fulfilRedemption(uint256,bytes32)' "$RID" "$(cast keccak X)"
send $K5 "$ISSUER" 'fulfilRedemption(uint256,bytes32)' "$RID" "$(cast keccak RELEASE-77)" >/dev/null
echo "Bob's redemption status: $(status "$RID")"
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
hr "10. proof of reserve per bank, as an app would show it"
call "$ISSUER" "bankReserve(bytes32)((bytes32,string,uint256,uint256,uint256,uint256,bool,bool,uint256,uint256,uint256))" "$BANK" \
  | tr -d '()' | python3 -c "
import sys
f=[x.strip() for x in sys.stdin.read().split(',')]
g=lambda v: f'{int(v.split()[0])/1000:,.3f} g'
print('  bank            ', f[1].strip('\"'))
print('  gold held       ', g(f[2]))
print('  owed to holders ', g(f[3]))
print('  awaiting release', g(f[4]))
print('  under dispute   ', g(f[5]))
print('  fully backed    ', f[6])
print('  new deposits paused', f[7])
print('  last bank report', g(f[8]))
p=int(f[10].split()[0]); r,ps=divmod(p,100); d=str(r); h=d[-3:]; t=d[:-3]; grp=[]
while t: grp.insert(0,t[-2:]); t=t[:-2]
print('  value of gold held', 'Rs '+(','.join(grp+[h]) if grp else h)+f'.{ps:02d}', '(mock price)')
"
hr "done"

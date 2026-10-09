#!/usr/bin/env bash
# Varanasi on-chain chit fund: 5 member auction chit end to end on a LOCAL anvil chain.
# Nothing here touches a public network. All keys are anvil's well-known dev keys.
#
#   scripts/chit-demo.sh        # needs forge, anvil, cast (Foundry), python3, jq
#
# Story: a foreman creates a 5 member auction chit. Each member pays Rs 5,000 a month,
# so every pot is Rs 25,000. Foreman commission is capped at 5% of the pot (Rs 1,250),
# bids may discount at most 30%. Late fee 2%. One member (Asha) wins round 1, locks
# collateral, takes the full prize, then stops paying: her collateral is slashed every
# round she skips, and the group is still paid in full.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
PORT="${CHIT_DEMO_PORT:-18546}"
RPC="http://127.0.0.1:$PORT"
RUN="$ROOT/demo/.run"
mkdir -p "$RUN"

# anvil dev accounts (mnemonic "test test ... junk"); local only
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # foreman
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d # Asha (defaulter after winning)
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a # Bala
K3=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 # Chitra
K4=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a # Dev
K5=0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba # Esha
addr() { cast wallet address --private-key "$1"; }
FOREMAN=$(addr $K0)
NAMES=(Asha Bala Chitra Dev Esha)
KEYS=($K1 $K2 $K3 $K4 $K5)
ADDRS=()
for k in "${KEYS[@]}"; do ADDRS+=("$(addr "$k")"); done

hr() { printf '\n==== %s ====\n' "$*"; }
send() { local key=$1; shift; cast send --rpc-url "$RPC" --private-key "$key" "$@" --json >/dev/null; }
call() { cast call --rpc-url "$RPC" "$@" | awk 'NR==1{print $1}'; }
rs() { python3 -c "import sys; v=int(sys.argv[1]); print(f'{v/100:,.2f}')" "$1"; }
warp_to() { cast rpc --rpc-url "$RPC" evm_setNextBlockTimestamp "$1" >/dev/null; cast rpc --rpc-url "$RPC" evm_mine >/dev/null; }

ANVIL_PID=""
cleanup() { [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true; }
trap cleanup EXIT
anvil --port "$PORT" --silent >"$RUN/chit-anvil.log" 2>&1 &
ANVIL_PID=$!
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done

cd "$ROOT/contracts"
forge build --quiet
create() { local key=$1 id=$2; shift 2; forge create --rpc-url "$RPC" --private-key "$key" --broadcast --json "$id" --constructor-args "$@" | jq -r '.deployedTo'; }

hr "Deploy (local anvil)"
TOKEN=$(create $K0 src/MockERC20.sol:MockERC20 "INR Stable" "INRS" 2)
C=500000   # Rs 5,000.00 in paise
MEMBERS="[$(IFS=,; echo "${ADDRS[*]}")]"
# Params: token, contribution, mode=AUCTION(2), payWindow 3d, grace 2d, reveal 1d,
#         commission 500 bps, maxDiscount 3000 bps, lateFee 200 bps, forfeit 1000 bps,
#         revealBond 0, randomness none, vrfTimeout 0
PARAMS="($TOKEN,$C,2,259200,172800,86400,500,3000,200,1000,0,0x0000000000000000000000000000000000000000,0)"
FUND=$(create $K0 src/finance/chit/ChitFund.sol:ChitFund "$PARAMS" "$MEMBERS")
echo "token INRS (2 decimals): $TOKEN"
echo "ChitFund (foreman $FOREMAN): $FUND"
for i in 0 1 2 3 4; do
  send $K0 "$TOKEN" "mint(address,uint256)" "${ADDRS[$i]}" 10000000   # Rs 1,00,000 each
  send "${KEYS[$i]}" "$TOKEN" "approve(address,uint256)" "$FUND" "$(cast max-uint)"
  send "${KEYS[$i]}" "$FUND" "enroll()"
done
echo "all 5 members enrolled; round $(call "$FUND" 'round()(uint256)') open"

snapshot() {
  printf '%-8s %14s %12s %12s %10s %5s %8s\n' member wallet escrow credit liability won defaults
  for i in 0 1 2 3 4; do
    local a=${ADDRS[$i]}
    local st; st=$(cast call --rpc-url "$RPC" "$FUND" 'stateOf(address)(bool,bool,uint32,uint32,uint32,uint32)' "$a")
    local won; won=$(echo "$st" | sed -n 1p)
    local defs; defs=$(echo "$st" | sed -n 5p)
    printf '%-8s %14s %12s %12s %10s %5s %8s\n' "${NAMES[$i]}" \
      "$(rs "$(call "$TOKEN" 'balanceOf(address)(uint256)' "$a")")" \
      "$(rs "$(call "$FUND" 'escrow(address)(uint256)' "$a")")" \
      "$(rs "$(call "$FUND" 'credit(address)(uint256)' "$a")")" \
      "$(rs "$(call "$FUND" 'liability(address)(uint256)' "$a")")" "$won" "$defs"
  done
  local bal owed
  bal=$(call "$TOKEN" 'balanceOf(address)(uint256)' "$FUND")
  owed=$(call "$FUND" 'totalOwed()(uint256)')
  printf 'foreman commission credit: %s | fund balance: %s | fund owes: %s | %s\n' \
    "$(rs "$(call "$FUND" 'foremanCredit()(uint256)')")" "$(rs "$bal")" "$(rs "$owed")" \
    "$([ "$bal" = "$owed" ] && echo 'CONSERVED' || echo 'MISMATCH')"
  [ "$bal" = "$owed" ] || { echo "conservation broken"; exit 1; }
}

pay_all_but() { # skip index or -1
  for i in 0 1 2 3 4; do
    [ "$i" = "$1" ] && continue
    send "${KEYS[$i]}" "$FUND" "contribute()"
  done
}
commit_bid() { # idx bid
  local i=$1 bid=$2 r salt h
  r=$(call "$FUND" 'round()(uint256)')
  salt=$(cast keccak "salt-${NAMES[$i]}-$r")
  h=$(cast keccak "$(cast abi-encode 'f(address,uint256,address,uint256,bytes32)' "$FUND" "$r" "${ADDRS[$i]}" "$bid" "$salt")")
  send "${KEYS[$i]}" "$FUND" "commitBid(bytes32)" "$h"
  echo "$salt" >"$RUN/chit-salt-$i"
}
reveal_bid() { send "${KEYS[$1]}" "$FUND" "revealBid(uint256,bytes32)" "$2" "$(cat "$RUN/chit-salt-$1")"; }
to_reveal() { warp_to "$(call "$FUND" 'graceEnd()(uint256)')"; }
settle() {
  warp_to "$(call "$FUND" 'revealEnd()(uint256)')"
  local r; r=$(call "$FUND" 'round()(uint256)')
  send $K4 "$FUND" "settle()"   # anyone can settle; Dev pays the gas here
  local res; res=$(cast call --rpc-url "$RPC" "$FUND" 'result(uint256)((address,uint256,uint256,uint256,uint256,uint256))' "$r")
  python3 - "$res" "${ADDRS[*]}" "${NAMES[*]}" <<'PY'
import sys, re
raw, addrs, names = sys.argv[1], sys.argv[2].split(), sys.argv[3].split()
parts = [p.strip().split(' ')[0] for p in raw.strip('()').split(',')]
w = parts[0]
who = dict(zip([a.lower() for a in addrs], names)).get(w.lower(), 'nobody')
f = lambda v: f"{int(v)/100:,.2f}"
print(f"winner {who}: pot Rs {f(parts[1])}, prize Rs {f(parts[2])}, foreman Rs {f(parts[3])}, dividend Rs {f(parts[4])} each, dust {parts[5]} paise to winner")
PY
}

hr "Round 1: everyone pays; sealed bids Asha 22,000, Bala 23,000"
pay_all_but -1
commit_bid 0 2200000; commit_bid 1 2300000
to_reveal; reveal_bid 0 2200000; reveal_bid 1 2300000
settle
echo "Asha owes 4 more months (Rs 20,000): she locks that as collateral and takes the whole prize"
send $K1 "$FUND" "postCollateral(address,uint256)" "${ADDRS[0]}" 2000000
send $K1 "$FUND" "withdraw()"
snapshot

hr "Round 2: everyone pays (Chitra late, 2% fee joins the pot); bids Bala 22,500, Chitra 23,500"
for i in 0 1 3 4; do send "${KEYS[$i]}" "$FUND" "contribute()"; done
warp_to "$(call "$FUND" 'payDeadline()(uint256)')"
send $K3 "$FUND" "contribute()"
commit_bid 1 2250000; commit_bid 2 2350000
to_reveal; reveal_bid 1 2250000; reveal_bid 2 2350000
settle
echo "Bala posts no collateral: his prize stays held back and is released Rs 5,000 per month he pays"
snapshot

hr "Round 3: Asha (already won) stops paying; Dev bids 24,000"
pay_all_but 0
commit_bid 3 2400000
to_reveal; reveal_bid 3 2400000
settle
snapshot

hr "Round 4: Asha still not paying; nobody bids, first eligible (Chitra) takes the full pot"
pay_all_but 0
settle
snapshot

hr "Round 5: Asha still not paying; Esha is the last eligible member and takes the full pot"
pay_all_but 0
settle
snapshot

hr "Fund finished: everyone withdraws, foreman takes commission"
for i in 0 1 2 3 4; do
  a=${ADDRS[$i]}
  owed=$(( $(call "$FUND" 'credit(address)(uint256)' "$a") + $(call "$FUND" 'escrowFree(address)(uint256)' "$a") ))
  [ "$owed" -gt 0 ] && send "${KEYS[$i]}" "$FUND" "withdraw()"
done
send $K0 "$FUND" "withdrawCommission()"
printf '%-8s %14s %14s\n' member wallet "net vs start"
for i in 0 1 2 3 4; do
  b=$(call "$TOKEN" 'balanceOf(address)(uint256)' "${ADDRS[$i]}")
  printf '%-8s %14s %14s\n' "${NAMES[$i]}" "$(rs "$b")" "$(rs $((b - 10000000)))"
done
printf '%-8s %14s\n' Foreman "$(rs "$(call "$TOKEN" 'balanceOf(address)(uint256)' "$FOREMAN")")"
FB=$(call "$TOKEN" 'balanceOf(address)(uint256)' "$FUND")
echo "fund balance after all withdrawals: $(rs "$FB")"
[ "$FB" = "0" ] || { echo "FAIL: funds left in contract"; exit 1; }
echo "OK: 5 rounds, 5 different winners, defaulter slashed 3 times, group paid in full, nothing stuck"

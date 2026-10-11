#!/usr/bin/env bash
# Varanasi PoC-gated bounty vault: one-command end-to-end demo on a LOCAL anvil chain.
# Nothing here touches a public network. All keys are anvil's well-known dev keys.
#
#   scripts/demo.sh            # needs forge, anvil, cast (Foundry), python3, jq
#
# Story: a protocol funds a 10,000 mUSDC bounty vault and commits a solvency invariant for its
# (deliberately vulnerable) ReentrancyVault, tier payout 5,000 mUSDC, bond 50 mUSDC.
#   1. Bob submits an AI-slop "PoC" that breaks nothing           -> verifier FAIL, bond slashed
#   2. Mallory submits a PoC that fakes the break with vm.deal    -> verifier FAIL (policy), bond slashed
#   3. Alice submits a real reentrancy PoC pinned to a fork block -> verifier PASS, tier paid, bond back
#   4. Replay / flip attempts on settled jobs revert on-chain.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
# never route local RPC through an HTTP proxy
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
PORT="${DEMO_PORT:-18545}"
RPC="http://127.0.0.1:$PORT"
RUN="$ROOT/demo/.run"
mkdir -p "$RUN"

# anvil dev accounts (mnemonic "test test ... junk"); local only
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # protocol / sponsor / deployer
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d # Alice (real hunter)
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a # Bob (slop)
K3=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 # Varanasi verifier signer (test key)
K4=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a # relayer (anyone)
K5=0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba # depositor 1
K6=0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e # depositor 2
K7=0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356 # treasury
K8=0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97 # Mallory (forger)
addr() { cast wallet address --private-key "$1"; }
SPONSOR=$(addr $K0); ALICE=$(addr $K1); BOB=$(addr $K2); SIGNER=$(addr $K3)
TREASURY=$(addr $K7); MALLORY=$(addr $K8)

hr() { printf '\n==== %s ====\n' "$*"; }
send() { local key=$1; shift; cast send --rpc-url "$RPC" --private-key "$key" "$@" --json | jq -r '.transactionHash'; }
create() { # key path:Name [ctor args...]
  local key=$1 id=$2; shift 2
  local args=()
  [ $# -gt 0 ] && args=(--constructor-args "$@")
  forge create --rpc-url "$RPC" --private-key "$key" --broadcast --json "$id" "${args[@]}" | jq -r '.deployedTo'
}
hexof() { printf '0x%s' "$(od -An -v -tx1 "$1" | tr -d ' \n')"; }
usd() { python3 -c "import sys; v=int(sys.argv[1]); print(f'{v/1e6:,.2f}')" "$1"; }
bal() { cast call --rpc-url "$RPC" "$USDC" "balanceOf(address)(uint256)" "$1" | awk '{print $1}'; }
eth() { cast balance --rpc-url "$RPC" --ether "$1"; }
snapshot() {
  printf '%-32s %16s\n' "account" "mUSDC"
  for pair in "Sponsor wallet (protocol):$SPONSOR" "Alice (real PoC):$ALICE" "Bob (slop PoC):$BOB" "Mallory (forged PoC):$MALLORY" \
              "Treasury (1% fee):$TREASURY" "BountyVault:$VAULT" "AgenticCommerce escrow:$ACP"; do
    printf '%-32s %16s\n' "${pair%%:*}" "$(usd "$(bal "${pair##*:}")")"
  done
  printf '%-32s %16s\n' "Vault pot available" "$(usd "$(cast call --rpc-url "$RPC" "$VAULT" 'bountyInfo(uint256)(address,address,uint64,uint64,uint256,uint256,uint256,uint256)' 1 | sed -n 6p | awk '{print $1}')")"
  printf '%-32s %16s\n' "Alice withdrawable bond credit" "$(usd "$(cast call --rpc-url "$RPC" "$VAULT" 'credit(address)(uint256)' "$ALICE" | awk '{print $1}')")"
  printf '%-32s %12s ETH\n' "ReentrancyVault (live chain)" "$(eth "$TARGET")"
}

hr "0. local anvil chain on $RPC"
if ! python3 -c "import socket,sys; s=socket.socket(); s.bind(('127.0.0.1', int(sys.argv[1])))" "$PORT" 2>/dev/null; then
  echo "port $PORT busy; set DEMO_PORT"; exit 1
fi
anvil --port "$PORT" --silent --chain-id 31337 >"$RUN/anvil.log" 2>&1 &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for _ in $(seq 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
echo "chain-id $(cast chain-id --rpc-url "$RPC"), block $(cast block-number --rpc-url "$RPC")"

hr "1. build"
(cd "$ROOT/contracts" && forge build --skip test --skip script >/dev/null 2>&1) && echo "contracts/ built"
(cd "$ROOT/demo" && forge build >/dev/null 2>&1) && echo "demo/ built"

hr "2. deploy Varanasi stack (ERC-8183 AgenticCommerce + RiskGuardEvaluator + BountyVault)"
cd "$ROOT/contracts"
USDC=$(create $K0 src/MockERC20.sol:MockERC20 "Mock USDC" mUSDC 6)
ACP=$(create $K0 src/AgenticCommerce.sol:AgenticCommerce "$USDC" "$TREASURY" 100)
EVAL=$(create $K0 src/RiskGuardEvaluator.sol:RiskGuardEvaluator "$ACP" "$SPONSOR" "[$SIGNER]")
VAULT=$(create $K0 src/BountyVault.sol:BountyVault "$ACP" "$EVAL")
echo "mUSDC              $USDC"
echo "AgenticCommerce    $ACP   (platform fee 1% -> treasury $TREASURY)"
echo "RiskGuardEvaluator $EVAL   (allowlisted signer $SIGNER)"
echo "BountyVault        $VAULT"

hr "3. protocol deploys its (vulnerable) ReentrancyVault; users deposit 10 ETH"
cd "$ROOT/demo"
TARGET=$(create $K0 src/ReentrancyVault.sol:ReentrancyVault)
send $K5 "$TARGET" "deposit()" --value 6ether >/dev/null
send $K6 "$TARGET" "deposit()" --value 4ether >/dev/null
echo "ReentrancyVault $TARGET holds $(eth "$TARGET") ETH from 2 depositors"

hr "4. protocol funds the bounty vault and commits the invariant + payout tier"
INV_FILE="$ROOT/demo/invariants/SolvencyInvariant.sol"
INV_HASH=$(hexof "$INV_FILE" | cast keccak)
send $K0 "$USDC" "mint(address,uint256)" "$SPONSOR" 10000000000 >/dev/null
for k in $K1 $K2 $K8; do send $K0 "$USDC" "mint(address,uint256)" "$(addr $k)" 100000000 >/dev/null; done
for k in $K0 $K1 $K2 $K8; do send $k "$USDC" "approve(address,uint256)" "$VAULT" "$(cast max-uint)" >/dev/null; done
DEADLINE=$(( $(cast block --rpc-url "$RPC" latest -f timestamp) + 30*86400 ))
send $K0 "$VAULT" "createBounty(address,uint256,uint256,uint64,uint64,bytes32[],uint256[])" \
  "$TARGET" 10000000000 50000000 "$DEADLINE" 86400 "[$INV_HASH]" "[5000000000]" >/dev/null
echo "bounty #1: pot 10,000 mUSDC (moved from sponsor wallet into the vault) | tier 0 'solvency' payout 5,000 mUSDC"
echo "           bond 50 mUSDC per claim | claim window 1 day | hunters were minted 100 mUSDC each"
echo "committed invariant = keccak256(demo/invariants/SolvencyInvariant.sol) = $INV_HASH"

hr "BALANCES BEFORE"
snapshot | tee "$RUN/before.txt"

claim() { # key pocfile -> prints "jobId forkBlock deliverable"
  local key=$1 poc=$2
  local fb; fb=$(cast block-number --rpc-url "$RPC")
  send "$key" "$VAULT" "openClaim(uint256,uint256,uint64)" 1 0 "$fb" >/dev/null
  local job; job=$(cast call --rpc-url "$RPC" "$ACP" "jobCount()(uint256)")
  local h; h=$(hexof "$poc" | cast keccak)
  send "$key" "$ACP" "submit(uint256,bytes32,bytes)" "$job" "$h" 0x >/dev/null
  echo "$job $fb $h"
}
verify() { # job pocfile label
  python3 "$ROOT/verifier/varanasi_verifier.py" --rpc "$RPC" --commerce "$ACP" --evaluator "$EVAL" \
    --job "$1" --poc "$2" --invariant "$INV_FILE" --key "$K3" --relayer-key "$K4" \
    --out "$RUN/verdict-$3.json" --settle 2>&1 | sed 's/^/    /'
}
status() {
  cast call --rpc-url "$RPC" "$ACP" "getJob(uint256)((address,address,address,address,uint256,uint256,uint8,bytes32,string))" "$1" \
    | python3 -c "import sys,re; s=sys.stdin.read(); st=int(re.findall(r', (\d+), 0x[0-9a-f]{64}', s)[0]); print(['Open','Funded','Submitted','Completed','Rejected','Expired'][st])"
}

hr "5. Bob (slop): posts 50 mUSDC bond, submits a PoC that breaks nothing"
read -r JOB_B FB_B H_B < <(claim $K2 "$ROOT/demo/pocs/BogusExploit.sol")
echo "job $JOB_B  forkBlock $FB_B  deliverable $H_B"
verify "$JOB_B" "$ROOT/demo/pocs/BogusExploit.sol" bob
echo "job $JOB_B status: $(status "$JOB_B")"

hr "6. Mallory (forger): PoC fakes the drain with a Foundry cheatcode (vm.deal)"
read -r JOB_M FB_M H_M < <(claim $K8 "$ROOT/demo/pocs/CheatcodeExploit.sol")
echo "job $JOB_M  forkBlock $FB_M  deliverable $H_M"
echo "-- first, a dry run with the static policy switched OFF (nothing signed) to show the sandbox alone defeats it:"
python3 "$ROOT/verifier/varanasi_verifier.py" --rpc "$RPC" --commerce "$ACP" --evaluator "$EVAL" --job "$JOB_M" \
  --poc "$ROOT/demo/pocs/CheatcodeExploit.sol" --invariant "$INV_FILE" --dry-run --skip-policy 2>&1 | grep '^\[verifier\]' | sed 's/^/    /' || true
echo "-- real run (policy on), signed and settled:"
verify "$JOB_M" "$ROOT/demo/pocs/CheatcodeExploit.sol" mallory
echo "job $JOB_M status: $(status "$JOB_M")"

hr "7. Alice: real reentrancy PoC pinned to the current block"
read -r JOB_A FB_A H_A < <(claim $K1 "$ROOT/demo/pocs/ReentrancyExploit.sol")
echo "job $JOB_A  forkBlock $FB_A  deliverable $H_A"
verify "$JOB_A" "$ROOT/demo/pocs/ReentrancyExploit.sol" alice
echo "job $JOB_A status: $(status "$JOB_A")"
send $K1 "$VAULT" "withdrawCredit()" >/dev/null && echo "Alice withdrew her 50 mUSDC bond credit"

hr "8. attacks on settlement (each must revert)"
SIG_A=$(jq -r .signature "$RUN/verdict-alice.json"); LOGS_A=$(jq -r .logsHash "$RUN/verdict-alice.json")
try() { if cast send --rpc-url "$RPC" --private-key $K4 "$@" >/dev/null 2>&1; then echo "UNEXPECTED SUCCESS"; exit 1; else echo "reverted (good)"; fi; }
printf '%-62s' "replay Alice's PASS verdict on her settled job:";      try "$EVAL" "settle(uint256,bytes32,bool,bytes32,bytes)" "$JOB_A" "$H_A" true "$LOGS_A" "$SIG_A"
printf '%-62s' "reuse Alice's PASS signature to flip Bob's FAIL job:"; try "$EVAL" "settle(uint256,bytes32,bool,bytes32,bytes)" "$JOB_B" "$H_B" true "$LOGS_A" "$SIG_A"
printf '%-62s' "relayer calls AgenticCommerce.complete directly:";     try "$ACP" "complete(uint256,bytes32,bytes)" "$JOB_B" "0x$(printf '%064d' 0)" 0x
printf '%-62s' "anyone opens a new claim on the already-paid tier:";   try "$VAULT" "openClaim(uint256,uint256,uint64)" 1 0 1

hr "BALANCES AFTER"
snapshot | tee "$RUN/after.txt"

hr "verdicts"
for who in bob mallory alice; do
  jq -c '{jobId, pass, reason, deliverableHash, logsHash, signer, settleTx}' "$RUN/verdict-$who.json"
done
echo
echo "Note: the live ReentrancyVault still holds its 10 ETH. The exploit ran only on the verifier's"
echo "throwaway fork at the pinned block; the bounty paid on proof without anyone draining production."

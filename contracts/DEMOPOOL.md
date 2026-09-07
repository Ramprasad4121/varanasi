# DemoPool — live hook-revert showtime (Sepolia)

Live wiring (verified on Sepolia TODAY):

| Role             | Address                                      |
| ---------------- | -------------------------------------------- |
| AegisHook        | `0xf3710a05cbb61eb8b1a73886eb68a341f69d0080` |
| PoolManager      | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| PositionManager  | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` |
| V4Quoter         | `0x61b3f2011a92d183c7dbadbda940a7555ccf9227` |
| Permit2          | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Deployer (owner) | `0x1c686ac3aEF0E5534d772E840bBf20dfF30797a8` |

Hook policy: beforeSwap-only, `owner` = deployer, `defaultMax` = 5000 bps.
Attested agent = deployer (risk score 200, fresh). Stranger = any address with
no `*.aegis.eth` identity (e.g. `0x000000000000000000000000000000000000dEaD`).

Contracts in this demo (new files only; existing files untouched):

- `src/MockERC20.sol` — mintable OZ ERC20 (demo funding only).
- `script/DemoPool.s.sol` — ONE script: deploy 2 mocks, mint sender,
  sort currency0 < currency1, `initialize` (fee 3000, tickSpacing 60,
  hooks = hook, sqrtPrice 1:1), Permit2 approvals, PositionManager
  mint liquidity over -600/+600.
- `test/DemoPool.t.sol` — fork-free unit tests + opt-in Sepolia fork check.

## 0. Env + prechecks (read-only)

```sh
cd contracts
export ADDR=0x1c686ac3aEF0E5534d772E840bBf20dfF30797a8   # deployer / attested agent
export STRANGER=0x000000000000000000000000000000000000dEaD
export UNIVERSAL_ROUTER=0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b  # Uniswap v4 docs, Sepolia
for a in 0xf3710a05cbb61eb8b1a73886eb68a341f69d0080 \
         0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 \
         0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4 \
         0x61b3f2011a92d183c7dbadbda940a7555ccf9227 \
         $UNIVERSAL_ROUTER; do
  cast code "$a" --rpc-url "$SEPOLIA_RPC_URL" | grep -q . || echo "MISSING CODE: $a"
done
```

## 1. Broadcast — create the demo pool

```sh
forge script script/DemoPool.s.sol --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$SEPOLIA_PRIVATE_KEY" --sender "$ADDR" --broadcast
```

From the output logs, export (sortedby script, currency0 < currency1):

```sh
export TOKEN0=<currency0 from logs> TOKEN1=<currency1 from logs>
```

## 2. Stranger quoter `eth_call` — expect `UnauthorizedAgent`

Zero-for-one quote of 0.001 ether, sent FROM the stranger (no identity):

```sh
QDATA=$(cast calldata \
  "quoteExactInputSingle((address,address,uint24,int24,address),bool,uint128,bytes)" \
  "($TOKEN0,$TOKEN1,3000,60,0xf3710a05cbb61eb8b1a73886eb68a341f69d0080)" \
  true 1000000000000000 0x)
cast call 0x61b3f2011a92d183c7dbadbda940a7555ccf9227 "$QDATA" \
  --from "$STRANGER" --rpc-url "$SEPOLIA_RPC_URL"
```

Expect a revert whose data starts with `0x69fb6204`
(`UnauthorizedAgent(address)` selector) followed by the stranger address —
the hook rejects the swap before any price is returned.

Control — same call FROM the attested deployer must NOT revert with
`UnauthorizedAgent` (it returns quoter revert-data with the quote instead):

```sh
cast call 0x61b3f2011a92d183c7dbadbda940a7555ccf9227 "$QDATA" \
  --from "$ADDR" --rpc-url "$SEPOLIA_RPC_URL"
```

## 3. Attested swap via Universal Router (deployer, score 200 ≤ 5000 cap)

Approve the router through Permit2 once (input token = `$TOKEN0`):

```sh
cast send "$TOKEN0" "approve(address,uint256)" \
  0x000000000022D473030F116dDEE9F6B43aC78BA3 \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --private-key "$SEPOLIA_PRIVATE_KEY" --rpc-url "$SEPOLIA_RPC_URL"
cast send 0x000000000022D473030F116dDEE9F6B43aC78BA3 \
  "approve(address,address,uint160,uint48)" \
  "$TOKEN0" "$UNIVERSAL_ROUTER" 340282366920938463463374607431768211455 4294967295 \
  --private-key "$SEPOLIA_PRIVATE_KEY" --rpc-url "$SEPOLIA_RPC_URL"
```

Build the V4 exact-in-single (`V4_SWAP = 0x10`,
actions `0x06`=SWAP_EXACT_IN_SINGLE, `0x0c`=SETTLE_ALL, `0x0f`=TAKE_ALL):

```sh
AMOUNT_IN=1000000000000000
DEADLINE=$(($(date +%s) + 3600))
SWAP=$(cast calldata \
  "ExactInputSingleParams((address,address,uint24,int24,address),bool,uint128,uint128,uint256,bytes)" \
  "($TOKEN0,$TOKEN1,3000,60,0xf3710a05cbb61eb8b1a73886eb68a341f69d0080)" \
  true $AMOUNT_IN 0 0 0x)
SETTLE=$(cast calldata "(address,uint256)" "$TOKEN0" "$AMOUNT_IN")
TAKE=$(cast calldata "(address,uint256)" "$TOKEN1" 0)
INNER=$(cast calldata "(bytes,bytes[])" "0x060c0f" "[$SWAP,$SETTLE,$TAKE]")
cast send "$UNIVERSAL_ROUTER" "execute(bytes,bytes[],uint256)" \
  "0x10" "[$INNER]" "$DEADLINE" \
  --private-key "$SEPOLIA_PRIVATE_KEY" --rpc-url "$SEPOLIA_RPC_URL"
```

The swap lands: `tx.origin` is the attested deployer, score 200 ≤ cap 5000.
Repeating step 3 `--from` a stranger (or via a stranger-signed tx) reverts
with `UnauthorizedAgent` — the live hook-revert moment.

## Notes

- Never print or paste `$SEPOLIA_PRIVATE_KEY`; the commands above only
  reference it by name.
- If step 0 reports missing code at `$UNIVERSAL_ROUTER`, resolve the current
  address from the official v4 deployments page before showtime; steps 1–2
  do not depend on the router.

// Demo terms shared by both back ends. MOCK numbers for the demo, not an offer.
export const LOAN = {
  ltvBps: 7500, // bank lends up to 75% of today's demo gold value
  rateBps: 222, // 2.22% for the 90 day term, about 9% a year (simple interest, by the day)
  yearlyRatePct: 9,
  termSeconds: 90 * 86400,
  minPaise: 100_000n, // Rs 1,000
};

/** Most the bank lends against `milli` mg of fine gold at `pricePaisePerGram`, rounded down to Rs 100. */
export function maxLoanPaise(milli: number, pricePaisePerGram: bigint | string): bigint {
  const value = (BigInt(milli) * BigInt(pricePaisePerGram)) / 1000n;
  const max = (value * BigInt(LOAN.ltvBps)) / 10000n;
  return (max / 10000n) * 10000n;
}

export const DEMO_PRICE_PAISE_PER_GRAM = 1_200_000n; // Rs 12,000 a gram, MOCK display price
export const BANK_CAP_MILLI = 1_000_000; // mock bank may hold at most 1,000 g for the app (per-bank cap)

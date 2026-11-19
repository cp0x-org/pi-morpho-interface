// Run with `pnpm test`. The module is transpiled with the project's TypeScript, so any Node from 18 on runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/repay.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const { planMaxRepay, maxRepayPlanStands } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const usdc = (amount) => BigInt(Math.round(amount * 1e6));
const SHARES = 17_981_514_839_364_738n;
const inputs = (debtAssets, debtFloor, walletBalance, borrowShares = SHARES) => ({ debtAssets, debtFloor, borrowShares, walletBalance });
const grow = (amount, bps) => amount + (amount * bps) / 10_000n;

/** The check the Repay button waits for, right after `approve(plan.approveAmount)` lands. */
const passesCheckAfterApprove = (plan) => plan.approveAmount >= plan.requiredAllowance;

test('wallet holds what was borrowed, the debt has grown past it: repays the wallet, one approval unlocks Repay', () => {
  const plan = planMaxRepay(inputs(usdc(20_000.001874), usdc(20_000.0015), usdc(20_000)));

  assert.equal(plan.shares, 0n);
  assert.equal(plan.assets, usdc(20_000));
  assert.equal(plan.approveAmount, usdc(20_000));
  assert.ok(passesCheckAfterApprove(plan));
});

test('wallet covers the debt but not 0.1 % above it: closes by shares, one approval unlocks Repay', () => {
  const plan = planMaxRepay(inputs(usdc(20_000), usdc(19_999.99), usdc(20_005)));

  assert.equal(plan.shares, SHARES);
  assert.equal(plan.assets, 0n);
  assert.ok(passesCheckAfterApprove(plan));
});

test('wallet covers the debt but not the headroom: repays the floor, never the whole wallet', () => {
  // Fork run: repaying the debt accrued to the page clock as assets reverted, the block was timestamped 5 s earlier.
  const floor = usdc(20_000.001);
  const plan = planMaxRepay(inputs(usdc(20_000.001801), floor, usdc(20_001)));

  assert.equal(plan.shares, 0n);
  assert.equal(plan.assets, floor);
  // Approves exactly what it repays: no allowance is left behind for tokens that need a reset to 0 first (USDT).
  assert.equal(plan.approveAmount, floor);
});

test('debt of one base unit: closes by shares instead of sending an empty repay', () => {
  const plan = planMaxRepay(inputs(1n, 0n, 1n, 1_000_000n));

  assert.equal(plan.shares, 1_000_000n);
  assert.equal(plan.assets, 0n);
  assert.ok(passesCheckAfterApprove(plan));
});

test('no loan: nothing to send or approve', () => {
  assert.deepEqual(planMaxRepay(inputs(0n, 0n, usdc(100), 0n)), { assets: 0n, shares: 0n, approveAmount: 0n, requiredAllowance: 0n });
});

test('a repay of assets stands while the market moves on, not once the wallet or the floor drops below it', () => {
  const plan = planMaxRepay(inputs(usdc(20_000.0018), usdc(20_000.0015), usdc(20_000)));

  // Someone touches the market: the debt and the floor go up, the plan the field shows can still be sent as it is.
  assert.ok(maxRepayPlanStands(plan, inputs(usdc(20_000.0025), usdc(20_000.0024), usdc(20_000))));
  // The wallet sent some of it elsewhere.
  assert.ok(!maxRepayPlanStands(plan, inputs(usdc(20_000.0025), usdc(20_000.0024), usdc(19_000))));
  // Part of the loan was repaid elsewhere: the floor is now below the planned assets.
  assert.ok(!maxRepayPlanStands(plan, inputs(usdc(5_000.0003), usdc(5_000.0002), usdc(20_000))));
});

test('a repay by shares stands while the wallet and its approval still cover the debt', () => {
  const debt = usdc(20_000);
  const plan = planMaxRepay(inputs(debt, debt - 100n, usdc(20_005)));

  assert.ok(maxRepayPlanStands(plan, inputs(grow(debt, 1n), debt, usdc(20_005))));
  // The wallet no longer covers the debt with headroom.
  assert.ok(!maxRepayPlanStands(plan, inputs(debt, debt - 100n, usdc(20_000))));
  // The tab stayed open for days: the debt outgrew the 0.1 % the approval was made with.
  assert.ok(!maxRepayPlanStands(plan, inputs(grow(debt, 10n), debt, usdc(20_100))));
  // Another borrow on the same position since: different shares.
  assert.ok(!maxRepayPlanStands(plan, inputs(debt, debt - 100n, usdc(20_005), SHARES + 1n)));
});

test('any debt, floor and wallet: the plan is self-consistent and stands as the market moves on', () => {
  let seed = 7n;
  const next = (limit) => {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
    return seed % limit;
  };
  for (let i = 0; i < 20_000; i++) {
    const debt = 1n + next(10n ** 15n);
    const cut = next(debt / 1_000n + 2n);
    const floor = debt > cut ? debt - cut : 0n;
    const wallet = i % 3 === 0 ? debt + next(debt / 500n + 2n) - next(debt / 500n + 2n) : next(2n * debt + 2n);
    const now = inputs(debt, floor, wallet);
    const plan = planMaxRepay(now);
    const where = `debt ${debt}, floor ${floor}, wallet ${wallet}`;

    assert.ok(passesCheckAfterApprove(plan), where);
    if (plan.shares > 0n) {
      // Morpho pulls about `debt` from the wallet: the wallet and the approval cover it.
      assert.ok(wallet >= debt && plan.requiredAllowance >= debt, where);
    } else {
      // Never more assets than the debt can be when the repay lands, never more than the wallet.
      assert.ok(plan.assets <= floor && plan.assets <= wallet, where);
      assert.equal(plan.approveAmount, plan.assets, where);
    }
    // An empty repay only when the wallet cannot cover even the debt.
    if (plan.shares === 0n && plan.assets === 0n) assert.ok(wallet < debt, where);
    else assert.ok(maxRepayPlanStands(plan, now), `a fresh plan stands, ${where}`);

    // Interest accrues and someone touches the market (the floor moves up, at most to the debt): a repay of assets still
    // stands as it is.
    const debtLater = grow(debt, next(9n));
    const floorLater = floor + next(debtLater - floor + 1n);
    if (plan.assets > 0n)
      assert.ok(maxRepayPlanStands(plan, inputs(debtLater, floorLater, wallet)), `${where}, later ${debtLater}/${floorLater}`);
  }
});

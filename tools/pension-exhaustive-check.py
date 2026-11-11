#!/usr/bin/env python3
"""Exhaustive, integer-exact verification of the pension720 joint payout law.

Unlike tools/pension-independent-check.py (closed-form spot checks), this script visits every one of the
1,000,000 six-digit main numbers x 5 groups and applies the conditional bonus law directly:

  * main (group, number) uniform over 5,000,000 outcomes;
  * raw bonus uniform over 1,000,000 numbers; when it equals the main six digits the ones digit is redrawn
    uniformly among the nine other digits (official rule; uniformity of the redraw is the model assumption);
  * one ticket collects only its highest GRADE (official rule): the bonus replaces a 3rd-7th grade prize
    whatever the discounted amounts are, and a prize valued at zero still counts as winning.

Probabilities are integers in units of 1/(5,000,000 x 9,000,000). With nominal prizes the expectation and
variance are exact fractions. The same outcome table is then revalued with discounted, taxed annuities and
compared with scripts/pension720.mjs through Node.js (skipped with a notice when node is unavailable).

Standard library only.  Usage: python tools/pension-exhaustive-check.py [--no-node]
"""
from collections import defaultdict
from fractions import Fraction
import json, os, shutil, subprocess, sys

UNIT = 5_000_000 * 9_000_000
GRADE_CASH = {3: 1_000_000, 4: 100_000, 5: 50_000, 6: 5_000, 7: 1_000}
B = 32                                   # outcome code base: per-prize ticket counts are <= 20
CODE = {g: B ** (g - 1) for g in range(1, 8)}
BONUS = B ** 7


def enumerate_law(tickets):
    """Return {outcome_code: integer units}; outcome_code packs the number of tickets on each prize."""
    nums = [int(n) for _, n in tickets]
    groups = [g for g, _ in tickets]
    assert len(set(tickets)) == len(tickets) and 1 <= len(tickets) <= 20
    assert all(1 <= g <= 5 and len(n) == 6 and n.isdigit() for g, n in tickets)
    uniq = sorted(set(nums))
    owners = {n: [i for i, x in enumerate(nums) if x == n] for n in uniq}
    by_last = defaultdict(list)
    for i, n in enumerate(nums):
        by_last[n % 10].append(i)
    first5 = {n // 10 for n in uniq}
    law = defaultdict(int)
    plain = 0                            # main numbers touching no ticket suffix and no redraw case
    for m in range(1_000_000):
        candidates = by_last.get(m % 10)
        if candidates is None and (m // 10) not in first5:
            plain += 1
            continue
        length = {}
        for i in candidates or ():
            n, k = nums[i], 1
            while k < 6 and n % 10 ** (k + 1) == m % 10 ** (k + 1):
                k += 1
            length[i] = k
        full = any(k == 6 for k in length.values())
        for group in (range(1, 6) if full else (0,)):
            weight = 1 if full else 5
            code = {i: (CODE[1] if groups[i] == group else CODE[2]) if k == 6 else CODE[8 - k]
                    for i, k in length.items()}
            base = sum(code.values())
            used = 0
            for n in uniq:
                if n == m:
                    continue
                p = 10 if n // 10 == m // 10 else 9
                # highest prize only: a 3rd-7th grade ticket hit by the bonus is paid the bonus instead
                value = base + sum(BONUS - code.get(i, 0) for i in owners[n])
                law[value] += weight * p
                used += p
            law[base] += weight * (9_000_000 - used)
    # main numbers unrelated to every ticket: only the bonus can pay, group is irrelevant
    used = 0
    for n in uniq:
        law[BONUS * len(owners[n])] += plain * 5 * 9
        used += 9
    law[0] += plain * 5 * (9_000_000 - used)
    assert sum(law.values()) == UNIT, 'probability mass is not exactly one'
    return dict(law)


def counts(code):
    out = []
    for _ in range(8):
        out.append(code % B)
        code //= B
    return out                           # [n1, n2, n3, n4, n5, n6, n7, nBonus]


def annuity(monthly, months, annual, tax, delay=0):
    r = (1 + annual) ** (1 / 12) - 1
    factor = months if r == 0 else sum((1 + r) ** -(k + delay) for k in range(1, months + 1))  # explicit sum
    return monthly * (1 - tax) * factor


def value(code, annual=None, tax=None, delay=0):
    c = counts(code)
    cash = sum(c[g - 1] * GRADE_CASH[g] for g in range(3, 8))
    if annual is None:                   # nominal, exact integers
        return c[0] * 7_000_000 * 240 + (c[1] + c[7]) * 1_000_000 * 120 + cash
    return (c[0] * annuity(7_000_000, 240, annual, tax, delay)
            + (c[1] + c[7]) * annuity(1_000_000, 120, annual, tax, delay) + cash)


def summarise(law, cost, annual=None, tax=None, delay=0):
    dist = defaultdict(int)
    for code, units in law.items():
        dist[value(code, annual, tax, delay)] += units
    if annual is None:
        mean = sum(Fraction(v * u, UNIT) for v, u in dist.items())
        var = sum(Fraction(v * v * u, UNIT) for v, u in dist.items()) - mean * mean
    else:
        mean = sum(v * u for v, u in dist.items()) / UNIT
        var = sum((v - mean) ** 2 * u for v, u in dist.items()) / UNIT
    return {'mean': mean, 'var': var,
            'any': Fraction(UNIT - law.get(0, 0), UNIT),          # holding any prize, independent of valuation
            'recover': Fraction(sum(u for v, u in dist.items() if v >= cost), UNIT),
            'dist': sorted(dist.items())}


def js_reference(tickets, annual, tax, delay):
    script = ("import {exactDistribution} from './scripts/pension720.mjs';"
              "const [t,o]=JSON.parse(process.argv[1]);const d=exactDistribution(t,o);"
              "console.log(JSON.stringify({e:d.expectation,v:d.variance,any:d.probabilityAny,rec:d.probabilityRecover,dist:d.distribution}));")
    payload = json.dumps([[{'group': g, 'number': n} for g, n in tickets], {'annualDiscount': annual, 'taxRate': tax, 'delayMonths': delay}])
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = subprocess.run(['node', '--input-type=module', '-e', script, payload], cwd=root,
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def cdf_gap(a, b):
    """Largest difference between two discrete CDFs; amounts within 1e-6 relative are treated as equal."""
    points = sorted([(v, p, 0) for v, p in a] + [(v, p, 1) for v, p in b])
    acc, worst, i = [0.0, 0.0], 0.0, 0
    while i < len(points):
        j = i
        while j < len(points) and points[j][0] - points[i][0] <= 1e-6 * max(1.0, abs(points[i][0])):
            acc[points[j][2]] += points[j][1]
            j += 1
        worst = max(worst, abs(acc[0] - acc[1]))
        i = j
    return worst


PORTFOLIOS = {
    'single': [(3, '012345')],
    'spread-5 (distinct last digits)': [(1, '160460'), (3, '125417'), (4, '507944'), (3, '069333'), (1, '284681')],
    'focus-5 (one number, five groups)': [(g, '777777') for g in range(1, 6)],
    'adversarial (shared suffixes, redraw neighbours)': [(1, '123456'), (2, '123456'), (1, '123457'), (5, '023456'),
                                                         (4, '999956'), (4, '123450'), (3, '000000')],
    'same-ending-8 (cost recovery layout)': [((i % 5) + 1, f'{(i * 104729 + 7) % 100000:05d}3') for i in range(8)],
    'spread-20 (all last-two digits distinct)': [((i % 5) + 1, f'{(i * 7919 + 13) % 10000:04d}{i // 10}{i % 10}')
                                                 for i in range(20)],
}


# (annual discount, tax, extra delay in months). The last two are valuation extremes: annuities worth nothing,
# and a bonus annuity worth less than the 3rd prize.
SCENARIOS = ((0.0, 0.0, 0), (0.03, 0.22, 0), (0.07, 0.33, 0), (0.03, 1.0, 0), (1.0, 0.22, 60))


def main():
    use_node = '--no-node' not in sys.argv and shutil.which('node') is not None
    if not use_node:
        print('NOTICE: node not used; JavaScript cross-check skipped (closed-form and exactness checks still run).')
    worst = 0.0
    for name, tickets in PORTFOLIOS.items():
        law = enumerate_law(tickets)
        n, cost = len(tickets), 1000 * len(tickets)
        nominal = summarise(law, cost)
        # Linearity: every ticket is worth 750 won minus the bonus / 3rd-7th grade overlap, whatever the layout.
        assert nominal['mean'] == n * (Fraction(750) - Fraction(198, 1_000_000)), name
        last_digits = len({t[1][-1] for t in tickets})
        assert nominal['any'] >= Fraction(last_digits, 10), name
        if name.startswith('single'):
            assert nominal['any'] == Fraction(1, 10) + Fraction(9, 10 ** 7) + Fraction(1, 10 ** 12)
        if name.startswith('focus-5'):
            assert nominal['any'] == Fraction(1, 10) + Fraction(9, 10 ** 7) + Fraction(1, 10 ** 12)
        if name.startswith('spread-5'):
            assert nominal['any'] == Fraction(1, 2) + Fraction(25, 10 ** 7) + Fraction(25, 9 * 10 ** 12)
        print(f'{name}: {n} tickets, {len(law)} outcome classes')
        print(f'  nominal E = {nominal["mean"]} = {float(nominal["mean"]):.6f} won, SD = {float(nominal["var"]) ** .5:,.0f} won')
        print(f'  P(any prize) = {nominal["any"]} = {float(nominal["any"]):.15f}, P(payout >= cost) = {float(nominal["recover"]):.12f}')
        if not use_node:
            continue
        for annual, tax, delay in SCENARIOS:
            ref = js_reference(tickets, annual, tax, delay)
            mine = summarise(law, cost, annual, tax, delay)
            mean, var = float(mine['mean']), float(mine['var'])
            gaps = [abs(ref['e'] - mean) / max(1.0, abs(mean)), abs(ref['v'] - var) / max(1.0, abs(var)),
                    abs(ref['any'] - float(mine['any'])), abs(ref['rec'] - float(mine['recover'])),
                    cdf_gap([(float(v), u / UNIT) for v, u in mine['dist']], ref['dist'])]
            worst = max(worst, *gaps)
            # the CDF is a running float sum on the JavaScript side, hence the slightly wider tolerance
            assert gaps[0] < 1e-10 and gaps[1] < 1e-9 and max(gaps[2:4]) < 1e-13 and gaps[4] < 1e-12, (name, annual, tax, delay, gaps)
        print(f'  JavaScript exactDistribution agrees in {len(SCENARIOS)} valuation scenarios')
    print('pension exhaustive check: PASS' + (f' (largest deviation from JavaScript {worst:.2e})' if use_node else ''))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Independent, integer-only combinatorial verification for five disjoint 6/45 games.
No external packages; no assumptions about historic draws. Run python tools/verify.py.
"""
from itertools import product
from math import comb
from fractions import Fraction
import json
D = comb(45, 6)
assert D == 8_145_060
counts = dict((str(t), 0) for t in range(3, 7))
per_hit = [0] * 7
exactly_three_pairs = 0
second_bonus_outcomes = third_bonus_outcomes = 0
for hits in product(range(7), repeat=5):
    used = sum(hits)
    if used > 6:
        continue
    w = comb(15, 6 - used)
    for h in hits:
        w *= comb(6, h)
    if not w:
        continue
    best = max(hits)
    for threshold in range(3, 7):
        if best >= threshold:
            counts[str(threshold)] += w
    for h in hits:
        per_hit[h] += w
    if sum(h >= 3 for h in hits) >= 2:
        exactly_three_pairs += w
    # Given the six main winning balls, the bonus is one of the 39 others.
    # Each ticket with five hits has exactly one extra ticket number remaining.
    hit5 = sum(h == 5 for h in hits)
    second_bonus_outcomes += w * hit5
    third_bonus_outcomes += w * hit5 * 38
assert sum(per_hit) == 5*D
assert [counts[str(k)] for k in range(3, 7)] == [966650, 56750, 1175, 5]
assert exactly_three_pairs == 4000
assert per_hit[6] == 5 and per_hit[5] == 1170
assert second_bonus_outcomes == 1170
assert third_bonus_outcomes == 1170*38
out = {
    'method': 'independent 5-block multivariate hypergeometric integer enumeration',
    'total_main_draws': D,
    'at_least_one_ticket_matches_at_least': counts,
    'multiple_three_or_more_matches': exactly_three_pairs,
    'expected_fifth_prize_games': str(Fraction(per_hit[3], D)),
    'expected_second_prize_games': str(Fraction(second_bonus_outcomes, D*39)),
    'expected_third_prize_games': str(Fraction(third_bonus_outcomes, D*39)),
    'expected_first_prize_games': str(Fraction(per_hit[6], D))
}
print(json.dumps(out, indent=2, ensure_ascii=False))

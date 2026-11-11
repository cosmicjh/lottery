#!/usr/bin/env python3
"""Exact integer verification of ANY Lotto 6/45 multi-game portfolio, plus a rigorous global upper bound.

tools/verify.py covers only five pairwise disjoint games, and overlapping portfolios were so far checked by a
single implementation (tools/exact-enumeration.cpp, which needs a C++ compiler). This script adds:

 1. A general exact counter. The 45 numbers are split into Venn cells by game membership; the six drawn
    numbers are distributed over the cells with multiplicity prod C(cell size, taken). No sampling, integers only.
 2. An independent recount of every portfolio stored in research/benchmark-1249.json (including the
    overlapping ones), compared field by field with the stored C++ results.
 3. The pairwise double-win table f(s): number of draws in which two games sharing s numbers BOTH match at
    least three numbers, and the resulting Hunter-Worsley bound
        |A1 u ... u A5| <= sum |Ai| - sum over ANY spanning tree of |Ai n Aj|     (Hunter 1976, Worsley 1982).
    If some pair of games shares a number, put that pair in the tree: the union is at most
    5*194,130 - f(1) - 3*f(0) = 965,750 < 966,650. Portfolios without a shared number are pairwise disjoint and
    reach exactly 966,650. Hence five pairwise disjoint games are globally optimal for P(at least one game
    matches >= 3); the earlier documents left this unproven.
 4. Optional exact-objective local search (--search N) as an empirical cross-check of that result.

Standard library only.  Usage: python tools/lotto-portfolio-check.py [--search N] [--seed S]
"""
from functools import lru_cache
from math import comb
import json, os, random, sys

D = comb(45, 6)
SINGLE_3PLUS = sum(comb(6, k) * comb(39, 6 - k) for k in range(3, 7))      # 194,130
DISJOINT_3PLUS = 966_650


def check(games):
    assert all(len(g) == 6 and len(set(g)) == 6 and all(isinstance(x, int) and 1 <= x <= 45 for x in g) for g in games)
    assert len({tuple(sorted(g)) for g in games}) == len(games), 'identical games'


def cells(games):
    """Venn cells: membership mask -> how many of the 45 numbers have exactly that membership."""
    size = {}
    for number in range(1, 46):
        mask = sum(1 << i for i, g in enumerate(games) if number in g)
        size[mask] = size.get(mask, 0) + 1
    return size


def exact(games):
    """Exact counts over all C(45,6) main draws for an arbitrary list of distinct games."""
    check(games)
    size = cells(games)
    free = size.pop(0, 0)
    items = sorted(size.items())
    n = len(games)
    out = {'total': 0, 'atLeast3': 0, 'atLeast4': 0, 'atLeast5': 0, 'atLeast6': 0,
           'drawsWithMultiple3Plus': 0, 'gameHitCounts': [0] * 7}

    def walk(index, remaining, hits, ways):
        if index == len(items):
            if remaining > free:
                return
            w = ways * comb(free, remaining)
            best = max(hits)
            out['total'] += w
            for t in (3, 4, 5, 6):
                if best >= t:
                    out[f'atLeast{t}'] += w
            if sum(h >= 3 for h in hits) >= 2:
                out['drawsWithMultiple3Plus'] += w
            for h in hits:
                out['gameHitCounts'][h] += w
            return
        mask, count = items[index]
        for take in range(min(count, remaining) + 1):
            new = hits if take == 0 else tuple(h + take if mask >> i & 1 else h for i, h in enumerate(hits))
            walk(index + 1, remaining - take, new, ways * comb(count, take))

    walk(0, 6, (0,) * n, 1)
    assert out['total'] == D
    return out


def at_least_three(games):
    """Fast exact |union of {game i matches >= 3}| by counting the complement (every game <= 2 matches)."""
    size = cells(games)
    free = size.pop(0, 0)
    states = {(6, (0,) * len(games)): 1}
    for mask, count in size.items():
        members = [i for i in range(len(games)) if mask >> i & 1]
        nxt = {}
        for (remaining, hits), ways in states.items():
            for take in range(min(count, remaining, 2) + 1):
                if take and any(hits[i] + take > 2 for i in members):
                    break
                new = hits if take == 0 else tuple(h + take if i in members else h for i, h in enumerate(hits))
                key = (remaining - take, new)
                nxt[key] = nxt.get(key, 0) + ways * comb(count, take)
        states = nxt
    none = sum(ways * comb(free, remaining) for (remaining, _), ways in states.items() if remaining <= free)
    return D - none


@lru_cache(maxsize=None)
def pair_double_win(shared, threshold=3):
    """Draws in which two games sharing `shared` numbers both match >= threshold (closed form)."""
    own, rest, total = 6 - shared, 45 - (12 - shared), 0
    for i in range(shared + 1):
        for j in range(own + 1):
            for k in range(own + 1):
                r = 6 - i - j - k
                if r >= 0 and i + j >= threshold and i + k >= threshold:
                    total += comb(shared, i) * comb(own, j) * comb(own, k) * comb(rest, r)
    return total


def verify_benchmark(root):
    path = os.path.join(root, 'research', 'benchmark-1249.json')
    data = json.load(open(path, encoding='utf-8'))
    print(f'1) independent recount of {os.path.relpath(path, root)}')
    for method in data['methods']:
        mine = exact(method['games'])
        assert mine == method['exact'], (method['method'], mine, method['exact'])
        assert at_least_three(method['games']) == mine['atLeast3']
        assert 30 - len({x for g in method['games'] for x in g}) == method['duplicateSlots']
        print(f"   {method['method']:<20} duplicates {method['duplicateSlots']}  3+ {mine['atLeast3']:>7,}  4+ {mine['atLeast4']:>6,}"
              f"  multiple-3+ {mine['drawsWithMultiple3Plus']:>6,}  = stored C++ result")
    return len(data['methods'])


def pair_table():
    print('2) two games sharing s numbers: draws where BOTH match >= 3 (and >= 4)')
    for s in range(6):
        a = [1, 2, 3, 4, 5, 6]
        b = a[:s] + list(range(7, 13 - s))
        counted = exact([a, b])
        assert counted['drawsWithMultiple3Plus'] == pair_double_win(s), s      # closed form == Venn enumeration
        print(f'   s={s}: {pair_double_win(s):>7,}   (>=4: {pair_double_win(s, 4):>5,})')
    table = [pair_double_win(s) for s in range(6)]
    assert table[0] == comb(6, 3) ** 2 == 400 and min(table) == table[0]
    assert all(table[s] < table[s + 1] for s in range(5)), 'double wins must grow with every shared number'
    return table


def bound(table):
    union = 5 * SINGLE_3PLUS
    assert exact([[6 * i + j + 1 for j in range(6)] for i in range(5)])['atLeast3'] == DISJOINT_3PLUS
    assert DISJOINT_3PLUS == union - comb(5, 2) * table[0]       # disjoint games: only (3,3) pairs overlap
    # Any portfolio with at least one overlapping pair: tree = that pair + three further edges.
    overlapping = union - min(table[1:]) - 3 * min(table)
    assert overlapping < DISJOINT_3PLUS, 'optimality proof does not close'
    print('3) global optimality of five pairwise disjoint games for P(at least one game matches >= 3)')
    print(f'   union bound (unattainable)            {union:>7,} / {D:,} = {100 * union / D:.6f}%')
    print(f'   any portfolio with a shared number <= {overlapping:>7,} / {D:,} = {100 * overlapping / D:.6f}%   (Hunter-Worsley)')
    print(f'   pairwise disjoint games               {DISJOINT_3PLUS:>7,} / {D:,} = {100 * DISJOINT_3PLUS / D:.6f}%')
    print(f'   => disjoint games are the global maximum; every overlap loses at least {DISJOINT_3PLUS - overlapping:,} draws.')
    assert table[0] and pair_double_win(0, 4) == 0   # disjoint games also attain the union bound for >= 4 matches
    return overlapping


def search(evaluations, seed):
    """Random-restart hill climbing on the exact objective. Evidence only, not a proof."""
    rng = random.Random(seed)
    best_value, best_games, used = 0, None, 0

    def random_start():
        kind = rng.random()
        if kind < .4:                                   # disjoint, then a few forced overlaps
            pool = rng.sample(range(1, 46), 30)
            games = [pool[6 * i:6 * i + 6] for i in range(5)]
            for _ in range(rng.randint(1, 4)):
                i, j = rng.sample(range(5), 2)
                x = rng.choice(games[j])
                if x not in games[i]:
                    games[i][rng.randrange(6)] = x
            return games
        if kind < .7:                                   # all games inside a small number pool
            pool = rng.sample(range(1, 46), rng.randint(9, 24))
            return [rng.sample(pool, 6) for _ in range(5)]
        return [rng.sample(range(1, 46), 6) for _ in range(5)]

    while used < evaluations:
        games = random_start()
        if len({tuple(sorted(g)) for g in games}) < 5:
            continue
        value = at_least_three(games); used += 1
        stale = 0
        while used < evaluations and stale < 60:
            i, j = rng.randrange(5), rng.randrange(6)
            x = rng.randint(1, 45)
            if x in games[i]:
                continue
            old = games[i][j]; games[i][j] = x
            if len({tuple(sorted(g)) for g in games}) < 5:
                games[i][j] = old
                continue
            new = at_least_three(games); used += 1
            if new >= value:
                stale = 0 if new > value else stale + 1
                value = new
            else:
                games[i][j] = old; stale += 1
        if value > best_value:
            best_value, best_games = value, [sorted(g) for g in games]
    print(f'4) exact-objective local search: {used:,} evaluations, seed {seed}')
    print(f'   best found {best_value:,} with {len({x for g in best_games for x in g})} distinct numbers: {best_games}')
    if best_value > DISJOINT_3PLUS:
        print('   COUNTEREXAMPLE: a portfolio beats disjoint games. Review the recommendation rule.')
        return 1
    print('   no portfolio above the disjoint value was found, consistent with the proof in section 3.')
    return 0


def main():
    args = sys.argv[1:]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    verify_benchmark(root)
    overlapping = bound(pair_table())
    status = 0
    if '--search' in args:
        n = int(args[args.index('--search') + 1])
        seed = int(args[args.index('--seed') + 1]) if '--seed' in args else 20261111
        assert 1 <= n <= 1_000_000
        status = search(n, seed)
    print(json.dumps({'total': D, 'single3plus': SINGLE_3PLUS, 'disjoint3plus': DISJOINT_3PLUS,
                      'maxWithAnySharedNumber3plus': overlapping, 'disjointIsGlobalOptimum': overlapping < DISJOINT_3PLUS, 'pairDoubleWin3plus': [pair_double_win(s) for s in range(6)]}))
    print('lotto portfolio check: ' + ('PASS' if status == 0 else 'REVIEW'))
    return status


if __name__ == '__main__':
    sys.exit(main())

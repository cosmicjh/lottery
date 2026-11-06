"""Independent standard-library combinatorial cross-check for pension720.mjs.
No shared JavaScript code, no remote data, no simulation.
"""
from math import isclose

D = 1_000_000
prob = {1: 1/(5*D), 2: 4/(5*D), 3: 45/(5*D), 4: 450/(5*D),
        5: 4_500/(5*D), 6: 45_000/(5*D), 7: 450_000/(5*D), 'bonus': 1/D}

def annuity(monthly, months, annual, tax):
    r = (1+annual)**(1/12)-1
    return monthly * (1-tax)*(months if not r else (1-(1+r)**(-months))/r)

def expected_per_ticket(annual=.03, tax=.22):
    winnings = {1:annuity(7_000_000,240,annual,tax), 2:annuity(1_000_000,120,annual,tax),
                3:1_000_000,4:100_000,5:50_000,6:5_000,7:1_000,
                'bonus':annuity(1_000_000,120,annual,tax)}
    cash = sum(prob[k]*winnings[k] for k in range(3,8))
    # For the same ticket B cannot equal the first/second-winning six-digit M.
    # If main ticket has 3–7 grade, B=ticket occurs with probability 1e-6.
    return (prob[1]*winnings[1] + prob[2]*winnings[2]
            + cash*(1-1/D) + prob['bonus']*winnings['bonus'])

def any_win_spread(n):
    """n unique final digits and unique full numbers, with n <= 10.
    Bonus conditional correction is 1/(9 million) for each M sharing
    first 5 digits with each ticket and having a different ones digit.
    """
    return n/10 + n*(10-n)/(10*D) + n*(10-n)/(9*D*D)

def any_win_focus():
    return .1 + .9/D + 1/(D*D)

assert isclose(sum(prob[i] for i in range(1,8)), .1, rel_tol=0, abs_tol=1e-15)
assert isclose(expected_per_ticket(0,0), 749.999802, abs_tol=1e-7)
assert isclose(any_win_spread(5), .5000025000027778, abs_tol=1e-14)
assert isclose(any_win_focus(), .100000900001, abs_tol=1e-14)
print('python independent checks: PASS')
print('E[one ticket], PV after 3% discount and 22% tax:', expected_per_ticket())
print('E[five tickets]:', expected_per_ticket()*5)
print('P(any win), 5 spread:',any_win_spread(5))
print('P(any win), 5-group focused:',any_win_focus())
print('P(first and second simultaneously), k=2 distinct groups, 1 six-digit:',2/(5*D))

"""Quote Subject naming contract tests.

Run: python tests/test_quote_subject.py   (also collects under pytest)

Guards the defect where Quote Subjects duplicated the product name:
    Deal "SuperBet - Jurnii UX" + product "Jurnii UX" + type Expansion
    produced "SuperBet - Jurnii UX - Jurnii UX (Expansion)"
because every creation site composed Deal_Name + " - " + product, and Deal_Name is
itself "<Account> - <Product>".

See tests/quote_subject_contract.py for why a green run here is not a statement
about production.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from quote_subject_contract import build_quote_subject as subj  # noqa: E402

CASES = []


def case(name, got, want):
    CASES.append((name, got, want))


# --- the reported defect -------------------------------------------------------
# Live Quote 991103000002520001 read "SuperBet - Jurnii UX - Jurnii UX (Expansion)".
case(
    "expansion: account base, product once",
    subj("SuperBet", "Jurnii UX", "Expansion", "SuperBet - Jurnii UX"),
    "SuperBet - Jurnii UX (Expansion)",
)

# --- deal name already contains the product (legacy: no Account resolvable) ----
case(
    "legacy base already carries product -> not appended twice",
    subj("", "Jurnii UX", "Expansion", "SuperBet - Jurnii UX"),
    "SuperBet - Jurnii UX (Expansion)",
)

# --- deal name does NOT contain the product -----------------------------------
case(
    "deal name without product -> product appears exactly once",
    subj("", "Jurnii UX", "Expansion", "SuperBet Opportunity"),
    "SuperBet Opportunity - Jurnii UX (Expansion)",
)

# --- acquisition / renewal / scaffold -----------------------------------------
case(
    "acquisition",
    subj("SuperBet", "Jurnii UX", "Acquisition", "SuperBet - Jurnii UX"),
    "SuperBet - Jurnii UX (Acquisition)",
)
case(
    "renewal",
    subj("SuperBet", "Jurnii UX", "Renewal", "SuperBet - Jurnii UX"),
    "SuperBet - Jurnii UX (Renewal)",
)
case(
    "acquisition scaffold",
    subj("SuperBet", "Jurnii UX", "Acquisition scaffold", "SuperBet - Jurnii UX"),
    "SuperBet - Jurnii UX (Acquisition scaffold)",
)
case(
    "no label (activity-path create sets no Quote_Type)",
    subj("SuperBet", "Jurnii UX", "", "SuperBet - Jurnii UX"),
    "SuperBet - Jurnii UX",
)

# --- account legitimately containing a hyphen ---------------------------------
# Live Account "SuperBet - Napoleon Games": the account's own segments must survive,
# and the product must still be appended exactly once.
case(
    "hyphenated account name is not mistaken for a product segment",
    subj("SuperBet - Napoleon Games", "Jurnii UX", "Renewal", "SuperBet - Napoleon Games - Jurnii UX"),
    "SuperBet - Napoleon Games - Jurnii UX (Renewal)",
)

# --- multiple products --------------------------------------------------------
case(
    "multi-product quote joins products, each once",
    subj("SuperBet", "Jurnii UX, Jurnii 360", "Expansion", ""),
    "SuperBet - Jurnii UX + Jurnii 360 (Expansion)",
)
case(
    "multi-product where base already carries one of them",
    subj("", "Jurnii UX, Jurnii 360", "Expansion", "SuperBet - Jurnii UX"),
    "SuperBet - Jurnii UX - Jurnii 360 (Expansion)",
)
case(
    "duplicate product names collapse",
    subj("SuperBet", "Jurnii UX, Jurnii UX", "Expansion", ""),
    "SuperBet - Jurnii UX (Expansion)",
)
case(
    "blank entries in the product list are ignored",
    subj("SuperBet", "Jurnii UX, , ", "Expansion", ""),
    "SuperBet - Jurnii UX (Expansion)",
)

# --- rerun / idempotency ------------------------------------------------------
# The update paths re-assert the Subject on every reconcile. Because the Subject is
# recomputed from parts, re-running must be a no-op rather than accreting segments.
_once = subj("SuperBet", "Jurnii UX", "Expansion", "SuperBet - Jurnii UX")
case(
    "rerun with the same parts is stable",
    subj("SuperBet", "Jurnii UX", "Expansion", "SuperBet - Jurnii UX"),
    _once,
)
case(
    "feeding a built Subject back in as the deal name does not re-append",
    subj("", "Jurnii UX", "Expansion", _once),
    "SuperBet - Jurnii UX (Expansion)",
)

# --- imported records ---------------------------------------------------------
# The import path passes impTerm (the quote type) as the label.
case(
    "imported record with term label",
    subj("Lucky7 Ventures", "Jurnii UX", "Acquisition", "Lucky7 Ventures - Jurnii UX"),
    "Lucky7 Ventures - Jurnii UX (Acquisition)",
)
case(
    "imported record with no resolvable term falls back to a label-less subject",
    subj("Lucky7 Ventures", "Jurnii UX", "", "Lucky7 Ventures - Jurnii UX"),
    "Lucky7 Ventures - Jurnii UX",
)

# --- degenerate inputs --------------------------------------------------------
case("no account, no deal, no product", subj("", "", "", ""), "Quote")
case("no account, no deal, product only", subj("", "Jurnii UX", "", ""), "Quote - Jurnii UX")
case(
    "no product resolvable -> base and label only",
    subj("SuperBet", "", "Renewal", "SuperBet - Jurnii UX"),
    "SuperBet (Renewal)",
)
case(
    "case-insensitive segment match",
    subj("", "jurnii ux", "Expansion", "SuperBet - Jurnii UX"),
    "SuperBet - Jurnii UX (Expansion)",
)
case(
    "product is a substring of a base segment -> still appended (not a segment match)",
    subj("", "Jurnii UX", "Expansion", "SuperBet - Jurnii UX Pro"),
    "SuperBet - Jurnii UX Pro - Jurnii UX (Expansion)",
)
case(
    "whitespace is trimmed",
    subj("  SuperBet  ", "  Jurnii UX  ", "  Expansion  ", ""),
    "SuperBet - Jurnii UX (Expansion)",
)
# The trailing-parenthesis strip is for MATCHING only: an Account genuinely named
# with a parenthesised suffix must keep it in the output and still get its product.
case(
    "account with a parenthesised suffix keeps it and still gets the product",
    subj("Acme (EU)", "Jurnii UX", "Expansion", ""),
    "Acme (EU) - Jurnii UX (Expansion)",
)


def test_quote_subject_contract():
    """pytest entry point: every case must hold."""
    failures = [(n, g, w) for n, g, w in CASES if g != w]
    assert not failures, "\n".join(
        "%s\n  got:  %r\n  want: %r" % (n, g, w) for n, g, w in failures
    )


def main():
    failed = 0
    for name, got, want in CASES:
        if got == want:
            print("  PASS  %s" % name)
        else:
            failed += 1
            print("  FAIL  %s\n          got:  %r\n          want: %r" % (name, got, want))
    print("\n%d/%d passed" % (len(CASES) - failed, len(CASES)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

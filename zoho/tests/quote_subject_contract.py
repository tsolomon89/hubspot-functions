"""Reference implementation of the v6 Quote Subject naming contract.

This is a line-for-line mirror of v6/activity/_util_buildQuoteSubject.deluge, which is
the deployed owner of Quote.Subject. Deluge has no local test runner and cannot be
executed off-platform, so the contract is pinned here instead and exercised by
tests/test_quote_subject.py.

LIMITATION — read before trusting a green run: this proves the CONTRACT, not the
deployed Deluge. The two are kept in step by hand. If you change one, change the
other in the same commit, and re-run the live checks in
docs/v6/ACTIVATION_GATE_TEST_PLAN.md. A green suite here does not mean production
is correct; only republishing the Deluge does that.
"""

import re


def build_quote_subject(account_name, product_names, quote_label, deal_name):
    """Compose a Quote Subject from canonical parts.

    Subject = <base> [ - <product>[ + <product>...] ] [ (<label>) ]
    base = account_name, else deal_name (legacy/no-Account), else "Quote".

    A product is appended only when the base does not already carry it as a
    " - "-delimited whole segment, so the product appears exactly once.
    """
    a_name = (account_name or "").strip()
    d_name = (deal_name or "").strip()
    label = (quote_label or "").strip()
    raw_prods = (product_names or "").strip()

    # base: Account name is authoritative; Deal name is the legacy fallback
    base = "Quote"
    if a_name:
        base = a_name
    elif d_name:
        base = d_name

    # products: split, trim, drop blanks, dedupe (order-preserving)
    prod_list = []
    if raw_prods:
        for raw_p in raw_prods.split(","):
            p_trim = raw_p.strip()
            if p_trim and p_trim not in prod_list:
                prod_list.append(p_trim)

    # matching base. A trailing parenthesised group is stripped FOR MATCHING ONLY
    # (never from the output), so re-feeding a built Subject back in as the base stays
    # idempotent instead of re-appending the product. An Account legitimately named
    # "Acme (EU)" keeps its suffix in the output and simply matches on "Acme".
    # Regex kept byte-identical to the Deluge, which avoids backslash escapes because
    # this org's Deluge is unreliable about them (cf. its hextoText("0A") workaround).
    match_lc = re.sub(r" *[(][^()]*[)]$", "", base).lower()

    # append only products the base does not already carry as a segment. Segment
    # membership uses explicit boundary comparisons rather than a " - " split, to mirror
    # the Deluge (whose toList() is only ever used with single-character delimiters).
    append_list = []
    for p in prod_list:
        p_lc = p.lower()
        has_seg = (
            match_lc == p_lc                          # base IS the product
            or match_lc.startswith(p_lc + " - ")      # leading segment
            or match_lc.endswith(" - " + p_lc)        # trailing segment
            or (" - " + p_lc + " - ") in match_lc     # middle segment
        )
        if not has_seg:
            append_list.append(p)

    subj = base
    if append_list:
        subj = subj + " - " + " + ".join(append_list)

    # parenthesised label, exactly once
    if label:
        suffix = "(" + label + ")"
        if not subj.endswith(suffix):
            subj = subj + " " + suffix
    return subj

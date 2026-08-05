"""Product Key -> Pipeline mapping contract tests.

Run: python tests/test_pipeline_mapping.py   (also collects under pytest)

Guards the authoritative rule that Product Interest determines Deal Pipeline, and in
particular that an UNKNOWN non-blank product key is `unresolved` and is NEVER silently
classified as B2B. See tests/pipeline_mapping_contract.py for why a green run here is
not a statement about production.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pipeline_mapping_contract import pipeline_for_product_key as p  # noqa: E402

CASES = []


def case(name, got, want):
    CASES.append((name, got, want))


# --- the three recognized B2B products ---
case("jurnii_ux -> B2B", p("jurnii_ux"), "B2B")
case("jurnii_360 -> B2B", p("jurnii_360"), "B2B")
case("jurnii_cortex -> B2B", p("jurnii_cortex"), "B2B")

# --- partnership ---
case("partnership -> Partnership", p("partnership"), "Partnership")

# --- blank defaults to B2B (agreed) ---
case("blank -> B2B", p(""), "B2B")
case("None -> B2B", p(None), "B2B")
case("whitespace-only -> B2B", p("   "), "B2B")

# --- unknown non-blank -> unresolved (NEVER silent B2B) ---
case("unknown key -> unresolved", p("jurnii_ux_fixed"), "unresolved")
case("unknown key is NOT B2B", p("jurnii_ux_fixed") != "B2B", True)
case("random text -> unresolved", p("something_else"), "unresolved")
case("partial 'jurnii' -> unresolved", p("jurnii"), "unresolved")
case("legacy variant -> unresolved", p("jurnii_cortex_flex"), "unresolved")
case("'b2b' as a product key is NOT a product -> unresolved", p("b2b"), "unresolved")

# --- case / whitespace normalisation (keys arrive lowercased already, but guard anyway) ---
case("Jurnii_UX (mixed case) -> B2B", p("Jurnii_UX"), "B2B")
case("PARTNERSHIP -> Partnership", p("PARTNERSHIP"), "Partnership")
case("padded partnership -> Partnership", p("  partnership  "), "Partnership")

# --- there are exactly two valid pipelines: every result is B2B / Partnership / unresolved ---
_valid = {"B2B", "Partnership", "unresolved"}
for _k in ["jurnii_ux", "jurnii_360", "jurnii_cortex", "partnership", "", "weird"]:
    case("result in valid set for %r" % _k, p(_k) in _valid, True)


def test_pipeline_mapping_contract():
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

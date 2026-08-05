"""Reference implementation of the Product Key -> Pipeline mapping.

Line-for-line mirror of v6/activity/_util_pipelineForProductKey.deluge, the deployed
single source of truth for the Product -> Deal Pipeline rule. Deluge has no local
runner, so the contract is pinned here and exercised by tests/test_pipeline_mapping.py.

LIMITATION: this proves the CONTRACT, not the deployed Deluge. Keep the two in step —
if you change one, change the other in the same commit. A green run here does not mean
production is correct; only republishing + the live E2E does that.
"""


def pipeline_for_product_key(product_key):
    """Map a canonical product key to a pipeline.

    "jurnii_ux" | "jurnii_360" | "jurnii_cortex" -> "B2B"
    "partnership"                                 -> "Partnership"
    ""  (blank)                                   -> "B2B"        (agreed default)
    any other non-blank key                       -> "unresolved" (never silent B2B)
    """
    k = (product_key or "").strip().lower()
    if k == "":
        return "B2B"
    if k == "partnership":
        return "Partnership"
    if k in ("jurnii_ux", "jurnii_360", "jurnii_cortex"):
        return "B2B"
    return "unresolved"

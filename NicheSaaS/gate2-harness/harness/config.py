"""Models, pricing, and the Gate 2 thresholds.

Pricing is USD per million tokens, current at time of writing. Verify against
platform.claude.com/docs/en/pricing before trusting a cost report.
"""

from __future__ import annotations

# --- models -----------------------------------------------------------------

REASONING_MODEL = "claude-opus-5"
CHEAP_MODEL = "claude-haiku-4-5"

# The scorer is measurement, not production. It runs on the reasoning model
# because mis-aligning a deficiency corrupts the metric the whole gate turns on.
# Its cost is tracked separately and deliberately excluded from COGS.
SCORER_MODEL = REASONING_MODEL

# --- pricing ----------------------------------------------------------------

PRICING = {
    # model: (input $/MTok, output $/MTok)
    "claude-opus-5": (5.00, 25.00),
    "claude-haiku-4-5": (1.00, 5.00),
}

CACHE_WRITE_MULTIPLIER = 1.25  # 5-minute TTL
CACHE_READ_MULTIPLIER = 0.10

# Speech-to-text, billed by the minute. Deepgram/AssemblyAI ballpark.
ASR_USD_PER_MINUTE = 0.005

# --- prompt caching ---------------------------------------------------------

# Minimum cacheable prefix, in tokens, per model. Below this the API silently
# declines to cache: no error, just cache_creation_input_tokens == 0.
CACHE_MINIMUM_TOKENS = {
    "claude-opus-5": 512,
    "claude-haiku-4-5": 4096,
}

# --- Gate 2 thresholds (see ../../04-validation-sprint.md) ------------------

GATE2_MIN_ACCURACY = 0.85      # fraction of reference deficiencies recovered
GATE2_MAX_COGS_USD = 2.00      # per report, excluding scoring
GATE2_MAX_WALL_CLOCK_S = 300   # per report

# A fabrication is a deficiency the system reported that the human did not.
# In a compliance product this is worse than a miss, so it gets its own budget
# rather than being averaged into an accuracy percentage.
GATE2_MAX_FABRICATIONS_PER_REPORT = 1.0

# --- effort -----------------------------------------------------------------
# Opus 5 supports low | medium | high | xhigh | max. Extraction accuracy is what
# the gate measures, so it defaults high; prose writing is less sensitive.

EFFORT_EXTRACT = "high"
EFFORT_REPORT = "medium"
EFFORT_PROPOSAL = "medium"
EFFORT_SCORE = "medium"

# --- token budgets ----------------------------------------------------------
# On Opus 5 thinking is on by default and max_tokens caps thinking PLUS output,
# so these are deliberately generous. Every call streams, so large values do not
# risk an HTTP timeout.

MAX_TOKENS_PHOTOS = 8_000
MAX_TOKENS_EXTRACT = 32_000
MAX_TOKENS_REPORT = 32_000
MAX_TOKENS_PROPOSAL = 16_000
MAX_TOKENS_SCORE = 16_000

"""Per-stage cost and timing.

Two things this exists to make impossible to get wrong:

1. Cache-aware pricing. Cached reads are ~0.1x and cache writes ~1.25x the
   input rate. Pricing an agentic pipeline on `input_tokens` alone understates
   a cold run and overstates every warm one.
2. Keeping measurement out of COGS. The scorer is not part of the product, so
   its spend is tracked but never added to the per-report cost the gate checks.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field

from .config import CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER, PRICING


@dataclass
class StageCost:
    stage: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    flat_usd: float = 0.0          # non-token spend, e.g. ASR minutes
    seconds: float = 0.0
    calls: int = 0
    measurement: bool = False      # excluded from COGS when True

    @property
    def usd(self) -> float:
        if self.model not in PRICING:
            return self.flat_usd
        in_rate, out_rate = PRICING[self.model]
        billable_input = (
            self.input_tokens
            + self.cache_write_tokens * CACHE_WRITE_MULTIPLIER
            + self.cache_read_tokens * CACHE_READ_MULTIPLIER
        )
        return (
            billable_input * in_rate / 1_000_000
            + self.output_tokens * out_rate / 1_000_000
            + self.flat_usd
        )


@dataclass
class CostMeter:
    stages: dict[str, StageCost] = field(default_factory=dict)
    _started: float = field(default_factory=time.perf_counter)

    def _slot(self, stage: str, model: str, measurement: bool) -> StageCost:
        if stage not in self.stages:
            self.stages[stage] = StageCost(
                stage=stage, model=model, measurement=measurement
            )
        return self.stages[stage]

    def record(self, stage: str, model: str, usage, *, measurement: bool = False) -> None:
        """Accumulate one API response's usage into a stage."""
        s = self._slot(stage, model, measurement)
        s.calls += 1
        s.input_tokens += getattr(usage, "input_tokens", 0) or 0
        s.output_tokens += getattr(usage, "output_tokens", 0) or 0
        s.cache_read_tokens += getattr(usage, "cache_read_input_tokens", 0) or 0
        s.cache_write_tokens += getattr(usage, "cache_creation_input_tokens", 0) or 0

    def record_flat(self, stage: str, usd: float, *, model: str = "external") -> None:
        self._slot(stage, model, False).flat_usd += usd

    @contextmanager
    def timed(self, stage: str, model: str = "external", *, measurement: bool = False):
        start = time.perf_counter()
        try:
            yield
        finally:
            self._slot(stage, model, measurement).seconds += time.perf_counter() - start

    # --- rollups ------------------------------------------------------------

    @property
    def cogs_usd(self) -> float:
        """Production cost only. This is the number Gate 2 checks."""
        return sum(s.usd for s in self.stages.values() if not s.measurement)

    @property
    def measurement_usd(self) -> float:
        return sum(s.usd for s in self.stages.values() if s.measurement)

    @property
    def wall_clock_s(self) -> float:
        return time.perf_counter() - self._started

    @property
    def cache_read_tokens(self) -> int:
        return sum(s.cache_read_tokens for s in self.stages.values())

    @property
    def cache_write_tokens(self) -> int:
        return sum(s.cache_write_tokens for s in self.stages.values())

    def table(self) -> str:
        rows = [f"{'stage':<22}{'model':<20}{'calls':>6}{'in':>10}{'cache-r':>10}"
                f"{'out':>9}{'sec':>8}{'USD':>10}"]
        rows.append("-" * 95)
        for s in self.stages.values():
            tag = " (measurement)" if s.measurement else ""
            rows.append(
                f"{s.stage + tag:<22}{s.model:<20}{s.calls:>6}{s.input_tokens:>10,}"
                f"{s.cache_read_tokens:>10,}{s.output_tokens:>9,}"
                f"{s.seconds:>8.1f}{s.usd:>10.4f}"
            )
        rows.append("-" * 95)
        rows.append(f"{'COGS (production)':<48}{'':>28}{self.cogs_usd:>19.4f}")
        if self.measurement_usd:
            rows.append(f"{'scoring (excluded)':<48}{'':>28}{self.measurement_usd:>19.4f}")
        return "\n".join(rows)

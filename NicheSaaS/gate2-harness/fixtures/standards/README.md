# Standards corpus

`load_corpus()` concatenates every `*.md` file in this directory **in sorted
filename order** and pins it as the cached prompt prefix. This README is skipped.

## You must supply the real corpus

NFPA 25 and NFPA 72 are copyrighted works. They are not in this repository and
must not be committed to it. Obtain a licence and place the clause text here, or
point `--standards` at a directory outside the repo:

```sh
python run.py --all fixtures/inspections --standards ~/private/nfpa-corpus
```

This is not only a legal constraint — it is a real cost line for the business.
Standards licensing for redistribution is a question to settle before a paid
pilot, not after, and it belongs in the Gate 3 conversation.

## What ships here instead

`SYNTHETIC-placeholder.md` contains **invented clause numbers and paraphrased
generic requirements**. It exists so the harness runs end to end before you have
a licensed corpus. It is not NFPA text and must never be used to produce a report
anyone relies on.

Numbers produced against the synthetic corpus validate **wiring**, not
capability. Gate 2 is only meaningful against the real corpus and real
inspections.

## Formatting for stable caching

Two rules, both cost decisions:

1. **Never reorder or rename files casually.** Sorted filename order determines
   the prefix bytes; a rename reshuffles the corpus and cold-starts every cache
   entry.
2. **Keep clause references literal and greppable** (`25-13.2.5`). The extraction
   stage cross-checks every cited clause against the corpus text and flags any
   citation it cannot find — that check is a substring match, so consistent
   formatting is what makes it work.

Split by standard and chapter, one file per chapter, zero-padded so sort order is
stable as the corpus grows:

```
nfpa25-ch05-sprinkler-systems.md
nfpa25-ch13-valves.md
nfpa72-ch14-inspection-testing.md
```

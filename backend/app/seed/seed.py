"""Demo data seeder.

Entry point exists from T-01 so `make seed` is wired end to end and the command
in the README is real rather than aspirational. The schema it writes into landed
in T-03; the data itself arrives in T-05.

Contract (T-05.9): running this twice must never duplicate. Default mode upserts
on a stable ``seed_key``; ``--reset`` drops and recreates.
"""

from __future__ import annotations

import argparse
import sys


def seed(*, reset: bool = False) -> int:
    """Populate the database with demo meetings. Returns a process exit code."""
    if reset:
        print("seed: --reset acknowledged (nothing to drop yet)")

    print("seed: schema is ready; no demo data yet — the seeder lands in T-05.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed the Fireflies demo database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop and recreate all data instead of upserting.",
    )
    args = parser.parse_args(argv)
    return seed(reset=args.reset)


if __name__ == "__main__":
    sys.exit(main())

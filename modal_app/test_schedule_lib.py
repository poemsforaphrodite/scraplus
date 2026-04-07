import pytest
from datetime import datetime, timezone

from schedule_lib import parse_cron, cron_matches, next_run_after, validate_schedule


def test_parse_cron_basic():
    parsed = parse_cron("0 * * * *")
    assert parsed["minute"] == {0}
    assert parsed["hour"] == set(range(24))


def test_parse_cron_preset():
    parsed = parse_cron("@daily")
    assert parsed["minute"] == {0}
    assert parsed["hour"] == {0}


def test_parse_cron_range():
    parsed = parse_cron("0 9-17 * * *")
    assert parsed["hour"] == set(range(9, 18))


def test_parse_cron_step():
    parsed = parse_cron("*/15 * * * *")
    assert parsed["minute"] == {0, 15, 30, 45}


def test_parse_cron_invalid():
    with pytest.raises(ValueError):
        parse_cron("bad")


def test_cron_matches():
    dt = datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc)
    assert cron_matches("0 12 * * *", dt)
    assert not cron_matches("30 12 * * *", dt)


def test_next_run_after():
    dt = datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc)
    nxt = next_run_after("0 * * * *", dt)
    assert nxt is not None
    assert nxt == datetime(2026, 4, 7, 13, 0, tzinfo=timezone.utc)


def test_validate_schedule_ok():
    errs = validate_schedule({"url": "https://example.com", "cron": "0 * * * *"})
    assert errs == []


def test_validate_schedule_missing_url():
    errs = validate_schedule({"cron": "0 * * * *"})
    assert any("url" in e for e in errs)


def test_validate_schedule_bad_cron():
    errs = validate_schedule({"url": "https://example.com", "cron": "bad"})
    assert any("cron" in e.lower() for e in errs)

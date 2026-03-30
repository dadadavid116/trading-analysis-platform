"""
tests package

Backend tests using pytest and pytest-asyncio.

Run tests from the backend/ directory:
    pytest

As routes and models are implemented, add test files here:
    test_health.py      — Tests for the /health endpoint (starting point)
    test_price.py       — Tests for price endpoints
    test_liquidations.py
    test_orderbook.py

Use httpx.AsyncClient to test FastAPI routes without running a live server.
"""

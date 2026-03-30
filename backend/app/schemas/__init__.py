"""
schemas package

Pydantic models used to define the shape of API request and response bodies.

Each schema file mirrors a router file:
  price.py  — response shapes for price endpoints
  [Later] alert.py — shapes for alert endpoints

Schemas are separate from ORM models (in app/models/) to keep API
response shapes independent from the database structure.
"""

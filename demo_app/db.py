"""Lazy Supabase client singleton for the demo app's own domain data."""
from __future__ import annotations

import os
from typing import Optional

from supabase import Client, create_client

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
    return _client

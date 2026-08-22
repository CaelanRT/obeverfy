import json
import os
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

BASE_URL = 'http://localhost:3000'


def send_json(data: Any) -> Any:
    """Send data to the local server as JSON and return its JSON response."""
    request = Request(
        BASE_URL,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urlopen(request) as response:
        return json.load(response)


def receive_json() -> Any:
    """Receive JSON data from the local server."""
    request = Request(
        BASE_URL,
        headers={"Accept": "application/json"},
        method="GET",
    )

    with urlopen(request) as response:
        return json.load(response)

"""Export vocabulary (T-34.1).

A `Literal` rather than an enum, deliberately: FastAPI renders it as an
OpenAPI enum on the query parameter and rejects anything else with a 422
before the handler runs — which is exactly the contract's answer for an
unknown format, for free. The router imports it from here so the API layer's
vocabulary keeps coming from schema modules (ADR-017).
"""

from __future__ import annotations

from typing import Literal

ExportFormat = Literal["pdf", "md", "txt", "docx"]

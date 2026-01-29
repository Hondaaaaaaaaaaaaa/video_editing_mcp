"""
Template system for saving and loading operation sequences.
"""

from __future__ import annotations

import json
import os
from typing import Any

__all__ = [
    "save_template",
    "load_template",
    "list_templates",
    "delete_template",
]

DEFAULT_TEMPLATE_DIR = os.path.expanduser("~/.vemcp/templates")


def save_template(
    name: str,
    operations: list[dict[str, Any]],
    template_dir: str = "",
    metadata: dict[str, Any] | None = None,
) -> None:
    """Save operations as a reusable template.

    Args:
        name: Name of the template
        operations: List of operations to save
        template_dir: Directory to save templates (default: ~/.vemcp/templates)
        metadata: Optional metadata dict (description, author, version, etc.)
    """
    dir_path = template_dir or DEFAULT_TEMPLATE_DIR
    os.makedirs(dir_path, exist_ok=True)

    template_path = os.path.join(dir_path, f"{name}.json")
    data: dict[str, Any] = {"operations": operations}
    if metadata:
        data["metadata"] = metadata

    with open(template_path, "w") as f:
        json.dump(data, f, indent=2)


def load_template(
    name: str,
    template_dir: str = "",
    include_metadata: bool = False,
) -> list[dict] | dict:
    """Load a template from disk.

    Args:
        name: Name of the template to load
        template_dir: Directory containing templates (default: ~/.vemcp/templates)
        include_metadata: If True, return full dict with operations and metadata

    Returns:
        List of operations, or full dict if include_metadata is True

    Raises:
        FileNotFoundError: If template does not exist
    """
    dir_path = template_dir or DEFAULT_TEMPLATE_DIR
    template_path = os.path.join(dir_path, f"{name}.json")

    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template '{name}' not found")

    with open(template_path, "r") as f:
        data = json.load(f)

    if include_metadata:
        return data
    return data.get("operations", [])


def list_templates(template_dir: str = "") -> list[str]:
    """List available template names.

    Args:
        template_dir: Directory containing templates (default: ~/.vemcp/templates)

    Returns:
        List of template names (without .json extension)
    """
    dir_path = template_dir or DEFAULT_TEMPLATE_DIR
    if not os.path.exists(dir_path):
        return []

    return [f[:-5] for f in os.listdir(dir_path) if f.endswith(".json")]


def delete_template(name: str, template_dir: str = "") -> None:
    """Delete a template.

    Args:
        name: Name of the template to delete
        template_dir: Directory containing templates (default: ~/.vemcp/templates)
    """
    dir_path = template_dir or DEFAULT_TEMPLATE_DIR
    template_path = os.path.join(dir_path, f"{name}.json")
    if os.path.exists(template_path):
        os.remove(template_path)

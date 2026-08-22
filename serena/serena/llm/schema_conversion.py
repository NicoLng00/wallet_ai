"""Conversione da JSON Schema Pydantic (Draft 2020-12, con $defs/$ref) al dialetto di schema
supportato da Gemini (un sottoinsieme di OpenAPI 3.0: type MAIUSCOLO, niente $ref — tutto inlineato,
solo un piccolo elenco di parole chiave documentate). VERIFICATO dal vivo (non assunto): una chiamata
reale con uno schema in questo formato a gemini-3.5-flash risponde 200 con JSON strutturato valido
(vedi commit di riferimento). Le parole chiave Pydantic non documentate da Gemini (title, default,
minLength, exclusiveMinimum, additionalProperties booleano, ecc.) vengono scartate invece di inviate
a caso: se Gemini le rifiutasse silenziosamente andrebbe bene, ma se le rifiutasse con un errore http
vorremmo scoprirlo qui, non a runtime nel mezzo di una simulazione."""
from __future__ import annotations
from typing import Any

from pydantic import BaseModel

_SUPPORTED_KEYS = {"type", "enum", "items", "properties", "required", "nullable", "description", "format"}


def _resolve(node: dict[str, Any], defs: dict[str, Any]) -> dict[str, Any]:
    if "$ref" in node:
        ref_name = node["$ref"].split("/")[-1]
        return _resolve(defs[ref_name], defs)

    if "anyOf" in node or "oneOf" in node:
        branches = node.get("anyOf") or node.get("oneOf")
        non_null = [b for b in branches if b.get("type") != "null"]
        is_nullable = len(non_null) != len(branches)
        if len(non_null) == 1:
            resolved = _resolve(non_null[0], defs)
            if is_nullable:
                resolved["nullable"] = True
            return resolved
        # union reale di piu' tipi non-null: Gemini non supporta anyOf, degrada a STRING
        # (caso non ancora incontrato dai nostri schemi reali, documentato invece di ignorato in silenzio)
        return {"type": "STRING"}

    resolved: dict[str, Any] = {}
    node_type = node.get("type")
    if node_type == "object" and "properties" in node:
        resolved["type"] = "OBJECT"
        resolved["properties"] = {key: _resolve(value, defs) for key, value in node["properties"].items()}
        if "required" in node:
            resolved["required"] = node["required"]
    elif node_type == "object":
        # dict[str, X] libero (additionalProperties) — Gemini non supporta mappe aperte nel suo
        # dialetto documentato; dichiarato esplicitamente invece di inviare uno schema che potrebbe
        # fallire in silenzio.
        raise UnsupportedSchemaError(
            "Gemini non supporta oggetti a proprieta' libere (dict aperti) nel suo schema strutturato "
            "documentato — serve un campo con 'properties' esplicite."
        )
    elif node_type == "array":
        resolved["type"] = "ARRAY"
        resolved["items"] = _resolve(node["items"], defs)
    elif "enum" in node:
        resolved["type"] = (node_type or "string").upper()
        resolved["enum"] = node["enum"]
    elif node_type is not None:
        resolved["type"] = node_type.upper()
    for key in _SUPPORTED_KEYS:
        if key in node and key not in resolved and key not in ("type", "enum", "items", "properties", "required"):
            resolved[key] = node[key]
    return resolved


class UnsupportedSchemaError(ValueError):
    pass


def pydantic_schema_to_gemini_schema(model: type[BaseModel]) -> dict[str, Any]:
    raw = model.model_json_schema()
    defs = raw.get("$defs", {})
    return _resolve({key: value for key, value in raw.items() if key != "$defs"}, defs)

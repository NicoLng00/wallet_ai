"""Verifica automatica, non solo convenzione (docs/IMPLEMENTATION_PLAN.md Fase 9): risk/ e backtest/
non devono MAI importare un modulo legato a un LLM. Analizza l'AST reale di ogni file .py in quei
package — non un grep testuale, che sarebbe ingannato da stringhe/commenti — ed elenca gli import
effettivi (import X / from X import Y)."""
from __future__ import annotations
import ast
import tempfile
from pathlib import Path

SERENA_PACKAGE_ROOT = Path(__file__).resolve().parent.parent / "serena"
FORBIDDEN_MODULE_PREFIXES = ("serena.llm", "anthropic", "openai")
LLM_FREE_PACKAGES = ["risk", "backtest"]


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def _is_forbidden(module_name: str) -> bool:
    return any(module_name == prefix or module_name.startswith(prefix + ".") for prefix in FORBIDDEN_MODULE_PREFIXES)


def _find_violations(package_name: str) -> dict[str, set[str]]:
    package_dir = SERENA_PACKAGE_ROOT / package_name
    violations: dict[str, set[str]] = {}
    for path in package_dir.rglob("*.py"):
        forbidden_hits = {module for module in _imported_modules(path) if _is_forbidden(module)}
        if forbidden_hits:
            violations[str(path.relative_to(SERENA_PACKAGE_ROOT))] = forbidden_hits
    return violations


def test_risk_package_never_imports_an_llm_client():
    violations = _find_violations("risk")
    assert not violations, f"risk/ importa moduli LLM vietati: {violations}"


def test_backtest_package_never_imports_an_llm_client():
    violations = _find_violations("backtest")
    assert not violations, f"backtest/ importa moduli LLM vietati: {violations}"


def test_the_lint_itself_actually_detects_a_forbidden_import():
    """Verifica che il controllo non sia vuoto per costruzione (un package senza file passerebbe
    banalmente): un file finto che importa serena.llm deve essere rilevato."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        fake_file = Path(tmp_dir) / "fake_offender.py"
        fake_file.write_text("from serena.llm.client import LLMClient\n", encoding="utf-8")
        modules = _imported_modules(fake_file)
        assert any(_is_forbidden(module) for module in modules)


def test_the_lint_does_not_flag_an_unrelated_import():
    with tempfile.TemporaryDirectory() as tmp_dir:
        fake_file = Path(tmp_dir) / "fake_clean.py"
        fake_file.write_text("from serena.models.agent import AgentProfile\nimport numpy as np\n", encoding="utf-8")
        modules = _imported_modules(fake_file)
        assert not any(_is_forbidden(module) for module in modules)

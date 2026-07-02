"""SECRET_KEY enforcement: importing app.py (gunicorn, flask run, tests)
must fail loudly without SECRET_KEY, and succeed with it."""
import os
import subprocess
import sys

from conftest import PROJECT_ROOT


def _import_app(env_overrides):
    env = {k: v for k, v in os.environ.items() if k != 'SECRET_KEY'}
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, '-c', 'import app'],
        cwd=PROJECT_ROOT, env=env, capture_output=True, text=True, timeout=60,
    )


def test_import_without_secret_key_fails():
    result = _import_app({})
    assert result.returncode != 0
    assert 'SECRET_KEY' in result.stderr


def test_import_with_secret_key_succeeds():
    result = _import_app({'SECRET_KEY': 'ci-test-key'})
    assert result.returncode == 0, result.stderr


def test_app_config_uses_env_secret_key():
    import app as site
    assert site.app.config['SECRET_KEY'] == os.environ['SECRET_KEY']

import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture(scope='session')
def app_server():
    """Boot the real Flask app on a free port for browser smoke tests."""
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]

    env = dict(os.environ, SECRET_KEY='e2e-test-key')
    proc = subprocess.Popen(
        [sys.executable, '-m', 'flask', '--app', 'app', 'run',
         '--no-reload', '-p', str(port)],
        cwd=PROJECT_ROOT, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base_url = f'http://127.0.0.1:{port}'
    try:
        deadline = time.monotonic() + 30
        while True:
            if proc.poll() is not None:
                raise RuntimeError(
                    f'app server exited early:\n{proc.stdout.read().decode()}')
            try:
                urllib.request.urlopen(f'{base_url}/resume', timeout=1)
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise RuntimeError('app server did not become ready in 30s')
                time.sleep(0.2)
        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()

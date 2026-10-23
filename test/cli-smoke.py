#!/usr/bin/env python3
"""Optional Linux PTY smoke test: real pi CLI, isolated HOME/config, synthetic session.
No real credentials, user sessions, project configuration, or model prompts are used.
Run: python3 test/cli-smoke.py [regular|fullscreen]
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import struct
import subprocess
import sys
import tempfile
import termios
import time

repo = Path(__file__).resolve().parents[1]
mode = sys.argv[1] if len(sys.argv) > 1 else 'regular'
assert mode in ('regular', 'fullscreen')
pi = shutil.which('pi')
assert pi, 'pi must be on PATH'
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {fixture} from './test/fixtures.js'; console.log(JSON.stringify(fixture()))"], cwd=repo))
ansi = re.compile(r'\x1b\][^\x07]*(?:\x07)|\x1b\[[0-?]*[ -/]*[@-~]')
with tempfile.TemporaryDirectory(prefix='pi-history-cli-') as tmp:
    root = Path(tmp)
    session = root / 'synthetic.jsonl'
    session.write_text('\n'.join(json.dumps(e) for e in [{'type': 'session', 'version': 3, 'id': 'history-smoke', 'timestamp': '2026-01-01T00:00:00.000Z', 'cwd': tmp}] + fixture) + '\n')
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PI_', 'ANTHROPIC_', 'OPENAI_', 'GOOGLE_', 'GEMINI_', 'AWS_')) and not k.endswith(('API_KEY', 'TOKEN'))}
    env.update(HOME=tmp, PI_CODING_AGENT_DIR=str(root / 'config'), PI_CODING_AGENT_SESSION_DIR=str(root / 'sessions'), PI_OFFLINE='1', PI_SKIP_VERSION_CHECK='1', PI_TELEMETRY='0', TERM='xterm-256color', PI_IMAGE_PROTOCOL='none')
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 120, 0, 0))
    command = [pi, '--offline', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-themes', '--no-mcp', '--no-tools', '--no-approve', '--tui-mode', mode, '--model', 'openai/gpt-4.1', '--api-key', 'invalid-offline-test-key', '--session', str(session), '-e', str(repo / 'src/index.js')]
    proc = subprocess.Popen(command, cwd=tmp, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    log = bytearray()

    def read_for(seconds):
        data = bytearray()
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            if select.select([master], [], [], 0.1)[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                data.extend(chunk)
        log.extend(data)
        return ansi.sub('', data.decode(errors='replace'))

    def send(data, delay=0.5):
        os.write(master, data)
        return read_for(delay)

    try:
        startup = ''
        deadline = time.monotonic() + 20
        while 'ACTIVE_ONLY' not in startup and time.monotonic() < deadline and proc.poll() is None:
            startup += read_for(0.25)
        assert proc.poll() is None and 'ACTIVE_ONLY' in startup, startup
        read_for(0.5)  # Let initial rendering finish before typing the command.
        before = hashlib.sha256(session.read_bytes()).hexdigest()
        mtime = session.stat().st_mtime_ns
        tree = send(b'/history-tree\r', 1)
        assert 'History Tree' in tree, tree
        assert 'User messages only' in tree, tree
        assert '╭' in tree and '╰' in tree, 'Missing closed overlay border'
        send(b'old')
        branch = send(b'\r')
        assert 'Choose continuation branch' in branch, branch
        reader = send(b'\r')
        assert 'History Reader' in reader, reader
        assert 'old question' in reader, reader
        assert 'User + final reply' in reader, reader
        assert 'Tool call:' not in reader and 'SECRET_THINKING' not in reader, 'Process leaked into default view'
        process = send(b'\x10')
        assert 'Full process' in process, process
        send(b'\x1b[6~')
        returned = send(b'\x1b')
        assert 'History Tree' in returned, returned
        exited = send(b'\x1b')
        assert hashlib.sha256(session.read_bytes()).hexdigest() == before, 'Session bytes changed while browsing'
        assert session.stat().st_mtime_ns == mtime, 'Session mtime changed while browsing'
        assert 'History Tree:' not in ansi.sub('', log.decode(errors='replace')), 'Extension reported an error'
        print(json.dumps({'mode': mode, 'result': 'passed', 'session_hash_unchanged': True, 'session_mtime_unchanged': True, 'pty_keyboard_roundtrip': True}))
    except Exception:
        # Only synthetic transcript data is in this diagnostic file.
        target = repo / f'cli-smoke-{mode}.log'
        target.write_bytes(log)
        print(f'Diagnostic: {target}', file=sys.stderr)
        raise
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        os.close(master)

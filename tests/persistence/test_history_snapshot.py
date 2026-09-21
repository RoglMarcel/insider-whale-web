from contextlib import closing
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('history', Path(__file__).resolve().parents[2] / 'scripts/history-snapshot.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = self.root / 'history.db'
        self.remote = self.root / 'remote'
        self.remote.mkdir()
        self.exists = False
        self.upload_failure = False
        with sqlite3.connect(self.db) as db:
            db.executescript('''
                CREATE TABLE signals(id INTEGER PRIMARY KEY, ticker TEXT, scraped_at TEXT);
                CREATE TABLE scrape_log(id INTEGER PRIMARY KEY, started_at TEXT);
                CREATE TABLE insider_trades(id INTEGER PRIMARY KEY, ticker TEXT, insider_key TEXT, trade_date TEXT, value_cents INTEGER);
                CREATE TABLE portfolio_equity(date TEXT PRIMARY KEY, value REAL);
                INSERT INTO signals VALUES(1, 'OLD', '2026-09-11');
                INSERT INTO portfolio_equity VALUES('2026-09-21', 12345);
            ''')
        self.addCleanup(patch.stopall)
        patch.object(history, 'gh', side_effect=self.gh).start()
        patch.dict(os.environ, {'GITHUB_SHA': 'abc'}).start()

    def gh(self, *args):
        if args[0] == 'api':
            if '/releases/tags/' in args[-1]:
                if not self.exists:
                    raise subprocess.CalledProcessError(1, args, stderr='gh: Not Found (HTTP 404)')
                return json.dumps({'id': 1})
            return json.dumps([[{'id': i, 'name': p.name, 'state': 'uploaded', 'created_at': f'{i:09d}'}
                                for i, p in enumerate(sorted(self.remote.iterdir()), 1)]])
        if args[:2] == ('release', 'create'):
            self.exists = True
        elif args[:2] == ('release', 'upload'):
            if self.upload_failure:
                raise subprocess.CalledProcessError(1, args, stderr='upload failed')
            shutil.copyfile(args[3], self.remote / Path(args[3]).name)
        elif args[:2] == ('release', 'download'):
            name = args[args.index('--pattern') + 1]
            dest = Path(args[args.index('--dir') + 1])
            shutil.copyfile(self.remote / name, dest / name)
        else:
            raise AssertionError(args)
        return ''

    def save(self, run='100'):
        history.save('owner/repo', self.db, self.root / f'output-{run}', run, '1')

    def test_large_database_roundtrip(self):
        # Larger than GitHub's raw Git blob limit, including an incompressible row.
        with sqlite3.connect(self.db) as db:
            db.execute('CREATE TABLE payload(data BLOB)')
            db.execute('INSERT INTO payload VALUES(zeroblob(106000000))')
            db.execute('INSERT INTO payload VALUES(?)', (os.urandom(1024 * 1024),))
        self.assertGreater(self.db.stat().st_size, 100 * 1024 * 1024)
        db.close()
        with closing(sqlite3.connect(self.db)) as db:
            before = [(len(row[0]), hashlib.sha256(row[0]).hexdigest()) for row in db.execute('SELECT data FROM payload')]
        self.save()
        self.db.unlink()
        history.restore('owner/repo', self.db)
        with closing(sqlite3.connect(self.db)) as db:
            after = [(len(row[0]), hashlib.sha256(row[0]).hexdigest()) for row in db.execute('SELECT data FROM payload')]
        self.assertEqual(after, before)

    def test_failed_upload_preserves_previous_snapshot(self):
        self.save()
        with sqlite3.connect(self.db) as db:
            db.execute("INSERT INTO signals VALUES(2, 'NEW', '2026-09-22')")
        self.upload_failure = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.save('101')
        self.assertEqual(len(list(self.remote.iterdir())), 1)
        history.restore('owner/repo', self.db)
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM signals').fetchone()[0], 1)
        self.assertTrue(list((self.root / 'output-101').glob('*.gz')))

    def test_corrupt_snapshot_does_not_replace_local_database(self):
        self.save()
        before = history.digest(self.db)
        next(self.remote.iterdir()).write_bytes(b'corrupted download')
        with self.assertRaisesRegex(RuntimeError, 'checksum'):
            history.restore('owner/repo', self.db)
        self.assertEqual(history.digest(self.db), before)

    def test_auth_error_and_empty_release_never_fall_back(self):
        with patch.object(history, 'gh', side_effect=subprocess.CalledProcessError(1, [], stderr='HTTP 403')):
            with self.assertRaises(subprocess.CalledProcessError):
                history.restore('owner/repo', self.db)
        self.exists = True
        with self.assertRaisesRegex(RuntimeError, 'no complete snapshot'):
            history.restore('owner/repo', self.db)

    def test_initial_bootstrap_keeps_committed_database(self):
        before = history.digest(self.db)
        history.restore('owner/repo', self.db)
        self.assertEqual(history.digest(self.db), before)

    def test_desktop_merge_preserves_cloud_state_and_is_idempotent(self):
        self.save()
        with sqlite3.connect(self.db) as db:
            db.execute('DELETE FROM portfolio_equity')
            db.execute("INSERT INTO signals VALUES(2, 'DESKTOP', '2026-09-22')")
        history.restore('owner/repo', self.db, desktop=True)
        history.restore('owner/repo', self.db, desktop=True)
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM signals').fetchone()[0], 2)
            self.assertEqual(db.execute('SELECT value FROM portfolio_equity').fetchone()[0], 12345)

    def test_sqlite_backup_includes_live_wal(self):
        with sqlite3.connect(self.db) as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute("INSERT INTO signals VALUES(2, 'WAL', '2026-09-22')")
            db.commit()
            self.save()
        # sqlite3's context manager commits but does not close.
        db.close()
        history.restore('owner/repo', self.db)
        with sqlite3.connect(self.db) as restored:
            self.assertEqual(restored.execute('SELECT count(*) FROM signals').fetchone()[0], 2)


if __name__ == '__main__':
    unittest.main()

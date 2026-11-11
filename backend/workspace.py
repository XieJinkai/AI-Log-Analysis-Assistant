import base64
import json
import sqlite3
from pathlib import Path

from .files import Document, decode_file


class WorkspacePersistence:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def save(self, store, jobs):
        payload = {'version': 1, 'counter': store._counter, 'jobs': jobs,
                   'documents': [{'id': doc.id, 'name': doc.name, 'role': doc.role,
                                  'encoding': doc.encoding, 'content': base64.b64encode(doc.content).decode('ascii')}
                                 for doc in store.documents.values()]}
        try:
            with sqlite3.connect(self.path) as db:
                db.execute('CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)')
                db.execute('INSERT OR REPLACE INTO workspace VALUES (1, ?)', (json.dumps(payload, ensure_ascii=False),))
        except (sqlite3.Error, OSError) as exc:
            raise ValueError('本地缓存保存失败，原有缓存未被清空。请检查磁盘空间及写入权限。') from exc

    def load(self, store):
        if not self.path.exists():
            return {}
        try:
            with sqlite3.connect(self.path) as db:
                row = db.execute('SELECT payload FROM workspace WHERE id=1').fetchone()
            if not row:
                raise ValueError('empty workspace')
            data = json.loads(row[0])
            if data['version'] != 1:
                raise ValueError('unsupported workspace')
            documents = {}
            for item in data['documents']:
                content = base64.b64decode(item['content'], validate=True)
                text, encoding = decode_file(content, item['encoding'])
                documents[item['id']] = Document(item['id'], item['name'], item['role'], encoding, content, text.splitlines())
            jobs = data['jobs']
            for job in jobs.values():
                for field in ('sources', 'original_sources'):
                    for source in job[field].values():
                        source['lines'] = {int(k): v for k, v in source['lines'].items()}
                if job['state'] in ('preparing', 'analyzing', 'repairing', 'validating'):
                    job.update(state='failed', error='服务中断，分析未完成；未自动重新发送云端。')
                chat = job.get('chat', {})
                if chat.get('state') == 'answering':
                    chat.update(state='failed', error='服务中断，追问未完成；已保留此前记录。')
                    for turn in chat['turns']:
                        if turn['state'] == 'answering':
                            turn.update(state='failed', error=chat['error'], answer=None)
            store.documents, store._counter = documents, data['counter']
            return jobs
        except (sqlite3.Error, OSError, ValueError, KeyError, TypeError) as exc:
            raise ValueError('本地缓存无法读取，已保留原文件；请备份后检查，程序不会自动清空。') from exc

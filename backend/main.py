import asyncio
import mimetypes
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from dotenv import dotenv_values
from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import Field

from .files import FileStore
from .models import AnalysisRequest, Model
from .provider import DeepSeekClient, ProviderError
from .service import prepare, run_analysis
from .chat import empty_chat, install_chat_routes
from .workspace import WorkspacePersistence


ROOT = Path(__file__).resolve().parent.parent

# Windows registry MIME entries can otherwise mark JavaScript as plain text.
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')


class SettingsUpdate(Model):
    api_key: str | None = Field(default=None, max_length=250)
    model: str | None = Field(default=None, pattern=r'^[a-zA-Z0-9._-]{1,80}$')
    context_tokens: int | None = Field(default=None, ge=16000, le=2_000_000)
    output_tokens: int | None = Field(default=None, ge=1024, le=384000)


class EncodingUpdate(Model):
    encoding: str


def create_app(env_file=ROOT / '.env', provider_factory=DeepSeekClient, state_path=None) -> FastAPI:
    key = (dotenv_values(env_file).get('DEEPSEEK_API_KEY') if env_file else None) or os.environ.get('DEEPSEEK_API_KEY', '')
    config = {'api_key': key, 'model': 'deepseek-flash', 'context_tokens': 1_000_000,
              'output_tokens': 16384, 'revision': 1}
    workspace_token = secrets.token_urlsafe(32)
    store = FileStore()
    persistence = WorkspacePersistence(state_path) if state_path else None
    jobs = persistence.load(store) if persistence else {}
    active_tasks = {}
    active_chats = {}

    def persist(candidate=None):
        if persistence:
            persistence.save(store, jobs if candidate is None else candidate)

    @asynccontextmanager
    async def lifespan(app):
        yield
        running = [*active_tasks.values(), *active_chats.values()]
        for task in running:
            task.cancel()
        await asyncio.gather(*running, return_exceptions=True)

    app = FastAPI(title='日志智能识别系统', docs_url=None, redoc_url=None, lifespan=lifespan)

    @app.middleware('http')
    async def protect_workspace(request: Request, call_next):
        host = request.url.hostname
        origin = request.headers.get('origin')
        if host not in ('127.0.0.1', 'localhost'):
            return JSONResponse({'message': '只允许本机访问。'}, status_code=403)
        if origin:
            parsed = urlparse(origin)
            if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.netloc != request.url.netloc:
                return JSONResponse({'message': '拒绝跨来源访问本地资料。'}, status_code=403)
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            if not secrets.compare_digest(request.headers.get('x-workspace-token', ''), workspace_token):
                return JSONResponse({'message': '工作区会话无效，请刷新页面。'}, status_code=403)
        length = request.headers.get('content-length', '0')
        if length.isdigit() and int(length) > 21 * 1024**2:
            return JSONResponse({'message': '上传请求超过大小限制。'}, status_code=413)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        return response

    @app.exception_handler(ValueError)
    async def bad_input(request, error):
        return JSONResponse({'message': str(error), 'code': 'input'}, status_code=400)

    @app.exception_handler(ProviderError)
    async def provider_error(request, error):
        return JSONResponse({'message': str(error), 'code': error.code}, status_code=502)

    @app.exception_handler(RequestValidationError)
    async def invalid_parameters(request, error):
        fields = sorted({'.'.join(str(part) for part in item['loc']) for item in error.errors()})
        return JSONResponse({'message': '请求参数无效，请检查：' + ', '.join(fields), 'code': 'validation'}, status_code=422)

    def public_config():
        return {k: v for k, v in config.items() if k != 'api_key'} | {
            'key_configured': bool(config['api_key']), 'workspace_token': workspace_token}

    @app.get('/api/config')
    async def get_config():
        return public_config()

    @app.put('/api/config')
    async def update_config(update: SettingsUpdate):
        values = update.model_dump(exclude_none=True)
        proposed = config | values
        if proposed['output_tokens'] >= proposed['context_tokens']:
            raise ValueError('输出预算必须小于上下文预算。')
        if proposed['api_key'] and any(c.isspace() for c in proposed['api_key']):
            raise ValueError('API Key 不能包含空白字符。')
        config.update(values)
        config['revision'] += 1
        return public_config()

    @app.post('/api/config/test')
    async def test_connection():
        models = await provider_factory(config['api_key']).models()
        return {'models': models, 'selected_available': config['model'] in models}

    @app.get('/api/files')
    async def list_files():
        return [doc.metadata() for doc in store.documents.values()]

    def assert_editable():
        if active_tasks:
            raise ValueError('分析正在进行，请先取消或等待完成后修改资料。')

    @app.post('/api/files')
    async def add_file(file: UploadFile = File(...), role: str = Form(...), encoding: str = Form('auto')):
        assert_editable()
        content = await file.read(store.max_file_bytes + 1)
        await file.close()
        doc = store.add(file.filename or 'unnamed.txt', content, role, None if encoding == 'auto' else encoding)
        try:
            persist()
        except ValueError:
            del store.documents[doc.id]
            raise
        return doc.metadata()

    @app.delete('/api/files/{file_id}')
    async def remove_file(file_id: str):
        assert_editable()
        doc = store.get(file_id)
        del store.documents[file_id]
        try:
            persist()
        except ValueError:
            store.documents[file_id] = doc
            raise
        return {'removed': True}

    @app.put('/api/files/{file_id}/encoding')
    async def reencode(file_id: str, update: EncodingUpdate):
        assert_editable()
        doc = store.get(file_id)
        previous = (doc.lines, doc.encoding)
        store.reencode(file_id, update.encoding)
        try:
            persist()
        except ValueError:
            doc.lines, doc.encoding = previous
            raise
        return doc.metadata()

    @app.get('/api/files/{file_id}/lines')
    async def file_lines(file_id: str, start: int = Query(1, ge=1), limit: int = Query(100, ge=1, le=200)):
        doc = store.get(file_id)
        if start > len(doc.lines):
            raise ValueError('起始行超过文件范围。')
        selected = doc.select(start, min(len(doc.lines), start + limit - 1))
        return {'name': doc.name, 'total_lines': len(doc.lines),
                'lines': [{'number': number, 'text': line} for number, line in selected]}

    @app.get('/api/files/{file_id}/reference')
    async def reference_text(file_id: str):
        doc = store.get(file_id)
        if doc.role != 'reference':
            raise ValueError('所选文件不是时序参考。')
        text = '\n'.join(doc.lines)
        if len(text) > 200000:
            raise ValueError('参考文本超过图形预览大小限制，仍可选择范围参与 AI 分析。')
        return {'text': text}

    def prepare_request(body):
        return prepare(store, body.selections, config['context_tokens'], config['output_tokens'], body.custom_secrets, body.instructions)

    @app.post('/api/preview')
    async def preview(body: AnalysisRequest):
        prepared = prepare_request(body)
        return {'coverage': prepared.coverage, 'sources': prepared.sources,
                'estimated_tokens': prepared.estimated_tokens, 'redaction_count': prepared.redaction_count,
                'output_tokens': config['output_tokens'], 'context_tokens': config['context_tokens']}

    async def execute(job_id, prepared, snapshot):
        job = jobs[job_id]
        try:
            def stage(value):
                job['state'] = value
            client = provider_factory(snapshot['api_key'])
            result = await run_analysis(prepared, client.complete, snapshot['model'], snapshot['output_tokens'], stage)
            job['result'] = result
            job['state'] = result['state']
        except asyncio.CancelledError:
            job['state'] = 'cancelled'
        except ProviderError as error:
            job.update(state='failed', error=str(error), error_code=error.code)
        except Exception:
            job.update(state='failed', error='本地分析处理失败，未生成有效报告。', error_code='internal')
        finally:
            active_tasks.pop(job_id, None)
            try:
                persist()
            except ValueError as error:
                job['error'] = str(error)

    @app.post('/api/analyses')
    async def start_analysis(body: AnalysisRequest):
        if not body.consent:
            raise ValueError('请先确认将所选脱敏资料发送至 DeepSeek 云端。')
        if active_tasks:
            raise ValueError('已有分析正在运行。')
        if active_chats:
            raise ValueError('追问正在进行，请先等待完成或停止回答。')
        if not config['api_key']:
            raise ValueError('请先配置 DeepSeek API Key。')
        prepared = prepare_request(body)
        candidate = {key: {**value, 'chat': empty_chat()} for key, value in jobs.items()}
        while len(candidate) >= 5:
            candidate.pop(next(iter(candidate)))
        job_id = uuid4().hex
        snapshot = config.copy()
        candidate[job_id] = {'id': job_id, 'state': 'preparing', 'revision': snapshot['revision'],
                        'result': None, 'error': None, 'coverage': prepared.coverage, 'sources': prepared.sources,
                        'analysis_focus': prepared.instructions, 'custom_secrets': body.custom_secrets,
                        'chat': empty_chat(),
                        'original_sources': {selection.file_id: {
                            'name': store.get(selection.file_id).name,
                            'lines': dict(store.get(selection.file_id).select(selection.start_line, selection.end_line)),
                        } for selection in body.selections}}
        persist(candidate)
        jobs.clear()
        jobs.update(candidate)
        active_tasks[job_id] = asyncio.create_task(execute(job_id, prepared, snapshot))
        return {'id': job_id}

    def get_job(job_id):
        if job_id not in jobs:
            raise ValueError('分析不存在或已超出最近五次保留范围。')
        return jobs[job_id]

    @app.get('/api/analyses')
    async def list_analyses():
        return [{'id': job['id'], 'state': job['state'], 'revision': job['revision']} for job in reversed(list(jobs.values()))]

    @app.get('/api/analyses/{job_id}')
    async def get_analysis(job_id: str):
        job = get_job(job_id)
        return {k: v for k, v in job.items() if k not in ('sources', 'original_sources', 'custom_secrets', 'analysis_focus', 'chat')} | {'stale_config': job['revision'] != config['revision']}

    @app.post('/api/analyses/{job_id}/cancel')
    async def cancel_analysis(job_id: str):
        job = get_job(job_id)
        task = active_tasks.get(job_id)
        if task:
            job['state'] = 'cancelled'
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            active_tasks.pop(job_id, None)
        persist()
        return {'state': job['state']}

    @app.get('/api/analyses/{job_id}/evidence')
    async def job_evidence(job_id: str, file_id: str, start: int = Query(1, ge=1), limit: int = Query(100, ge=1, le=200), original: bool = False):
        job = get_job(job_id)
        source = job['original_sources' if original else 'sources'].get(file_id)
        if not source:
            raise ValueError('文件不在本次分析覆盖范围。')
        rows = [{'number': number, 'text': line} for number, line in source['lines'].items() if start <= number < start + limit]
        return {'name': source['name'], 'lines': rows, 'first_line': min(source['lines']),
                'total_lines': max(source['lines']), 'redacted': not original}

    @app.get('/api/analyses/{job_id}/export')
    async def export(job_id: str):
        job = get_job(job_id)
        if not job['result']:
            raise ValueError('本次分析尚无可导出的有效结果。')
        return Response(job['result']['markdown'], media_type='text/markdown; charset=utf-8',
                        headers={'Content-Disposition': 'attachment; filename="log-analysis.md"'})

    active_chats = install_chat_routes(app, config, get_job, persist, active_tasks, provider_factory)

    dist = ROOT / 'frontend' / 'dist'
    if dist.is_dir():
        app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')

    @app.get('/')
    async def index():
        if not (dist / 'index.html').exists():
            return JSONResponse({'message': '前端尚未构建，请先构建 frontend。'}, status_code=503)
        return FileResponse(dist / 'index.html')

    return app


app = create_app(state_path=ROOT / 'artifacts' / 'workspace.sqlite3')

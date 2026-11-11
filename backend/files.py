import re
from dataclasses import dataclass
from pathlib import PureWindowsPath
from typing import Literal


Role = Literal['reference', 'normal', 'suspect']


def decode_file(content: bytes, encoding: str | None = None) -> tuple[str, str]:
    if not content:
        raise ValueError('文件为空，不能分析。')
    if content.startswith(b'%TSD-Header-###%') or b'\x00' in content[:8192]:
        raise ValueError('文件不是可读纯文本，可能是二进制或受保护内容。请导出纯文本版本。')
    if encoding not in (None, 'utf-8-sig', 'utf-8', 'gb18030'):
        raise ValueError('不支持此编码。')
    for candidate in ([encoding] if encoding else ['utf-8-sig', 'gb18030']):
        try:
            text = content.decode(candidate, errors='strict')
        except UnicodeDecodeError:
            continue
        if not text.strip():
            raise ValueError('文件没有可分析的文本。')
        controls = sum(ord(c) < 32 and c not in '\r\n\t' for c in text)
        if controls / len(text) > 0.005:
            raise ValueError('文件包含过多非文本控制字符。')
        return text, candidate
    raise ValueError('无法按所选编码读取，请确认 UTF-8 或 GB18030 编码。')


@dataclass
class Document:
    id: str
    name: str
    role: Role
    encoding: str
    content: bytes
    lines: list[str]

    def select(self, start: int = 1, end: int | None = None) -> list[tuple[int, str]]:
        end = len(self.lines) if end is None else end
        if start < 1 or end < start or end > len(self.lines):
            raise ValueError(f'{self.name} 的行范围无效，请选择 1 至 {len(self.lines)} 行。')
        return list(enumerate(self.lines[start - 1:end], start))

    def metadata(self) -> dict:
        return {'id': self.id, 'name': self.name, 'role': self.role, 'encoding': self.encoding,
                'bytes': len(self.content), 'line_count': len(self.lines)}


class FileStore:
    def __init__(self, max_file_bytes=20 * 1024**2, max_total_bytes=50 * 1024**2, max_group_files=20):
        self.documents: dict[str, Document] = {}
        self.max_file_bytes = max_file_bytes
        self.max_total_bytes = max_total_bytes
        self.max_group_files = max_group_files
        self._counter = 0

    def add(self, name: str, content: bytes, role: Role, encoding: str | None = None) -> Document:
        if role not in ('reference', 'normal', 'suspect'):
            raise ValueError('文件角色无效。')
        name = PureWindowsPath(name).name
        name = re.sub(r'[\x00-\x1f\x7f]', '_', name)[:180]
        allowed = {'.md', '.txt'} if role == 'reference' else {'.log', '.txt'}
        if PureWindowsPath(name).suffix.lower() not in allowed:
            raise ValueError('时序说明支持 .md/.txt，日志支持 .log/.txt。')
        if len(content) > self.max_file_bytes:
            raise ValueError('单个文件超过 20 MiB 导入上限。')
        if sum(len(d.content) for d in self.documents.values()) + len(content) > self.max_total_bytes:
            raise ValueError('文件总量超过 50 MiB，请移除不需要的文件。')
        limit = 1 if role == 'reference' else self.max_group_files
        if sum(d.role == role for d in self.documents.values()) >= limit:
            raise ValueError('该组文件数量已达到上限。')
        text, actual_encoding = decode_file(content, encoding)
        self._counter += 1
        document = Document(f'f{self._counter}', name, role, actual_encoding, content, text.splitlines())
        self.documents[document.id] = document
        return document

    def get(self, file_id: str) -> Document:
        if file_id not in self.documents:
            raise ValueError('文件不存在，可能已被移除或服务已重启。')
        return self.documents[file_id]

    def reencode(self, file_id: str, encoding: str) -> Document:
        doc = self.get(file_id)
        text, actual = decode_file(doc.content, encoding)
        doc.lines, doc.encoding = text.splitlines(), actual
        return doc

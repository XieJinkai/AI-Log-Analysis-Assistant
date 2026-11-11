import hashlib
import re


class Redactor:
    def __init__(self, custom_secrets: list[str] | None = None):
        self.custom_secrets = sorted(set(custom_secrets or []), key=len, reverse=True)
        if any(not value or '\n' in value or '\r' in value or len(value) > 2000 for value in self.custom_secrets):
            raise ValueError('自定义脱敏项必须是非空单行文本，最多 2000 字符。')
        self.mapping: dict[str, str] = {}

    def token(self, value: str, prefix: str) -> str:
        if value not in self.mapping:
            digest = hashlib.sha256(value.encode()).hexdigest()[:12]
            self.mapping[value] = f'[{prefix}_{digest}]'
        return self.mapping[value]

    def redact(self, text: str) -> str:
        for value in self.custom_secrets:
            text = text.replace(value, self.token(value, 'PRIVATE'))
        patterns = [
            (r'\bsk-[A-Za-z0-9_-]{16,}\b', 'KEY'),
            (r'(?i)(?<=Bearer )[A-Za-z0-9._~+/-]{12,}={0,2}', 'TOKEN'),
            (r'(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])', 'IP'),
            (r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'EMAIL'),
        ]
        for pattern, prefix in patterns:
            text = re.sub(pattern, lambda match: self.token(match.group(), prefix), text)
        return text

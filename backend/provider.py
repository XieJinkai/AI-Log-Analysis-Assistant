import httpx


class ProviderError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class DeepSeekClient:
    def __init__(self, key: str, client: httpx.AsyncClient | None = None):
        self.key = key
        self.client = client

    async def request(self, method: str, path: str, body: dict | None = None):
        if not self.key:
            raise ProviderError('authentication', '请先配置 DeepSeek API Key。')
        try:
            if self.client:
                response = await self.client.request(method, 'https://api.deepseek.com' + path,
                    headers={'Authorization': 'Bearer ' + self.key}, json=body)
            else:
                async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=20), trust_env=False) as client:
                    response = await client.request(method, 'https://api.deepseek.com' + path,
                        headers={'Authorization': 'Bearer ' + self.key}, json=body)
        except httpx.TimeoutException as exc:
            raise ProviderError('timeout', 'DeepSeek 请求超时，尚未取得完整结果。') from exc
        except httpx.RequestError as exc:
            raise ProviderError('network', '无法连接 DeepSeek，请检查网络后手动重试。') from exc
        if response.status_code >= 400:
            code, message = {
                401: ('authentication', 'DeepSeek 鉴权失败，请检查密钥。'),
                402: ('balance', 'DeepSeek 账户余额不足。'),
                403: ('authentication', 'DeepSeek 拒绝访问，请检查账户权限。'),
                429: ('rate_limit', 'DeepSeek 请求限流，请稍后手动重试。'),
                400: ('invalid_request', 'DeepSeek 拒绝请求，请检查模型及上下文和输出预算。'),
                422: ('invalid_request', 'DeepSeek 请求参数无效。'),
            }.get(response.status_code, ('provider', 'DeepSeek 服务端错误，请稍后手动重试。'))
            if response.status_code in (400, 422) and any(s in response.text.lower() for s in ('context', 'maximum context', 'token limit')):
                code, message = 'context', '所选资料超出模型上下文，请缩小范围后重新分析。'
            raise ProviderError(code, message)
        try:
            return response.json()
        except ValueError as exc:
            raise ProviderError('format', 'DeepSeek 返回了不可读取的响应。') from exc

    async def models(self) -> list[str]:
        data = await self.request('GET', '/models')
        return [item['id'] for item in data.get('data', []) if isinstance(item.get('id'), str)]

    async def complete(self, messages: list, model: str, output_tokens: int):
        data = await self.request('POST', '/chat/completions', {
            'model': model, 'messages': messages, 'max_tokens': output_tokens,
            'response_format': {'type': 'json_object'}, 'thinking': {'type': 'disabled'}, 'stream': False,
        })
        try:
            choice = data['choices'][0]
            if choice['finish_reason'] == 'length':
                raise ProviderError('truncated', '模型输出被截断，不能作为完整分析；请缩小资料或增加输出预算。')
            if choice['finish_reason'] != 'stop':
                raise ProviderError('format', '模型没有正常结束输出，未生成有效报告。')
            content = choice['message']['content']
            if not isinstance(content, str) or not content.strip():
                raise ProviderError('format', '模型没有返回分析正文。')
            return content, data.get('usage', {})
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError('format', '模型响应缺少必要的结果字段。') from exc

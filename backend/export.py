import html
import re

from .models import Event, Report


def label(value: str) -> str:
    return re.sub(r'[\x00-\x1f\x7f<>\[\]{}();"`#&|\\:]', ' ', value).strip()[:360] or '未标明'


def build_diagram(report: Report, task_id: str) -> str:
    events = [event for event in report.events if event.task_id == task_id]
    lines = ['sequenceDiagram', '    autonumber']
    participants = {}
    for event in events:
        for actor in (event.source or '未知来源', event.target or event.source or '未知来源'):
            if actor not in participants:
                participants[actor] = f'P{len(participants) + 1}'
                lines.append(f'    participant {participants[actor]} as {label(actor)}')
    for event in events:
        source = participants[event.source or '未知来源']
        target = participants[event.target or event.source or '未知来源']
        description = label(f'{event.id} {event.timestamp} {event.description}')
        if event.kind != 'observed':
            prefix = '预期未观察到' if event.kind == 'expected' else '推测关联'
            lines.append(f'    Note over {source}: {prefix} {description}')
        elif source == target:
            lines.append(f'    Note over {source}: {description}')
        else:
            lines.append(f'    {source}->>{target}: {description}')
    if not events:
        lines.extend(['    participant P1 as 日志', '    Note over P1: 没有通过证据校验的事件'])
    return '\n'.join(lines)


def build_reference_diagram(report: Report) -> str:
    if not report.reference_steps:
        return ''
    events = [Event(id=step.id, task_id='reference', source=step.source, target=step.target,
                    description=step.description, kind='observed', evidence=step.evidence)
              for step in report.reference_steps]
    reference = report.model_copy(update={'events': events})
    return build_diagram(reference, 'reference')


def text(value: str) -> str:
    return html.escape(value).replace('`', '&#96;')


def fenced(value: str, language='text') -> str:
    count = max([len(match.group()) for match in re.finditer(r'`+', value)] + [2]) + 1
    fence = '`' * count
    return f'{fence}{language}\n{value}\n{fence}'


def markdown_report(report: Report, coverage: list, config: dict, issues: list, analyzed_at: str) -> str:
    states = {'confirmed': '发现异常', 'suspected': '发现疑点', 'no_confirmed': '未发现可确认异常', 'insufficient': '证据不足'}
    lines = ['# 日志时序分析报告', '', f'分析时间：{text(analyzed_at)}',
             f'模型：{text(config.get("model", ""))}', f'结论：{states[report.status]}', '',
             text(report.summary), '', '> 引用可追溯不代表推测已经证实；本报告仅覆盖所选资料。', '', '## 分析覆盖范围', '']
    names = {source['file_id']: source['name'] for source in coverage}
    for source in coverage:
        lines.append(f'- {text(source["name"])}：L{source["start_line"]}-L{source["end_line"]}，未发送 {source["excluded_lines"]} 行')
    if issues:
        lines.extend(['', '## 输出不完整', *[f'- {text(issue)}' for issue in issues]])
    lines.extend(['', '## 参考流程', text(report.reference_flow)])
    if report.reference_steps:
        lines.extend(['', '### 参考时序图', '> 基于正常参考重建，不代表待检测日志中实际发生。',
                      fenced(build_reference_diagram(report), 'mermaid')])
        for step in report.reference_steps:
            lines.append(f'\n{text(step.id)}：{text(step.description)}')
            for evidence in step.evidence:
                lines.extend([f'{text(names.get(evidence.file_id, evidence.file_id))} L{evidence.start_line}-L{evidence.end_line}', fenced(evidence.quote)])
    if report.reference_conflicts:
        lines.extend(['', '### 参考冲突', *[f'- {text(item)}' for item in report.reference_conflicts]])
    for task in report.tasks:
        lines.extend(['', f'## {text(task.title)}', f'关联依据：{text(task.correlation_basis)}', '',
                      fenced(build_diagram(report, task.id), 'mermaid'), '', '### 事件与证据'])
        for event in [e for e in report.events if e.task_id == task.id]:
            lines.append(f'\n#### {text(event.id)} · {text(event.timestamp)} · {text(event.kind)}\n{text(event.description)}')
            for evidence in event.evidence:
                lines.extend([f'{text(names.get(evidence.file_id, evidence.file_id))} L{evidence.start_line}-L{evidence.end_line}', fenced(evidence.quote)])
        for finding in [f for f in report.findings if f.task_id == task.id]:
            severity = '已观察异常' if finding.severity == 'confirmed' else '疑似异常'
            lines.extend(['', f'### {text(finding.id)} · {severity} · {text(finding.title)}',
                          f'关联事件：{text(", ".join(finding.event_ids)) or "未确定具体事件"}',
                          f'观察事实：{text(finding.observation)}', f'预期行为：{text(finding.expected)}',
                          f'预期依据：{text(finding.expected_basis)}', f'原因推测：{text(finding.cause)}',
                          f'推测依据：{text(finding.cause_basis)}', f'不确定性：{text(finding.uncertainty)}',
                          *[f'- 建议核查：{text(check)}' for check in finding.checks]])
            for evidence in finding.evidence:
                lines.extend([f'{text(names.get(evidence.file_id, evidence.file_id))} L{evidence.start_line}-L{evidence.end_line}', fenced(evidence.quote)])
    lines.extend(['', '## 局限与未关联记录', *[f'- {text(item)}' for item in report.limitations + report.unmatched_records], ''])
    return '\n'.join(lines)

from collections import Counter
from dataclasses import dataclass

from .models import Report


@dataclass
class ValidationResult:
    report: Report
    issues: list[str]


def validate_report(report: Report, sources: dict) -> ValidationResult:
    report = report.model_copy(deep=True)
    issues = []

    def valid(item, label):
        if not item.evidence:
            issues.append(f'{label} {item.id} 缺少证据引用。')
            return False
        for evidence in item.evidence:
            if not evidence.quote.strip():
                issues.append(f'{label} {item.id} 引文不能只有空白。')
                return False
            source = sources.get(evidence.file_id)
            if not source or evidence.end_line < evidence.start_line:
                issues.append(f'{label} {item.id} 引用的文件或范围无效。')
                return False
            lines = source['lines']
            if evidence.end_line - evidence.start_line > 1000 or any(
                line not in lines for line in range(evidence.start_line, evidence.end_line + 1)
            ):
                issues.append(f'{label} {item.id} 引用了未发送的日志行。')
                return False
            actual = '\n'.join(lines[line] for line in range(evidence.start_line, evidence.end_line + 1))
            if evidence.quote not in actual:
                issues.append(f'{label} {item.id} 引文与已发送内容不一致。')
                return False
        return True

    for field in ('tasks', 'events', 'findings', 'reference_steps'):
        items = getattr(report, field)
        counts = Counter(item.id for item in items)
        kept = []
        for item in items:
            if counts[item.id] > 1:
                issues.append(f'{field} 存在重复编号 {item.id}，相关条目已隔离。')
            elif valid(item, field):
                if field == 'reference_steps' and any(sources[e.file_id]['role'] not in ('normal', 'reference') for e in item.evidence):
                    issues.append(f'参考步骤 {item.id} 不能仅以待检测日志作为正常依据。')
                else:
                    kept.append(item)
        setattr(report, field, kept)
    tasks = {task.id for task in report.tasks}
    events = []
    for event in report.events:
        if event.task_id not in tasks:
            issues.append(f'事件 {event.id} 缺少有效任务关联。')
        else:
            events.append(event)
    report.events = events
    event_tasks = {event.id: event.task_id for event in events}
    findings = []
    for finding in report.findings:
        if finding.task_id not in tasks or any(event_tasks.get(event_id) != finding.task_id for event_id in finding.event_ids):
            issues.append(f'异常 {finding.id} 关联了无效任务或事件。')
            continue
        if not finding.cause.strip() or not finding.cause_basis.strip():
            finding.cause = '无法根据现有日志推断原因'
            finding.cause_basis = ''
        if finding.severity == 'suspected' and not finding.uncertainty.strip():
            issues.append(f'疑似异常 {finding.id} 未说明不确定性。')
            continue
        findings.append(finding)
    report.findings = findings
    if issues:
        report.summary = '部分模型输出未通过证据或关联校验，已隔离无效条目；不能据此确认完整结论。'
        report.status = 'insufficient'
        report.reference_flow = '本次结果不完整，参考流程解释也需人工复核。'
        report.reference_conflicts = []
        report.unmatched_records = []
        report.limitations = ['输出完整性校验未通过，以下仅展示通过校验的部分。']
    elif findings:
        report.status = 'confirmed' if any(f.severity == 'confirmed' for f in findings) else 'suspected'
    elif report.status in ('confirmed', 'suspected'):
        report.status = 'insufficient'
        report.limitations.append('模型未提供支撑总体异常结论的有效异常条目。')
    return ValidationResult(report, issues)

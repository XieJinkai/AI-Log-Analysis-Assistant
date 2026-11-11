from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Selection(Model):
    file_id: str
    start_line: int = Field(default=1, ge=1)
    end_line: int | None = Field(default=None, ge=1)


class Evidence(Model):
    file_id: str
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=20000)


class Task(Model):
    id: str = Field(min_length=1, max_length=150)
    title: str
    correlation_basis: str
    evidence: list[Evidence]


class Event(Model):
    id: str = Field(min_length=1, max_length=80)
    task_id: str
    timestamp: str = ''
    source: str
    target: str
    description: str
    kind: Literal['observed', 'expected', 'inferred']
    evidence: list[Evidence]


class Finding(Model):
    id: str = Field(min_length=1, max_length=80)
    task_id: str
    title: str
    category: str
    severity: Literal['confirmed', 'suspected']
    observation: str
    expected: str
    expected_basis: str
    cause: str
    cause_basis: str = ''
    uncertainty: str
    checks: list[str]
    event_ids: list[str]
    evidence: list[Evidence]


class ReferenceStep(Model):
    id: str = Field(min_length=1, max_length=80)
    source: str
    target: str
    description: str
    evidence: list[Evidence]


class Report(Model):
    status: Literal['confirmed', 'suspected', 'no_confirmed', 'insufficient']
    summary: str
    reference_flow: str
    reference_steps: list[ReferenceStep] = Field(default_factory=list, max_length=500)
    reference_conflicts: list[str]
    limitations: list[str]
    unmatched_records: list[str]
    tasks: list[Task] = Field(max_length=200)
    events: list[Event] = Field(max_length=3000)
    findings: list[Finding] = Field(max_length=1000)


class AnalysisRequest(Model):
    selections: list[Selection] = Field(min_length=1, max_length=41)
    custom_secrets: list[str] = Field(default_factory=list, max_length=100)
    instructions: str = Field(default='', max_length=4000)
    consent: bool = False


class ChatRequest(Model):
    question: str = Field(min_length=1, max_length=8000)
    consent: bool = False


class ChatAnswer(Model):
    status: Literal['supported', 'insufficient']
    answer: str = Field(min_length=1, max_length=30000)
    evidence: list[Evidence] = Field(max_length=100)
    uncertainty: str = Field(max_length=10000)
    checks: list[str] = Field(max_length=100)

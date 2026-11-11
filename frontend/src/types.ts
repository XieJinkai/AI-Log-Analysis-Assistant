export type Role = 'reference' | 'normal' | 'suspect'
export interface Document { id: string; name: string; role: Role; encoding: string; bytes: number; line_count: number }
export interface Config { model: string; context_tokens: number; output_tokens: number; revision: number; key_configured: boolean; workspace_token: string }
export interface Evidence { file_id: string; start_line: number; end_line: number; quote: string }
export interface Task { id: string; title: string; correlation_basis: string; evidence: Evidence[] }
export interface Event { id: string; task_id: string; timestamp: string; source: string; target: string; description: string; kind: 'observed' | 'expected' | 'inferred'; evidence: Evidence[] }
export interface Finding { id: string; task_id: string; title: string; category: string; severity: 'confirmed' | 'suspected'; observation: string; expected: string; expected_basis: string; cause: string; cause_basis: string; uncertainty: string; checks: string[]; event_ids: string[]; evidence: Evidence[] }
export interface Report { status: 'confirmed' | 'suspected' | 'no_confirmed' | 'insufficient'; summary: string; reference_flow: string; reference_conflicts: string[]; limitations: string[]; unmatched_records: string[]; tasks: Task[]; events: Event[]; findings: Finding[] }
export interface Coverage { file_id: string; name: string; role: Role; start_line: number; end_line: number; total_lines: number; excluded_lines: number; encoding?: string }
export interface Result { report: Report; issues: string[]; coverage: Coverage[]; config: { model: string; context_tokens: number; output_tokens: number }; analyzed_at: string; usage: Record<string, number>; diagrams: Record<string, string>; reference_diagram?: string; markdown: string }
export interface Job { id: string; state: string; revision: number; stale_config: boolean; result: Result | null; error: string | null; error_code?: string }
export interface LinePage { name: string; first_line?: number; total_lines: number; lines: { number: number; text: string }[]; redacted?: boolean }
export interface Preview { coverage: Coverage[]; sources: Record<string, { name: string; role: Role; lines: Record<string, string> }>; estimated_tokens: number; redaction_count: number; output_tokens: number; context_tokens: number }
export interface ChatAnswer { status: 'supported' | 'insufficient'; answer: string; evidence: Evidence[]; uncertainty: string; checks: string[] }
export interface ChatTurn { id: string; question: string; answer: ChatAnswer | null; state: string; model: string; created_at: string; error?: string }
export interface ChatState { state: string; turns: ChatTurn[]; error: string | null }

/**
 * Debug Adapter Protocol — only the types Lumen uses.
 * https://microsoft.github.io/debug-adapter-protocol/specification
 */

export interface DapRequest {
  seq: number
  type: 'request'
  command: string
  arguments?: unknown
}

export interface DapResponse {
  seq: number
  type: 'response'
  request_seq: number
  success: boolean
  command: string
  message?: string
  body?: unknown
}

export interface DapEvent {
  seq: number
  type: 'event'
  event: string
  body?: unknown
}

export type DapMessage = DapRequest | DapResponse | DapEvent

export interface ExceptionBreakpointsFilter {
  filter: string
  label: string
  description?: string
  default?: boolean
  supportsCondition?: boolean
}

export interface Capabilities {
  supportsConfigurationDoneRequest?: boolean
  supportsFunctionBreakpoints?: boolean
  supportsConditionalBreakpoints?: boolean
  supportsHitConditionalBreakpoints?: boolean
  supportsEvaluateForHovers?: boolean
  exceptionBreakpointFilters?: ExceptionBreakpointsFilter[]
  supportsStepBack?: boolean
  supportsSetVariable?: boolean
  supportsRestartFrame?: boolean
  supportsGotoTargetsRequest?: boolean
  supportsCompletionsRequest?: boolean
  supportsRestartRequest?: boolean
  supportsValueFormattingOptions?: boolean
  supportsExceptionInfoRequest?: boolean
  supportTerminateDebuggee?: boolean
  supportsDelayedStackTraceLoading?: boolean
  supportsLoadedSourcesRequest?: boolean
  supportsLogPoints?: boolean
  supportsTerminateThreadsRequest?: boolean
  supportsSetExpression?: boolean
  supportsTerminateRequest?: boolean
  supportsSingleThreadExecutionRequests?: boolean
  supportsSteppingGranularity?: boolean
  [key: string]: unknown
}

export interface Source {
  name?: string
  path?: string
  sourceReference?: number
  presentationHint?: 'normal' | 'emphasize' | 'deemphasize'
  origin?: string
}

export interface SourceBreakpoint {
  line: number
  column?: number
  condition?: string
  hitCondition?: string
  logMessage?: string
}

export interface Breakpoint {
  id?: number
  verified: boolean
  message?: string
  source?: Source
  line?: number
  column?: number
  endLine?: number
}

export interface Thread {
  id: number
  name: string
}

export interface StackFrame {
  id: number
  name: string
  source?: Source
  line: number
  column: number
  endLine?: number
  endColumn?: number
  presentationHint?: 'normal' | 'label' | 'subtle'
}

export interface Scope {
  name: string
  presentationHint?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
  expensive: boolean
}

export interface Variable {
  name: string
  value: string
  type?: string
  evaluateName?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
  presentationHint?: { kind?: string; attributes?: string[]; visibility?: string }
}

export interface EvaluateResult {
  result: string
  type?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
}

export interface StoppedEventBody {
  reason: string
  description?: string
  threadId?: number
  preserveFocusHint?: boolean
  text?: string
  allThreadsStopped?: boolean
  hitBreakpointIds?: number[]
}

export interface OutputEventBody {
  category?: 'console' | 'important' | 'stdout' | 'stderr' | 'telemetry' | string
  output: string
  group?: 'start' | 'startCollapsed' | 'end'
  variablesReference?: number
  source?: Source
  line?: number
}

export interface RunInTerminalArguments {
  kind?: 'integrated' | 'external'
  title?: string
  cwd: string
  args: string[]
  env?: Record<string, string | null>
  argsCanBeInterpretedByShell?: boolean
}

export interface StartDebuggingArguments {
  configuration: Record<string, unknown>
  request: 'launch' | 'attach'
}

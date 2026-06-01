export type TemplateState = 'DRAFT' | 'PUBLIC' | 'ARCHIVED';
export type DomainType =
  | 'VOID'
  | 'TEXT'
  | 'INTEGER'
  | 'FLOAT'
  | 'BOOLEAN'
  | 'JSON'
  | 'UUID'
  | 'DATE'
  | 'TIMESTAMP';

export interface TemplateResponse {
  id: string;
  name: string;
  state: TemplateState;
  info: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateMetadata {
  [key: string]: unknown;
  displayName?: string;
  location?: string;
  icon?: string;
  criticality?: 'low' | 'medium' | 'high';
  tags?: string[];
  ui?: DashboardUiConfig;
}

export type WidgetWidth = 1 | 2 | 3;
export type VariableDisplay = 'value' | 'status' | 'line' | 'bar' | 'gauge';
export type MethodControl = 'button' | 'toggle' | 'text' | 'number' | 'json';

export interface DashboardUiConfig {
  [key: string]: unknown;
  version: 1;
  widgets: DashboardWidget[];
}

export interface DashboardWidgetBase {
  [key: string]: unknown;
  id: string;
  resourceId: string;
  title?: string;
  width: WidgetWidth;
}

export interface ThresholdRule {
  value: number;
  color: string;
  label?: string;
}

export interface VariableDashboardWidget extends DashboardWidgetBase {
  resourceType: 'variable';
  display: VariableDisplay;
  valuePath?: string;
  unit?: string;
  precision?: number;
  min?: number;
  max?: number;
  color?: string;
  thresholds?: ThresholdRule[];
  trueLabel?: string;
  falseLabel?: string;
  trueColor?: string;
  falseColor?: string;
}

export interface MethodDashboardWidget extends DashboardWidgetBase {
  resourceType: 'method';
  control: MethodControl;
  stateVariableId?: string;
  stateValuePath?: string;
  actionLabel?: string;
  placeholder?: string;
  confirmation?: string;
  onLabel?: string;
  offLabel?: string;
}

export type DashboardWidget = VariableDashboardWidget | MethodDashboardWidget;

export interface VariableResponse {
  id: string;
  templateId: string;
  name: string;
  type: DomainType;
  description?: string | null;
}

export interface MethodResponse {
  id: string;
  templateId: string;
  name: string;
  input: DomainType;
  description?: string | null;
}

export interface CreateTemplatePayload {
  name: string;
  info?: string;
}

export interface UpdateTemplatePayload {
  name?: string;
  state?: TemplateState;
  info?: string;
}

export interface CreateVariablePayload {
  name: string;
  type: DomainType;
  description?: string | null;
}

export interface CreateMethodPayload {
  name: string;
  input: DomainType;
  description?: string | null;
}

export interface IdResponse {
  id: string;
}

export interface CommandField {
  name: string;
  type: DomainType;
}

export interface CommandMethod {
  id: string;
  name: string;
  input: DomainType;
  description?: string | null;
  fields: CommandField[];
}

export function parseTemplateInfo(info: string | null | undefined): TemplateMetadata {
  if (!info) return {};
  try {
    const parsed = JSON.parse(info) as TemplateMetadata;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function valueAtPath(payload: unknown, path = 'value'): unknown {
  if (payload === null || payload === undefined || typeof payload !== 'object') return payload;
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, payload);
}

export function fallbackVariableDisplay(variable: VariableResponse): VariableDisplay {
  return variable.type === 'BOOLEAN' ? 'status' : 'value';
}

export function fallbackMethodControl(method: MethodResponse): MethodControl {
  if (method.input === 'BOOLEAN') return 'toggle';
  if (method.input === 'INTEGER' || method.input === 'FLOAT') return 'number';
  if (method.input === 'JSON') return 'json';
  if (method.input === 'VOID') return 'button';
  return 'text';
}

export function dashboardWidgets(
  metadata: TemplateMetadata,
  variables: VariableResponse[],
  methods: MethodResponse[],
): DashboardWidget[] {
  if (metadata.ui?.version === 1 && Array.isArray(metadata.ui.widgets)) return metadata.ui.widgets;
  return [
    ...variables.map<VariableDashboardWidget>((variable) => ({
      id: `variable-${variable.id}`,
      resourceType: 'variable',
      resourceId: variable.id,
      title: variable.name,
      width: 1,
      display: fallbackVariableDisplay(variable),
      valuePath: 'value',
    })),
    ...methods.map<MethodDashboardWidget>((method) => ({
      id: `method-${method.id}`,
      resourceType: 'method',
      resourceId: method.id,
      title: method.name,
      width: 1,
      control: fallbackMethodControl(method),
    })),
  ];
}

const SAFE_DOT_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const CSS_HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isSafeDotPath(path: string | undefined): boolean {
  return !path || SAFE_DOT_PATH.test(path);
}

export function isHexColor(color: string | undefined): boolean {
  return !color || CSS_HEX_COLOR.test(color);
}

export function sortedThresholds(widget: VariableDashboardWidget): ThresholdRule[] {
  return [...(widget.thresholds || [])].sort((left, right) => left.value - right.value);
}

export function activeThreshold(widget: VariableDashboardWidget, value: number): ThresholdRule | undefined {
  return sortedThresholds(widget).filter((rule) => rule.value <= value).at(-1);
}

export function widgetAccent(widget: VariableDashboardWidget, value: unknown): string {
  const numeric = Number(value);
  return (Number.isFinite(numeric) ? activeThreshold(widget, numeric)?.color : undefined) || widget.color || '#2563eb';
}

export function formatWidgetValue(widget: VariableDashboardWidget, value: unknown, payloadUnit = ''): string {
  if (value === undefined || value === null) return 'No value';
  const formatted =
    typeof value === 'number' && Number.isFinite(value) && widget.precision !== undefined
      ? value.toFixed(widget.precision)
      : String(value);
  const unit = widget.unit || payloadUnit;
  return `${formatted}${unit ? ` ${unit}` : ''}`;
}

export function gaugePercent(widget: VariableDashboardWidget, value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const min = widget.min ?? 0;
  const max = widget.max ?? 100;
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((numeric - min) / (max - min)) * 100));
}

export function variableDisplaysFor(type: DomainType | undefined): VariableDisplay[] {
  if (type === 'BOOLEAN') return ['status', 'value'];
  if (type === 'INTEGER' || type === 'FLOAT') return ['value', 'line', 'bar', 'gauge'];
  return ['value'];
}

export function methodControlsFor(type: DomainType | undefined): MethodControl[] {
  if (type === 'BOOLEAN') return ['toggle', 'button'];
  if (type === 'INTEGER' || type === 'FLOAT') return ['number', 'button'];
  if (type === 'JSON') return ['json', 'button'];
  if (type === 'VOID') return ['button'];
  return ['text', 'button'];
}

export function validateTemplateMetadata(
  metadata: TemplateMetadata,
  variables: VariableResponse[],
  methods: MethodResponse[],
): string[] {
  const errors: string[] = [];
  const widgets = metadata.ui?.version === 1 && Array.isArray(metadata.ui.widgets) ? metadata.ui.widgets : [];
  const variableById = Object.fromEntries(variables.map((variable) => [variable.id, variable]));
  const methodById = Object.fromEntries(methods.map((method) => [method.id, method]));
  const widgetIds = new Set<string>();

  widgets.forEach((widget, index) => {
    const label = widget.title || `Widget ${index + 1}`;
    if (!widget.id || widgetIds.has(widget.id)) errors.push(`${label}: widget id must be unique.`);
    if (widget.id) widgetIds.add(widget.id);
    if (![1, 2, 3].includes(widget.width)) errors.push(`${label}: width must be 1, 2 or 3.`);

    if (widget.resourceType === 'variable') {
      const variable = variableById[widget.resourceId];
      if (variable && !variableDisplaysFor(variable.type).includes(widget.display)) {
        errors.push(`${label}: ${widget.display} is incompatible with ${variable.type}.`);
      }
      if (!isSafeDotPath(widget.valuePath)) errors.push(`${label}: valuePath must be a safe dot-path.`);
      if (widget.precision !== undefined && (!Number.isInteger(widget.precision) || widget.precision < 0 || widget.precision > 6)) {
        errors.push(`${label}: precision must be an integer from 0 to 6.`);
      }
      if (widget.min !== undefined && widget.max !== undefined && widget.min >= widget.max) {
        errors.push(`${label}: min must be lower than max.`);
      }
      if (!isHexColor(widget.color) || !isHexColor(widget.trueColor) || !isHexColor(widget.falseColor)) {
        errors.push(`${label}: colors must use #RGB or #RRGGBB format.`);
      }
      const seenThresholds = new Set<number>();
      (widget.thresholds || []).forEach((rule) => {
        if (!Number.isFinite(rule.value) || seenThresholds.has(rule.value)) errors.push(`${label}: threshold values must be unique numbers.`);
        if (!rule.color || !isHexColor(rule.color)) errors.push(`${label}: threshold colors must use #RGB or #RRGGBB format.`);
        seenThresholds.add(rule.value);
      });
    } else if (widget.resourceType === 'method') {
      const method = methodById[widget.resourceId];
      if (method && !methodControlsFor(method.input).includes(widget.control)) {
        errors.push(`${label}: ${widget.control} is incompatible with ${method.input}.`);
      }
      if (!isSafeDotPath(widget.stateValuePath)) errors.push(`${label}: stateValuePath must be a safe dot-path.`);
      if (widget.control === 'toggle' && widget.stateVariableId) {
        const stateVariable = variableById[widget.stateVariableId];
        if (stateVariable && stateVariable.type !== 'BOOLEAN') errors.push(`${label}: toggle state binding must reference a boolean variable.`);
      }
    } else {
      errors.push(`${label}: resourceType must be variable or method.`);
    }
  });

  return errors;
}

export function templateDisplayName(template: TemplateResponse | undefined): string {
  if (!template) return 'Unknown template';
  return parseTemplateInfo(template.info).displayName || template.name;
}

export function methodFields(method: MethodResponse): CommandField[] {
  if (method.input === 'JSON') {
    return [{ name: 'input', type: 'JSON' }];
  }
  if (method.input === 'VOID') {
    return [];
  }
  return [{ name: 'value', type: method.input }];
}

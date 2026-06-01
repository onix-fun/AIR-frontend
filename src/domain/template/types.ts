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
  displayName?: string;
  location?: string;
  icon?: string;
  criticality?: 'low' | 'medium' | 'high';
  tags?: string[];
}

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

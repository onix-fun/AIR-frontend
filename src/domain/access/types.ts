export interface CollaboratorResponse<Role extends string = string> {
  clientId: string;
  role: Role;
}

export interface CollaboratorsResponse<Role extends string = string> {
  collaborators: CollaboratorResponse<Role>[];
  currentRole?: Role | null;
  canManage: boolean;
}

export type TemplateRole = 'OWNER' | 'EDITOR';

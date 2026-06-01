import type { CommandMethod, MethodResponse } from '@/domain/template/types';
import { methodFields } from '@/domain/template/types';

export function toCommandMethods(methods: MethodResponse[]): CommandMethod[] {
  return methods.map((method) => ({
    id: method.id,
    name: method.name,
    input: method.input,
    description: method.description,
    fields: methodFields(method),
  }));
}

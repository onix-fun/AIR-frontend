import { domainClient } from "@/api/client";
import type {
  ConsumerResponse,
  CreateConsumerPayload,
  CreateConsumerResponse,
  RegenerateTokenResponse,
  CollaboratorsResponse,
  ConsumerRole,
} from "@/domain";

export class DeviceService {
  static async getConsumers(params: { templateId?: string } = {}): Promise<ConsumerResponse[]> {
    const response = await domainClient.get<ConsumerResponse[]>("/consumers", { params });
    return response.data;
  }

  static async createConsumer(payload: CreateConsumerPayload): Promise<CreateConsumerResponse> {
    const response = await domainClient.post<CreateConsumerResponse>("/consumers", payload);
    return response.data;
  }

  static async updateName(consumerId: string, displayName: string): Promise<void> {
    await domainClient.put(`/consumers/${consumerId}/name`, { displayName });
  }

  static async regenerateToken(consumerId: string): Promise<RegenerateTokenResponse> {
    const response = await domainClient.post<RegenerateTokenResponse>(`/consumers/${consumerId}/token/regenerate`);
    return response.data;
  }

  static async grantAccess(consumerId: string, clientId: string, role: string): Promise<void> {
    await domainClient.put(`/consumers/${consumerId}/collaborators/${clientId}`, { role });
  }

  static async getCollaborators(consumerId: string): Promise<CollaboratorsResponse<ConsumerRole>> {
    const response = await domainClient.get<CollaboratorsResponse<ConsumerRole>>(`/consumers/${consumerId}/collaborators`);
    return response.data;
  }

  static async removeCollaborator(consumerId: string, clientId: string): Promise<void> {
    await domainClient.delete(`/consumers/${consumerId}/collaborators/${clientId}`);
  }
}

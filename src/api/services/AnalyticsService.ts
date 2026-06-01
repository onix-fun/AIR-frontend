import { analyticsClient } from '@/api/client';

export interface AnalyticsEventResponse {
  event_id: string;
  stream_id: string;
  source: string;
  action: string;
  occurred_at: string;
  ingested_at: string;
  client_id?: string | null;
  connection_id?: string | null;
  request_id?: string | null;
  consumer_id: string;
  method_name?: string | null;
  variable_name?: string | null;
  status?: string | null;
  status_code?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  payload?: unknown;
  metadata?: unknown;
}

export interface EventsResponse {
  events: AnalyticsEventResponse[];
  next_cursor?: string | null;
}

export interface ActionAggregateResponse {
  action: string;
  count: number;
}

export interface TimeSeriesPointResponse {
  bucket: string;
  count: number;
}

export interface ValueSeriesPointResponse {
  bucket: string;
  avg: number;
  min: number;
  max: number;
}

export interface AnalyticsQuery {
  consumerId?: string;
  methodName?: string;
  variableName?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
  bucket?: 'minute' | 'hour' | 'day';
}

export interface ValueSeriesQuery {
  consumerId: string;
  variableName: string;
  valuePath?: string;
  from?: string;
  to?: string;
  bucket?: 'minute' | 'hour' | 'day';
}

export class AnalyticsService {
  static async health(): Promise<boolean> {
    const response = await analyticsClient.get<{ status: string }>('/health');
    return response.data.status === 'ok';
  }

  static async getEvents(query: AnalyticsQuery): Promise<EventsResponse> {
    const response = await analyticsClient.get<EventsResponse>('/events', { params: query });
    return response.data;
  }

  static async getActionAggregates(query: AnalyticsQuery): Promise<ActionAggregateResponse[]> {
    const response = await analyticsClient.get<{ items?: ActionAggregateResponse[]; aggregates: ActionAggregateResponse[] }>(
      '/aggregates/actions',
      { params: query },
    );
    return response.data.items || response.data.aggregates;
  }

  static async getTimeseries(query: AnalyticsQuery): Promise<TimeSeriesPointResponse[]> {
    const response = await analyticsClient.get<{ items?: TimeSeriesPointResponse[]; points: TimeSeriesPointResponse[] }>(
      '/aggregates/timeseries',
      { params: query },
    );
    return response.data.items || response.data.points;
  }

  static async getValueSeries(query: ValueSeriesQuery): Promise<ValueSeriesPointResponse[]> {
    const response = await analyticsClient.get<{ items?: ValueSeriesPointResponse[]; points: ValueSeriesPointResponse[] }>(
      '/aggregates/values',
      { params: query },
    );
    return response.data.items || response.data.points;
  }
}

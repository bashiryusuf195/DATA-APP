import { apiClient } from './client'
import type {
  PaymentGateway,
  CreatePaymentGatewayInput,
  UpdatePaymentGatewayInput,
} from '@/types'

export const paymentGatewaysApi = {
  list: (): Promise<PaymentGateway[]> =>
    apiClient
      .get<{ success: boolean; data: PaymentGateway[] }>('/admin/payment-gateways')
      .then((r) => r.data.data),

  get: (id: string): Promise<PaymentGateway> =>
    apiClient
      .get<{ success: boolean; data: PaymentGateway }>(`/admin/payment-gateways/${id}`)
      .then((r) => r.data.data),

  create: (body: CreatePaymentGatewayInput): Promise<PaymentGateway> =>
    apiClient
      .post<{ success: boolean; data: PaymentGateway }>('/admin/payment-gateways', body)
      .then((r) => r.data.data),

  update: (id: string, body: UpdatePaymentGatewayInput): Promise<PaymentGateway> =>
    apiClient
      .patch<{ success: boolean; data: PaymentGateway }>(`/admin/payment-gateways/${id}`, body)
      .then((r) => r.data.data),

  setDefault: (id: string): Promise<PaymentGateway> =>
    apiClient
      .post<{ success: boolean; data: PaymentGateway }>(`/admin/payment-gateways/${id}/set-default`)
      .then((r) => r.data.data),

  enable: (id: string): Promise<PaymentGateway> =>
    apiClient
      .post<{ success: boolean; data: PaymentGateway }>(`/admin/payment-gateways/${id}/enable`)
      .then((r) => r.data.data),

  disable: (id: string): Promise<PaymentGateway> =>
    apiClient
      .post<{ success: boolean; data: PaymentGateway }>(`/admin/payment-gateways/${id}/disable`)
      .then((r) => r.data.data),
}

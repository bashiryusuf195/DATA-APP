import { apiClient } from './client'
import type { ApiResponse } from '@/types'

export interface PinStatus {
  pin_set: boolean
  pin_set_at: string | null
  failed_attempts: number
  locked: boolean
  locked_until: string | null
}

export const pinApi = {
  status: (): Promise<PinStatus> =>
    apiClient
      .get<ApiResponse<PinStatus>>('/security/transaction-pin')
      .then((r) => r.data.data),

  setup: (pin: string): Promise<void> =>
    apiClient
      .post('/security/transaction-pin/setup', { pin })
      .then(() => undefined),

  change: (current_pin: string, new_pin: string): Promise<void> =>
    apiClient
      .post('/security/transaction-pin/change', { current_pin, new_pin })
      .then(() => undefined),

  resetRequest: (current_password: string): Promise<{ message: string; reset_token?: string }> =>
    apiClient
      .post<ApiResponse<{ message: string; reset_token?: string }>>(
        '/security/transaction-pin/reset/request',
        { current_password },
      )
      .then((r) => r.data.data),

  resetConfirm: (reset_token: string, new_pin: string): Promise<void> =>
    apiClient
      .post('/security/transaction-pin/reset/confirm', { reset_token, new_pin })
      .then(() => undefined),
}

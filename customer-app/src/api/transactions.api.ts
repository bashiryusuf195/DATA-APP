import { apiClient } from './client'
import type {
  Transaction,
  TransactionListResponse,
  AirtimePurchaseInput,
  DataPurchaseInput,
  ElectricityPurchaseInput,
  CableTvPurchaseInput,
  ExamPinPurchaseInput,
  IdentityVerificationInput,
  ApiResponse,
} from '@/types'

type PurchaseInput =
  | AirtimePurchaseInput
  | DataPurchaseInput
  | ElectricityPurchaseInput
  | CableTvPurchaseInput
  | ExamPinPurchaseInput
  | IdentityVerificationInput

// Backend returns { reference, transaction } — not a bare Transaction.
// The pg driver also returns numeric columns as strings, so amount needs coercion.
type PurchaseResponseData = { reference: string; transaction: Transaction }

async function purchase(endpoint: string, body: PurchaseInput): Promise<Transaction> {
  const key = crypto.randomUUID()
  const r = await apiClient.post<ApiResponse<PurchaseResponseData>>(
    `/transactions/${endpoint}`,
    body,
    { headers: { 'Idempotency-Key': key } }
  )
  const tx = r.data.data.transaction
  return {
    ...tx,
    amount: typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount ?? 0)),
  }
}

// Backend returns { success, data: Transaction[], meta } — a flat array, not a
// paginated envelope.  Normalize here so callers always get TransactionListResponse.
export const transactionsApi = {
  list: async (params?: {
    page?: number
    limit?: number
    type?: string
    status?: string
  }): Promise<TransactionListResponse> => {
    const r = await apiClient.get<{ success: boolean; data: Transaction[] }>(
      '/transactions',
      { params }
    )
    const data = r.data.data ?? []
    return {
      data,
      total: data.length,
      page:  params?.page  ?? 1,
      limit: params?.limit ?? 20,
    }
  },

  get: (reference: string): Promise<Transaction> =>
    apiClient
      .get<ApiResponse<Transaction>>(`/transactions/${reference}`)
      .then((r) => r.data.data),

  buyAirtime:    (body: AirtimePurchaseInput)          => purchase('airtime',                body),
  buyData:       (body: DataPurchaseInput)             => purchase('data',                   body),
  buyElectricity:(body: ElectricityPurchaseInput)      => purchase('electricity',            body),
  buyCableTv:    (body: CableTvPurchaseInput)          => purchase('cable-tv',               body),
  buyExamPin:    (body: ExamPinPurchaseInput)          => purchase('exam-pin',               body),
  verifyIdentity:(body: IdentityVerificationInput)     => purchase('identity-verification',  body),
}

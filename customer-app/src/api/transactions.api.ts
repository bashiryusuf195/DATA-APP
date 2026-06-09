import { apiClient } from './client'
import type {
  Transaction,
  TransactionListResponse,
  AirtimePurchaseInput,
  DataPurchaseInput,
  ElectricityPurchaseInput,
  ElectricityVerifyInput,
  MeterVerifyResult,
  CableTvPurchaseInput,
  CableTvVerifyInput,
  CableVerifyResult,
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
    page?:      number
    limit?:     number
    type?:      string
    status?:    string
    date_from?: string
    date_to?:   string
    reference?: string
    search?:    string
  }): Promise<TransactionListResponse> => {
    const r = await apiClient.get<{
      success: boolean
      data:    Transaction[]
      meta:    { total: number; page: number; limit: number; pages: number }
    }>('/transactions', { params })
    return {
      data:  r.data.data  ?? [],
      total: r.data.meta?.total ?? (r.data.data?.length ?? 0),
      page:  r.data.meta?.page  ?? (params?.page  ?? 1),
      limit: r.data.meta?.limit ?? (params?.limit ?? 20),
    }
  },

  get: (reference: string): Promise<Transaction> =>
    apiClient
      .get<ApiResponse<Transaction>>(`/transactions/${reference}`)
      .then((r) => r.data.data),

  buyAirtime:    (body: AirtimePurchaseInput)          => purchase('airtime',                body),
  buyData:       (body: DataPurchaseInput)             => purchase('data',                   body),
  buyElectricity:(body: ElectricityPurchaseInput)      => purchase('electricity',            body),
  verifyMeter:   async (body: ElectricityVerifyInput): Promise<MeterVerifyResult> => {
    const r = await apiClient.post<ApiResponse<MeterVerifyResult>>(
      '/transactions/electricity/verify',
      body
    )
    return r.data.data
  },
  buyCableTv:    (body: CableTvPurchaseInput)          => purchase('cable-tv',               body),
  verifyCable:   async (body: CableTvVerifyInput): Promise<CableVerifyResult> => {
    const r = await apiClient.post<ApiResponse<CableVerifyResult>>(
      '/transactions/cable-tv/verify',
      body
    )
    return r.data.data
  },
  buyExamPin:    (body: ExamPinPurchaseInput)          => purchase('exam-pin',               body),
  verifyIdentity:(body: IdentityVerificationInput)     => purchase('identity-verification',  body),

  downloadReport: async (reference: string): Promise<void> => {
    const resp = await apiClient.get(
      `/transactions/identity-verification/${reference}/report`,
      { responseType: 'blob' },
    )
    const blob   = new Blob([resp.data as BlobPart], { type: 'application/pdf' })
    const objUrl = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href       = objUrl
    a.download   = `verification-${reference}.pdf`
    a.click()
    URL.revokeObjectURL(objUrl)
  },

  /** Download a PDF receipt for any transaction type. */
  downloadReceipt: async (reference: string): Promise<void> => {
    const resp = await apiClient.get(
      `/transactions/${reference}/receipt`,
      { responseType: 'blob' },
    )
    const blob   = new Blob([resp.data as BlobPart], { type: 'application/pdf' })
    const objUrl = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href       = objUrl
    a.download   = `hivedata-receipt-${reference}.pdf`
    a.click()
    URL.revokeObjectURL(objUrl)
  },
}

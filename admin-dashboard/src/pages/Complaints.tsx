import { TicketsPage } from './Tickets'

// Complaints = support tickets filtered to category 'complaint'.
// All filtering, pagination, and CRUD is handled by TicketsPage.
export function ComplaintsPage() {
  return <TicketsPage defaultCategory="complaint" />
}

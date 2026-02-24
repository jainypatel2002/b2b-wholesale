import { redirect } from 'next/navigation'

export default async function ProfitPage() {
  // Redirect legacy /profit route to the unified Profit Center
  redirect('/distributor/analytics/profit')
}

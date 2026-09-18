import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { seedLots, SeedLot } from '../../api/client'
import { useNotificationStore } from '../../store/notificationStore'

export const LOW_STOCK_THRESHOLD_GRAMS = 50.0

export function useLowStockAlerts() {
  const pushNotification = useNotificationStore((s) => s.push)
  const notifiedLotIdsRef = useRef<Set<number>>(new Set())

  const query = useQuery<SeedLot[]>({
    queryKey: ['seed-lots', 'low-stock'],
    queryFn: () => seedLots.getLowStock(LOW_STOCK_THRESHOLD_GRAMS),
    staleTime: 60_000,
  })

  const lowStockLots = query.data ?? []

  useEffect(() => {
    if (lowStockLots.length > 0) {
      lowStockLots.forEach((lot) => {
        if (!notifiedLotIdsRef.current.has(lot.id)) {
          notifiedLotIdsRef.current.add(lot.id)
          pushNotification({
            title: `Low Seed Stock: ${lot.lot_code}`,
            text: `Seed lot ${lot.lot_code} (${lot.germplasm_name}) is low on stock: ${lot.quantity_grams}g remaining (threshold: ${LOW_STOCK_THRESHOLD_GRAMS}g).`,
            kind: 'stock',
          })
        }
      })
    }
  }, [lowStockLots, pushNotification])

  return query
}

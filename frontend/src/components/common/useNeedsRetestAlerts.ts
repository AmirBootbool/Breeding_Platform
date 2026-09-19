import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { seedLots, SeedLot } from '../../api/client'
import { useNotificationStore } from '../../store/notificationStore'

export function useNeedsRetestAlerts() {
  const pushNotification = useNotificationStore((s) => s.push)
  const notifiedLotIdsRef = useRef<Set<number>>(new Set())

  const query = useQuery<SeedLot[]>({
    queryKey: ['seed-lots', 'needs-retest'],
    queryFn: () => seedLots.getNeedsRetest(),
    staleTime: 60_000,
  })

  const retestLots = query.data ?? []

  useEffect(() => {
    if (retestLots.length > 0) {
      retestLots.forEach((lot) => {
        if (!notifiedLotIdsRef.current.has(lot.id)) {
          notifiedLotIdsRef.current.add(lot.id)
          pushNotification({
            title: `Viability Retest Required: ${lot.lot_code}`,
            text: `Seed lot ${lot.lot_code} (${lot.germplasm_name}) has not had a germination test in over 12 months or lacks viability records.`,
            kind: 'stock',
          })
        }
      })
    }
  }, [retestLots, pushNotification])

  return query
}

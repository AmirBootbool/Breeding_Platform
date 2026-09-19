import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { trials, Trial } from '../../api/client'
import { useNotificationStore } from '../../store/notificationStore'

export function useNeedsAttentionTrials() {
  const pushNotification = useNotificationStore((s) => s.push)
  const notifiedTrialIdsRef = useRef<Set<number>>(new Set())

  const query = useQuery<Trial[]>({
    queryKey: ['trials', 'needs-attention'],
    queryFn: () => trials.needsAttention(),
    staleTime: 60_000,
  })

  const staleTrials = query.data ?? []

  useEffect(() => {
    if (staleTrials.length > 0) {
      staleTrials.forEach((trial) => {
        if (!notifiedTrialIdsRef.current.has(trial.id)) {
          notifiedTrialIdsRef.current.add(trial.id)
          pushNotification({
            title: `No observations yet: ${trial.trial_code}`,
            text: `${trial.trial_code} (${trial.name}) was planted over 21 days ago but has no recorded observations.`,
            kind: 'qc',
          })
        }
      })
    }
  }, [staleTrials, pushNotification])

  return query
}

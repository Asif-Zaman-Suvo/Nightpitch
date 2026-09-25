"use client"

import { useRouter } from "next/navigation"
import { field, label } from "@/src/components/maker/styles"

export function StandingsFilters({
  publicId,
  stages,
  stageId,
  groups,
  groupId,
}: {
  publicId: string
  stages: { id: string; name: string }[]
  stageId: string
  groups: { id: string; name: string }[]
  groupId: string | null
}) {
  const router = useRouter()
  const fieldClass = `${field} block`

  function show(nextStage: string, nextGroup: string | null) {
    const params = new URLSearchParams({ stage: nextStage })
    if (nextGroup) params.set("group", nextGroup)
    router.push(`/t/${publicId}/manage/standings?${params.toString()}`)
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => event.preventDefault()}>
      <label className={`${label} min-w-48`}>
        Stage
        <select
          className={fieldClass}
          value={stageId}
          onChange={(event) => show(event.target.value, null)}
        >
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </label>
      {groups.length > 0 && (
        <label className={`${label} min-w-48`}>
          Group
          <select
            className={fieldClass}
            value={groupId ?? groups[0]?.id}
            onChange={(event) => show(stageId, event.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </form>
  )
}

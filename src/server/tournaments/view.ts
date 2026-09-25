import "server-only"
import { notFound } from "next/navigation"
import { canAccess, type TournamentRole } from "@/src/domain/tournament/access"
import { getCurrentUser } from "@/src/server/auth/session"
import { findTournament, type TournamentRow } from "@/src/server/tournaments/repository"

export async function loadVisibleTournament(
  publicId: string,
  action: "view" | "update",
): Promise<{ tournament: TournamentRow; role: TournamentRole | null }> {
  const [tournament, user] = await Promise.all([findTournament(publicId), getCurrentUser()])
  const role: TournamentRole | null =
    tournament && user && tournament.ownerId === user.id ? "owner" : null

  if (
    !tournament ||
    !canAccess({
      role,
      action,
      status: tournament.status,
      visibility: tournament.visibility,
      deleted: tournament.deletedAt !== null,
    })
  ) {
    notFound()
  }

  return { tournament, role }
}

import { LoadingState } from "@/src/components/maker/LoadingState"
import { PageFrame } from "@/src/components/maker/PageFrame"

export default function PublicTournamentLoading() {
  return <PageFrame width="wide"><LoadingState label="Loading match center" /></PageFrame>
}

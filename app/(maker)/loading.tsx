import { LoadingState } from "@/src/components/maker/LoadingState"
import { PageFrame } from "@/src/components/maker/PageFrame"

export default function MakerLoading() {
  return <PageFrame width="wide"><LoadingState label="Loading your workspace" /></PageFrame>
}

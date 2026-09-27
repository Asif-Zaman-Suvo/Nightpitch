import Image from "next/image"

const photos = {
  night: { src: "/pitch/night.png", alt: "Floodlit cage pitch at night" },
  cage: { src: "/pitch/cage.png", alt: "Covered pitch in daylight" },
  corner: { src: "/pitch/corner.png", alt: "Corner arc on artificial turf" },
  stripes: { src: "/pitch/stripes.jpg", alt: "Striped pitch with a center circle" },
} as const

export type PitchName = keyof typeof photos

export function PitchPhoto({
  name,
  className = "object-cover",
  priority = false,
  sizes,
}: {
  name: PitchName
  className?: string
  priority?: boolean
  sizes: string
}) {
  const photo = photos[name]
  return (
    <Image
      src={photo.src}
      alt={photo.alt}
      fill
      priority={priority}
      sizes={sizes}
      className={className}
    />
  )
}

import Image from "next/image"

export function Banner() {
  return (
    <div className="w-full bg-white border-b border-gray-200">
      <div className="relative w-full h-48 md:h-64 lg:h-80">
        <Image
          src="/images/mandalart-cover.png"
          alt="Mandalart Goal Planning - Visualize your dreams and goals"
          fill
          className="object-cover object-center"
          priority
        />
      </div>
    </div>
  )
}

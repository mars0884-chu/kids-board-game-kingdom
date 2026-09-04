import elephantHead from './assets/animal-elephant-head.png'
import lionHead from './assets/animal-lion-head.png'
import tigerHead from './assets/animal-tiger-head.png'
import leopardHead from './assets/animal-leopard-head.png'
import wolfHead from './assets/animal-wolf-head.png'
import dogHead from './assets/animal-dog-head.png'
import catHead from './assets/animal-cat-head.png'
import mouseHead from './assets/animal-mouse-head.png'
import type { AnimalKind, AnimalPlayer } from './rules'

interface AnimalIconProps {
  kind: AnimalKind
  owner: AnimalPlayer
}

const animalHeads: Record<AnimalKind, string> = {
  elephant: elephantHead,
  lion: lionHead,
  tiger: tigerHead,
  leopard: leopardHead,
  wolf: wolfHead,
  dog: dogHead,
  cat: catHead,
  mouse: mouseHead,
}

export function AnimalIcon({ kind, owner }: AnimalIconProps) {
  return (
    <span
      className={`animal-piece animal-piece--${owner}`}
      role="img"
      aria-hidden="true"
      data-animal-kind={kind}
      data-animal-owner={owner}
    >
      <span className={`animal-icon animal-icon--${kind}`} style={{ backgroundImage: `url(${animalHeads[kind]})` }} />
      <span className="animal-piece__owner-mark" aria-hidden="true" />
    </span>
  )
}

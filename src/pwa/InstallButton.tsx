import { useEffect, useState } from 'react'
import { BopomofoText } from '../components/BopomofoText'
import { getChildText } from '../content/child-text'

export function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', capturePrompt)
    return () => window.removeEventListener('beforeinstallprompt', capturePrompt)
  }, [])

  if (!installPrompt) {
    return null
  }

  const install = async () => {
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  return (
    <button className="secondary-button home-install-button" type="button" onClick={install}>
      <span aria-hidden="true">＋</span>
      <BopomofoText entry={getChildText('pwa.install')} />
    </button>
  )
}

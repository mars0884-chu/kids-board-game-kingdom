import { useRegisterSW } from 'virtual:pwa-register/react'
import { BopomofoText } from '../components/BopomofoText'
import { getChildText } from '../content/child-text'

export function UpdatePrompt() {
  const localVerification = new URLSearchParams(window.location.search).get('verification') === '1'

  return <RegisteredUpdatePrompt hidden={localVerification} />
}

function RegisteredUpdatePrompt({ hidden = false }: { hidden?: boolean }) {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (hidden || (!offlineReady && !needRefresh)) {
    return null
  }

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <aside className="pwa-notice" aria-live="polite" aria-atomic="true">
      <BopomofoText
        as="p"
        entry={getChildText(needRefresh ? 'pwa.update_ready' : 'pwa.offline_ready')}
      />
      <div className="pwa-notice__actions">
        {needRefresh ? (
          <button className="primary-button primary-button--small" type="button" onClick={() => updateServiceWorker(true)}>
            <BopomofoText entry={getChildText('pwa.update_now')} />
          </button>
        ) : null}
        <button className="quiet-button" type="button" onClick={close}>
          <BopomofoText entry={getChildText('common.later')} />
        </button>
      </div>
    </aside>
  )
}
